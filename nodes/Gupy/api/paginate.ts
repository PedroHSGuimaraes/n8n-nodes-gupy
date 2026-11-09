import { GupyApiError } from './errors';
import type { CatalogOperation } from '../spec/types';

export interface PageOptions {
	returnAll: boolean;
	limit: number;
	maxPages: number;
}

function readPath(body: unknown, path: string[] | null | undefined): unknown {
	if (!path || path.length === 0) return undefined;
	let cursor: unknown = body;
	for (const key of path) {
		if (!cursor || typeof cursor !== 'object') return undefined;
		cursor = (cursor as Record<string, unknown>)[key];
	}
	return cursor;
}

function asNumber(value: unknown): number | undefined {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
	return undefined;
}

function itemsOf(operation: CatalogOperation, body: unknown): unknown[] {
	const path = operation.pagination.itemsPath ?? ['results'];
	const value = readPath(body, path);
	if (!Array.isArray(value)) {
		throw new GupyApiError(
			`A resposta de ${operation.id} não trouxe a lista em ${path.join('.')}. A lista parcial não foi devolvida.`,
		);
	}
	return value;
}

export async function collectList(
	operation: CatalogOperation,
	fetchPage: (query: Record<string, string | number>) => Promise<unknown>,
	options: PageOptions,
): Promise<unknown[]> {
	if (!Number.isInteger(options.limit) || options.limit < 1) {
		throw new GupyApiError('Limit precisa ser um inteiro maior que zero.');
	}
	if (!Number.isInteger(options.maxPages) || options.maxPages < 1) {
		throw new GupyApiError('Max Pages precisa ser um inteiro maior que zero.');
	}
	const collected: unknown[] = [];
	const seenTokens = new Set<string>();
	let page = 1;
	let token = '';
	const sizeMax = operation.pagination.sizeMax ?? undefined;
	const pageSize = sizeMax ? Math.min(sizeMax, options.returnAll ? sizeMax : options.limit) : undefined;

	for (let attempt = 0; attempt < options.maxPages; attempt += 1) {
		const query: Record<string, string | number> = {};
		if (operation.pagination.style === 'page') {
			query[operation.pagination.pageParam ?? 'page'] = page;
			if (operation.pagination.sizeParam && pageSize) query[operation.pagination.sizeParam] = pageSize;
		} else if (token) {
			query[operation.pagination.pageParam ?? 'pageToken'] = token;
		}
		const body = await fetchPage(query);
		const batch = itemsOf(operation, body);
		collected.push(...batch);
		if (!options.returnAll && collected.length >= options.limit) {
			return collected.slice(0, options.limit);
		}

		if (operation.pagination.style === 'page') {
			const totalPages = asNumber(readPath(body, operation.pagination.totalPagesPath));
			const total = asNumber(readPath(body, operation.pagination.totalPath));
			if (batch.length === 0) {
				const unfinished =
					(totalPages !== undefined && page < totalPages) || (total !== undefined && collected.length < total);
				if (unfinished) {
					throw new GupyApiError('A página veio vazia antes do fim documentado. A lista parcial não foi devolvida.');
				}
				return collected;
			}
			if (totalPages !== undefined) {
				if (page >= totalPages) return collected;
			} else if (total !== undefined) {
				if (collected.length >= total) return collected;
			} else if (pageSize === undefined || batch.length < pageSize) {
				return collected;
			}
			page += 1;
			continue;
		}

		const next = readPath(body, operation.pagination.nextField ? [operation.pagination.nextField] : null);
		if (typeof next !== 'string' || next.length === 0) return collected;
		if (seenTokens.has(next)) {
			throw new GupyApiError('A paginação repetiu o cursor. A lista parcial não foi devolvida.');
		}
		seenTokens.add(next);
		token = next;
	}

	throw new GupyApiError('O limite de páginas acabou antes do fim da lista. A lista parcial não foi devolvida.');
}
