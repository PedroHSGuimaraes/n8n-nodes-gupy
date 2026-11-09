import {
	NodeConnectionTypes,
	NodeOperationError,
	type IDataObject,
	type IHookFunctions,
	type INodeType,
	type INodeTypeDescription,
	type IWebhookFunctions,
	type IWebhookResponseData,
} from 'n8n-workflow';

import { GupyApiError } from '../Gupy/api/errors';
import type { GupyCaller } from '../Gupy/api/transport';
import { displayName } from '../Gupy/description/labels';
import {
	ABOUT_ONLY_EVENT,
	createWebhook,
	deleteWebhook,
	documentedWebhookActions,
	evaluateWebhook,
	listWebhooks,
	registerableActions,
	webhookCreateValues,
} from './webhook';

function caller(ctx: IHookFunctions): GupyCaller {
	return {
		getCredentials: (type) => ctx.getCredentials(type),
		helpers: {
			httpRequest: (options) => ctx.helpers.httpRequest(options),
		},
	};
}

function productionUrl(ctx: IHookFunctions): string {
	const reader = ctx as IHookFunctions & {
		getNodeWebhookUrl?: (name: string) => string | undefined;
		getWebhookUrl?: () => string | undefined;
	};
	const url = reader.getNodeWebhookUrl?.('default') ?? reader.getWebhookUrl?.();
	if (!url) throw new NodeOperationError(ctx.getNode(), 'O n8n não informou a URL de produção do webhook.');
	return url;
}

function staticHooks(ctx: IHookFunctions | IWebhookFunctions): { hooks: Record<string, string>; seen: string[] } {
	const data = ctx.getWorkflowStaticData('node') as { hooks?: Record<string, string>; seen?: string[] };
	data.hooks ??= {};
	data.seen ??= [];
	return data as { hooks: Record<string, string>; seen: string[] };
}

function selectedEvents(ctx: IHookFunctions): string[] {
	const events = ctx.getNodeParameter('events', []) as string[];
	return Array.isArray(events) ? events : [];
}

function owner(ctx: IHookFunctions): { name: string; email: string; secret: string } {
	const name = ctx.getNodeParameter('techOwnerName', '') as string;
	const email = ctx.getNodeParameter('techOwnerEmail', '') as string;
	const secret = ctx.getNodeParameter('verificationSecret', '') as string;
	return { name: name.trim(), email: email.trim(), secret: secret.trim() };
}

function headerValue(headers: IDataObject, name: string): string | undefined {
	const match = Object.keys(headers).find((key) => key.toLowerCase() === name.toLowerCase());
	if (!match) return undefined;
	const value = headers[match];
	if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : undefined;
	return typeof value === 'string' ? value : undefined;
}

async function rawBodyOf(req: { rawBody?: Buffer | string; readRawBody?: () => Promise<void> }): Promise<string | undefined> {
	if (req.rawBody === undefined && typeof req.readRawBody === 'function') await req.readRawBody();
	if (typeof req.rawBody === 'string') return req.rawBody;
	if (Buffer.isBuffer(req.rawBody)) return req.rawBody.toString('utf8');
	return undefined;
}

const eventOptions = [
	...documentedWebhookActions().map((event) => ({
		name: displayName(event),
		value: event,
		description: `Documented webhook action ${event}`,
	})),
	{
		name: 'Application Pre Hiring Information Filled',
		value: ABOUT_ONLY_EVENT,
		description:
			'Documented on the webhooks about page. POST /webhooks does not list this action, so activation cannot register it.',
	},
];

export class GupyTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Gupy Trigger',
		name: 'gupyTrigger',
		icon: { light: 'file:gupy.svg', dark: 'file:gupy.dark.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["events"]}}',
		description:
			'Receives official Gupy webhooks and registers one subscription per selected action on activation.',
		defaults: { name: 'Gupy Trigger' },
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'gupyApi', required: true }],
		codex: {
			categories: ['Productivity'],
			resources: {
				primaryDocumentation: [{ url: 'https://developers.gupy.io/reference/webhooks' }],
			},
		},
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'gupy',
			},
		],
		properties: [
			{
				displayName:
					'Gupy does not document an HMAC signature. A verification secret is sent and checked as the raw Authorization header. The production URL must be public HTTPS, and Gupy expects HTTP 200 within 30 seconds. Delivery is at least once and unordered.',
				name: 'webhookNotice',
				type: 'notice',
				default: '',
			},
			{
				displayName: 'Events',
				name: 'events',
				type: 'multiOptions',
				options: eventOptions,
				default: ['application.created'],
				description: 'One POST /webhooks subscription is created for each selected action',
			},
			{
				displayName: 'Tech Owner Name',
				name: 'techOwnerName',
				type: 'string',
				default: '',
				description: 'Optional technical owner sent as techOwnerName',
			},
			{
				displayName: 'Tech Owner Email',
				name: 'techOwnerEmail',
				type: 'string',
				default: '',
				placeholder: 'name@company.com',
				description: 'Optional technical owner email sent as techOwnerEmail',
			},
			{
				displayName: 'Verification Secret',
				name: 'verificationSecret',
				type: 'string',
				typeOptions: { password: true },
				default: '',
				description:
					'Optional value stored in clientHeaders Authorization. Inbound calls must send that exact header. This is not an HMAC signature',
			},
		],
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const wanted = registerableActions(selectedEvents(this));
				if (wanted.length === 0) return false;
				try {
					const url = productionUrl(this);
					const listed = await listWebhooks(caller(this));
					const hooks = staticHooks(this);
					let complete = true;
					for (const action of wanted) {
						const found = listed.find((item) => item.action === action && item.postbackUrl === url);
						if (!found) complete = false;
						else hooks.hooks[action] = found.id;
					}
					return complete;
				} catch (error) {
					void error;
					return false;
				}
			},
			async create(this: IHookFunctions): Promise<boolean> {
				const selected = selectedEvents(this);
				const wanted = registerableActions(selected);
				if (wanted.length === 0) {
					throw new NodeOperationError(
						this.getNode(),
						'Nenhum evento selecionado pode ser registrado. application.pre-hiring-information-filled está documentado na página de webhooks, mas não no enum de POST /webhooks.',
					);
				}
				const url = productionUrl(this);
				const details = owner(this);
				const listed = await listWebhooks(caller(this));
				const hooks = staticHooks(this);
				for (const action of wanted) {
					const found = listed.find((item) => item.action === action && item.postbackUrl === url);
					if (found) {
						hooks.hooks[action] = found.id;
						continue;
					}
					hooks.hooks[action] = await createWebhook(
						caller(this),
						webhookCreateValues(url, action, details.name, details.email, details.secret),
					);
				}
				return true;
			},
			async delete(this: IHookFunctions): Promise<boolean> {
				const hooks = staticHooks(this);
				for (const id of Object.values(hooks.hooks)) {
					try {
						await deleteWebhook(caller(this), id);
					} catch (error) {
						if (error instanceof GupyApiError && error.status === 404) continue;
						const message = error instanceof Error ? error.message : 'Falha ao remover o webhook.';
						throw new NodeOperationError(this.getNode(), message);
					}
				}
				hooks.hooks = {};
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const secret = (this.getNodeParameter('verificationSecret', '') as string).trim();
		const allowed = this.getNodeParameter('events', []) as string[];
		const req = this.getRequestObject() as { rawBody?: Buffer | string; readRawBody?: () => Promise<void> };
		const decision = evaluateWebhook({
			rawBody: await rawBodyOf(req),
			authorization: headerValue(this.getHeaderData(), 'authorization'),
			secret,
			allowed: Array.isArray(allowed) ? allowed : [],
			seen: staticHooks(this).seen,
		});
		if (!decision.emit || !decision.body) {
			this.getResponseObject().status(decision.status).json({ message: decision.message });
			return { noWebhookResponse: true };
		}
		const id = typeof decision.body.id === 'string' ? decision.body.id : '';
		if (id) {
			const state = staticHooks(this);
			state.seen = [...state.seen, id].slice(-1000);
		}
		return { workflowData: [[{ json: decision.body as IDataObject }]] };
	}
}
