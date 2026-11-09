import { buildRequest, readCredentials } from '../Gupy/api/buildRequest';
import { GupyInputError } from '../Gupy/api/errors';
import type { GupyCaller } from '../Gupy/api/transport';
import { executeOperation } from '../Gupy/api/transport';
import { loadCatalog } from '../Gupy/spec/load';

export const ABOUT_ONLY_EVENT = 'application.pre-hiring-information-filled';

export interface WebhookDecision {
	status: number;
	message: string;
	emit: boolean;
	duplicate: boolean;
	body?: Record<string, unknown>;
}

export function documentedWebhookActions(): string[] {
	const operation = loadCatalog().operations.find((item) => item.id === 'createWebhook');
	const field = operation?.fields.find((item) => item.name === 'action');
	return (field?.options ?? []).map((option) => String(option.value));
}

export function registerableActions(selected: string[]): string[] {
	const documented = new Set(documentedWebhookActions());
	return selected.filter((event) => documented.has(event));
}

function fieldName(operationId: string, name: string): string {
	const operation = loadCatalog().operations.find((item) => item.id === operationId);
	const field = operation?.fields.find((item) => item.name === name);
	if (!field?.formName) throw new GupyInputError(`O campo ${name} não está em ${operationId}.`);
	return field.formName;
}

export function webhookCreateValues(
	url: string,
	action: string,
	ownerName: string,
	ownerEmail: string,
	secret: string,
): Record<string, unknown> {
	const values: Record<string, unknown> = {
		[fieldName('createWebhook', 'action')]: action,
		[fieldName('createWebhook', 'postbackUrl')]: url,
		[fieldName('createWebhook', 'status')]: 'active',
	};
	if (ownerName) values[fieldName('createWebhook', 'techOwnerName')] = ownerName;
	if (ownerEmail) values[fieldName('createWebhook', 'techOwnerEmail')] = ownerEmail;
	const headers = [{ key: 'Content-Type', value: 'application/json;charset=utf-8' }];
	if (secret) headers.push({ key: 'Authorization', value: secret });
	values[fieldName('createWebhook', 'clientHeaders')] = { item: headers };
	return values;
}

export function evaluateWebhook(input: {
	rawBody: string | undefined;
	authorization: string | undefined;
	secret: string;
	allowed: string[];
	seen: string[];
}): WebhookDecision {
	if (input.secret && input.authorization !== input.secret) {
		return { status: 401, message: 'Authorization do webhook não confere.', emit: false, duplicate: false };
	}
	if (!input.rawBody) {
		return { status: 400, message: 'O webhook chegou sem corpo.', emit: false, duplicate: false };
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(input.rawBody) as unknown;
	} catch {
		return { status: 400, message: 'O corpo do webhook não é JSON.', emit: false, duplicate: false };
	}
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
		return { status: 400, message: 'O webhook precisa ser um objeto JSON.', emit: false, duplicate: false };
	}
	const body = parsed as Record<string, unknown>;
	const event = typeof body.event === 'string' ? body.event : '';
	if (!event) {
		return { status: 400, message: 'O webhook não trouxe event.', emit: false, duplicate: false };
	}
	if (input.allowed.length > 0 && !input.allowed.includes(event)) {
		return { status: 200, message: 'Evento fora do filtro.', emit: false, duplicate: false, body };
	}
	const id = typeof body.id === 'string' ? body.id : '';
	if (id && input.seen.includes(id)) {
		return { status: 200, message: 'Evento duplicado.', emit: false, duplicate: true, body };
	}
	return { status: 200, message: 'ok', emit: true, duplicate: false, body };
}

interface ListedWebhook {
	id: string;
	action: string;
	postbackUrl: string;
}

function asWebhook(row: unknown): ListedWebhook | undefined {
	if (!row || typeof row !== 'object') return undefined;
	const record = row as { id?: unknown; action?: unknown; postbackUrl?: unknown; postBackUrl?: unknown };
	if (record.id === undefined || typeof record.action !== 'string') return undefined;
	const url = typeof record.postbackUrl === 'string' ? record.postbackUrl : '';
	const alias = typeof record.postBackUrl === 'string' ? record.postBackUrl : '';
	return { id: String(record.id), action: record.action, postbackUrl: url || alias };
}

export async function listWebhooks(ctx: GupyCaller): Promise<ListedWebhook[]> {
	const operation = loadCatalog().operations.find((item) => item.id === 'findWebhooks');
	if (!operation) throw new GupyInputError('findWebhooks não está no catálogo.');
	const rows = await executeOperation(ctx, operation, {}, { returnAll: true, limit: 50, maxPages: 20 });
	return (Array.isArray(rows) ? rows : []).map(asWebhook).filter((row): row is ListedWebhook => Boolean(row));
}

export async function createWebhook(ctx: GupyCaller, values: Record<string, unknown>): Promise<string> {
	const operation = loadCatalog().operations.find((item) => item.id === 'createWebhook');
	if (!operation) throw new GupyInputError('createWebhook não está no catálogo.');
	const created = await executeOperation(ctx, operation, values, { returnAll: false, limit: 1, maxPages: 1 });
	if (!created || typeof created !== 'object' || !('id' in created) || (created as { id?: unknown }).id === undefined) {
		throw new GupyInputError('A Gupy não devolveu o id do webhook.');
	}
	return String((created as { id: unknown }).id);
}

export async function deleteWebhook(ctx: GupyCaller, id: string): Promise<void> {
	const operation = loadCatalog().operations.find((item) => item.id === 'deleteWebhook');
	if (!operation) throw new GupyInputError('deleteWebhook não está no catálogo.');
	const values = { [fieldName('deleteWebhook', 'webhookId')]: id };
	await executeOperation(ctx, operation, values, { returnAll: false, limit: 1, maxPages: 1 });
}

export function registrationBody(url: string, action: string, secret: string): Record<string, unknown> {
	const credentials = readCredentials({});
	const operation = loadCatalog().operations.find((item) => item.id === 'createWebhook');
	if (!operation) throw new GupyInputError('createWebhook não está no catálogo.');
	const prepared = buildRequest(
		operation,
		webhookCreateValues(url, action, '', '', secret),
		{ ...credentials, recruitmentToken: 'token' },
	);
	return (prepared.body ?? {}) as Record<string, unknown>;
}
