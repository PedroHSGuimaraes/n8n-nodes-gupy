import { sleep, type IDataObject, type IHttpRequestOptions } from 'n8n-workflow';

import { buildRequest, readCredentials, withQuery } from './buildRequest';
import { GupyApiError, redact } from './errors';
import { collectList, type PageOptions } from './paginate';
import type { CatalogOperation, PreparedRequest } from '../spec/types';

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 500;
const recentCalls: number[] = [];

export function resetPaceForTests(): void {
	recentCalls.length = 0;
}

export function paceDelay(host: string, now: number, calls: number[] = recentCalls): number {
	if (host !== 'api.gupy.io') return 0;
	while (calls.length > 0 && now - calls[0] >= WINDOW_MS) calls.shift();
	if (calls.length < MAX_PER_WINDOW) return 0;
	return WINDOW_MS - (now - calls[0]) + 50;
}

export function shouldRetry(write: boolean, status: number | undefined, network: boolean): boolean {
	if (write) return false;
	if (network) return true;
	return status === 429 || status === 502 || status === 504;
}

export function backoffMs(attempt: number, retryAfterSeconds?: number): number {
	const exponential = Math.min(500 * 2 ** (attempt - 1), 8000);
	if (retryAfterSeconds === undefined) return exponential;
	return Math.min(Math.max(retryAfterSeconds, 0) * 1000, 60_000);
}

export interface GupyCaller {
	getCredentials(type: string): Promise<IDataObject>;
	helpers: {
		httpRequest(options: IHttpRequestOptions): Promise<unknown>;
	};
}

function statusOf(error: unknown): number | undefined {
	if (!error || typeof error !== 'object') return undefined;
	const record = error as {
		statusCode?: number;
		httpCode?: number;
		response?: { status?: number };
	};
	const status = record.statusCode ?? record.httpCode ?? record.response?.status;
	return typeof status === 'number' ? status : undefined;
}

function bodyOf(error: unknown): unknown {
	if (!error || typeof error !== 'object') return undefined;
	const record = error as { response?: { data?: unknown; body?: unknown }; error?: unknown; body?: unknown };
	return record.response?.data ?? record.response?.body ?? record.error ?? record.body;
}

function messageOf(error: unknown, secrets: string[], url: string): string {
	const status = statusOf(error);
	const body = bodyOf(error);
	let detail = '';
	if (body && typeof body === 'object') {
		const record = body as { title?: unknown; detail?: unknown; message?: unknown; error?: unknown };
		const parts = [record.title, record.detail, record.message, record.error].filter(
			(part) => typeof part === 'string' && part.trim(),
		) as string[];
		detail = parts.join(': ');
	} else if (typeof body === 'string') {
		detail = body;
	} else if (error instanceof Error) {
		detail = error.message;
	}
	const parsed = new URL(url);
	parsed.searchParams.delete('secret');
	const where = `${parsed.origin}${parsed.pathname}`;
	const prefix = status ? `Gupy respondeu ${status} em ${where}` : `Falha de rede ao chamar ${where}`;
	return redact(detail ? `${prefix}. ${detail}` : prefix, secrets);
}

function retryAfterSeconds(error: unknown): number | undefined {
	if (!error || typeof error !== 'object') return undefined;
	const headers = (error as { response?: { headers?: Record<string, unknown> } }).response?.headers;
	if (!headers) return undefined;
	const raw = headers['retry-after'] ?? headers['Retry-After'];
	if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
	if (typeof raw === 'string' && /^\d+$/.test(raw)) return Number(raw);
	return undefined;
}

function secretsOf(raw: IDataObject): string[] {
	return Object.values(raw).filter((value): value is string => typeof value === 'string' && value.length > 3);
}

export async function sendPrepared(ctx: GupyCaller, prepared: PreparedRequest, secrets: string[]): Promise<unknown> {
	const host = new URL(prepared.url).host;
	const attempts = prepared.write ? 1 : 4;
	let lastMessage = 'Falha ao chamar a Gupy.';
	for (let attempt = 1; attempt <= attempts; attempt += 1) {
		const wait = paceDelay(host, Date.now());
		if (wait > 0) await sleep(wait);
		if (host === 'api.gupy.io') recentCalls.push(Date.now());
		let caught: unknown;
		try {
			const options: IHttpRequestOptions = {
				method: prepared.method,
				url: prepared.url,
				headers: prepared.headers,
				json: true,
				timeout: 60_000,
			};
			if (prepared.body !== undefined && prepared.method !== 'GET') options.body = prepared.body;
			return await ctx.helpers.httpRequest(options);
		} catch (error) {
			caught = error;
		}
		const status = statusOf(caught);
		const network = status === undefined;
		lastMessage = messageOf(caught, secrets, prepared.url);
		if (attempt === attempts || !shouldRetry(prepared.write, status, network)) {
			throw new GupyApiError(lastMessage, status);
		}
		await sleep(backoffMs(attempt, retryAfterSeconds(caught)));
	}
	throw new GupyApiError(lastMessage);
}

export async function executeOperation(
	ctx: GupyCaller,
	operation: CatalogOperation,
	values: Record<string, unknown>,
	page: PageOptions,
): Promise<unknown> {
	const raw = await ctx.getCredentials('gupyApi');
	const credentials = readCredentials(raw);
	const secrets = secretsOf(raw);
	const prepared = buildRequest(operation, values, credentials);
	if (operation.pagination.style === 'none') {
		return sendPrepared(ctx, prepared, secrets);
	}
	return collectList(
		operation,
		async (query) => {
			const pageRequest: PreparedRequest = { ...prepared, url: withQuery(prepared.url, query) };
			return sendPrepared(ctx, pageRequest, secrets);
		},
		page,
	);
}
