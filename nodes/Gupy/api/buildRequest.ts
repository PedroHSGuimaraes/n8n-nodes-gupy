import { assertNever, GupyInputError } from './errors';
import { displayName } from '../description/labels';
import type {
	CatalogField,
	CatalogOperation,
	GupyCredentials,
	GupyProduct,
	PreparedRequest,
} from '../spec/types';

export function readCredentials(raw: Record<string, unknown>): GupyCredentials {
	const text = (name: string): string => (typeof raw[name] === 'string' ? raw[name].trim() : '');
	return {
		recruitmentToken: text('recruitmentToken'),
		admissionToken: text('admissionToken'),
		adminToken: text('adminToken'),
		userManagementToken: text('userManagementToken'),
		engagementToken: text('engagementToken'),
		educationSecret: text('educationSecret'),
		pathwaysToken: text('pathwaysToken'),
		baseUrl: text('baseUrl'),
	};
}

function tokenFor(product: GupyProduct, credentials: GupyCredentials): string {
	switch (product) {
		case 'recruitment':
			return credentials.recruitmentToken;
		case 'admission':
			return credentials.admissionToken;
		case 'admin':
			return credentials.adminToken;
		case 'userManagement':
			return credentials.userManagementToken;
		case 'engagement':
			return credentials.engagementToken;
		case 'education':
			return '';
		case 'pathways':
			return credentials.pathwaysToken;
		default:
			return assertNever(product, 'Produto');
	}
}

function missingTokenMessage(product: GupyProduct): string {
	switch (product) {
		case 'recruitment':
			return 'Preencha o Recruitment Token na credencial Gupy.';
		case 'admission':
			return 'Preencha o Admission Token na credencial Gupy. Ele é diferente do token de R&S.';
		case 'admin':
			return 'Preencha o Admin Token na credencial Gupy.';
		case 'userManagement':
			return 'Preencha o User Management Token na credencial Gupy.';
		case 'engagement':
			return 'Preencha o Engagement Token na credencial Gupy. Esse produto envia o token cru no header Authorization, sem a palavra Bearer.';
		case 'education':
			return 'Preencha o Education Secret na credencial Gupy.';
		case 'pathways':
			return 'Preencha o Pathways Token na credencial Gupy.';
		default:
			return assertNever(product, 'Produto');
	}
}

export function operationUrl(
	operation: CatalogOperation,
	baseUrl: string | undefined,
	pathValues: Record<string, string>,
): string {
	const server = new URL(operation.server);
	let path = operation.path;
	for (const [key, value] of Object.entries(pathValues)) {
		path = path.split(`{${key}}`).join(encodeURIComponent(value));
	}
	if (path.includes('{')) {
		throw new GupyInputError('Faltou um identificador do caminho da operação.');
	}
	const prefix = server.pathname.replace(/\/$/, '');
	const suffix = path.startsWith('/') ? path : `/${path}`;
	const origin = baseUrl ? new URL(baseUrl).origin : server.origin;
	return `${origin}${prefix}${suffix}`;
}

export function withQuery(
	url: string,
	query: Record<string, string | number | boolean | Array<string | number>>,
): string {
	const parsed = new URL(url);
	for (const [key, value] of Object.entries(query)) {
		if (Array.isArray(value)) {
			for (const item of value) parsed.searchParams.append(key, String(item));
		} else {
			parsed.searchParams.set(key, String(value));
		}
	}
	return parsed.toString();
}

function unwrapList(raw: unknown): unknown[] {
	if (Array.isArray(raw)) return raw;
	if (raw && typeof raw === 'object' && Array.isArray((raw as { item?: unknown }).item)) {
		return (raw as { item: unknown[] }).item;
	}
	return [];
}

function childValue(raw: unknown, child: CatalogField): unknown {
	if (!raw || typeof raw !== 'object') return undefined;
	return (raw as Record<string, unknown>)[child.name];
}

function present(value: unknown): boolean {
	if (value === undefined || value === null) return false;
	if (typeof value === 'string') return value.trim().length > 0;
	if (Array.isArray(value)) return value.length > 0;
	if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length > 0;
	return true;
}

function convertLeaf(field: CatalogField, raw: unknown): unknown {
	if (field.kind === 'number' || field.kind === 'locator') {
		if (typeof raw === 'number') return raw;
		if (typeof raw === 'string' && raw.trim() !== '' && Number.isFinite(Number(raw))) return Number(raw);
		if (field.kind === 'locator' && typeof raw === 'string') return raw.trim();
		return raw;
	}
	if (field.kind === 'boolean') return Boolean(raw);
	if (field.kind === 'multiOptions') {
		return Array.isArray(raw) ? raw.map((item) => String(item)) : [];
	}
	if (field.kind === 'valueList') {
		return unwrapList(raw)
			.map((item) => {
				if (item && typeof item === 'object' && 'value' in item) return (item as { value: unknown }).value;
				return item;
			})
			.filter((item) => present(item));
	}
	if (field.kind === 'freeform' || field.kind === 'freeformList') {
		const object: Record<string, unknown> = {};
		for (const item of unwrapList(raw)) {
			if (!item || typeof item !== 'object') continue;
			const key = (item as { key?: unknown }).key;
			if (typeof key !== 'string' || key.trim() === '') continue;
			object[key] = (item as { value?: unknown }).value ?? '';
		}
		return object;
	}
	if (field.kind === 'objectList') {
		return unwrapList(raw).map((item) => objectFromChildren(field.children ?? [], item));
	}
	if (typeof raw === 'string') return raw.trim();
	return raw;
}

function objectFromChildren(children: CatalogField[], raw: unknown): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	for (const child of children) {
		if (child.kind === 'object') {
			const nested = objectFromChildren(child.children ?? [], childValue(raw, child));
			if (Object.keys(nested).length > 0) result[child.name] = nested;
			continue;
		}
		const value = convertLeaf(child, childValue(raw, child));
		if (present(value)) result[child.name] = value;
	}
	return result;
}

function readField(field: CatalogField, values: Record<string, unknown>): unknown {
	if (field.kind === 'object') {
		const nested: Record<string, unknown> = {};
		let any = false;
		for (const child of field.children ?? []) {
			const value = readField(child, values);
			if (value !== undefined) {
				nested[child.name] = value;
				any = true;
			}
		}
		return any ? nested : undefined;
	}
	if (!present(values[field.formName]) && !field.required) return undefined;
	const converted = convertLeaf(field, values[field.formName]);
	if (!present(converted)) {
		if (field.required) {
			throw new GupyInputError(`Informe ${displayName(field.name)}.`);
		}
		return undefined;
	}
	return converted;
}

export function buildRequest(
	operation: CatalogOperation,
	values: Record<string, unknown>,
	credentials: GupyCredentials,
): PreparedRequest {
	if (credentials.baseUrl) {
		let parsed: URL | undefined;
		try {
			parsed = new URL(credentials.baseUrl);
		} catch {
			parsed = undefined;
		}
		if (!parsed) throw new GupyInputError('A Base URL da credencial precisa ser um endereço absoluto.');
		if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
			throw new GupyInputError('A Base URL da credencial precisa usar http ou https.');
		}
	}

	const query: Record<string, string | number | boolean | Array<string | number>> = {};
	const pathValues: Record<string, string> = {};
	const headers: Record<string, string> = {};
	const bodyObject: Record<string, unknown> = {};
	let bodyArray: unknown[] | undefined;

	for (const field of operation.fields) {
		if (field.hidden || field.location === 'meta') continue;
		const value = readField(field, values);
		const webhookUrl =
			(operation.id === 'createWebhook' || operation.id === 'updateWebhook') && field.name === 'postbackUrl';
		if (value === undefined) {
			if (field.required || webhookUrl) throw new GupyInputError(`Informe ${displayName(field.name)}.`);
			continue;
		}
		if (field.location === 'path') {
			pathValues[field.name] = String(value);
		} else if (field.location === 'query') {
			if (Array.isArray(value)) query[field.name] = value.map((item) => (typeof item === 'number' ? item : String(item)));
			else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') query[field.name] = value;
		} else if (field.location === 'header') {
			headers[field.name] = String(value);
		} else if (field.bodyRoot === 'array' && Array.isArray(value)) {
			bodyArray = value;
		} else if (field.location === 'body') {
			bodyObject[field.name] = value;
		}
	}

	if (operation.auth === 'secretQuery') {
		if (!credentials.educationSecret) throw new GupyInputError(missingTokenMessage('education'));
		query.secret = credentials.educationSecret;
	} else if (operation.auth === 'bearer') {
		const token = tokenFor(operation.product, credentials);
		if (!token) throw new GupyInputError(missingTokenMessage(operation.product));
		headers.Authorization = `Bearer ${token}`;
	} else if (operation.auth === 'authorizationRaw') {
		if (!credentials.engagementToken) throw new GupyInputError(missingTokenMessage('engagement'));
		headers.Authorization = credentials.engagementToken;
	} else {
		assertNever(operation.auth, 'Autenticação');
	}
	headers.Accept = 'application/json';

	if (
		(operation.id === 'createWebhook' || operation.id === 'updateWebhook') &&
		typeof bodyObject.postbackUrl === 'string'
	) {
		// The published schema requires postBackUrl, while the property is postbackUrl.
		bodyObject.postBackUrl = bodyObject.postbackUrl;
	}

	const url = withQuery(operationUrl(operation, credentials.baseUrl || undefined, pathValues), query);
	const hasBody = bodyArray !== undefined || Object.keys(bodyObject).length > 0;
	return {
		method: operation.method,
		url,
		body: hasBody ? (bodyArray ?? bodyObject) : undefined,
		headers,
		write: operation.write,
		operation,
	};
}
