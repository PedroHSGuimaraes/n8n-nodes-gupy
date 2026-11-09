import type { ILoadOptionsFunctions, INodeListSearchResult } from 'n8n-workflow';

import { buildRequest, readCredentials, withQuery } from './api/buildRequest';
import { GupyInputError } from './api/errors';
import { sendPrepared } from './api/transport';
import { loadCatalog } from './spec/load';

function textParameter(ctx: ILoadOptionsFunctions, name: string): string {
	const raw = ctx.getNodeParameter(name, '') as unknown;
	if (typeof raw === 'string') return raw.trim();
	if (raw && typeof raw === 'object' && 'value' in raw) {
		const value = (raw as { value?: unknown }).value;
		return value === undefined || value === null ? '' : String(value).trim();
	}
	return '';
}

function rowLabel(row: Record<string, unknown>): string {
	const candidate = row.candidate;
	if (candidate && typeof candidate === 'object') {
		const name = (candidate as { name?: unknown }).name;
		if (typeof name === 'string' && name.trim()) return name;
	}
	for (const key of ['name', 'title', 'code', 'action', 'email']) {
		const value = row[key];
		if (typeof value === 'string' && value.trim()) return value;
	}
	return row.id === undefined ? 'Item' : String(row.id);
}

async function searchOperation(
	this: ILoadOptionsFunctions,
	operationId: string,
	filter: string | undefined,
	extra: Record<string, string>,
): Promise<INodeListSearchResult> {
	const catalog = loadCatalog();
	const operation = catalog.operations.find((item) => item.id === operationId);
	if (!operation) throw new GupyInputError(`A operação ${operationId} não está no catálogo.`);
	for (const [name, value] of Object.entries(extra)) {
		if (!value) throw new GupyInputError(`Informe ${name} antes de buscar a lista.`);
	}
	const values: Record<string, unknown> = {};
	for (const field of operation.fields) {
		if (field.location === 'path' && extra[field.name]) values[field.formName] = extra[field.name];
		if (filter && field.location === 'query' && (field.name === 'name' || field.name === 'q')) {
			values[field.formName] = filter;
		}
	}
	const credentials = readCredentials(await this.getCredentials('gupyApi'));
	const prepared = buildRequest(operation, values, credentials);
	const query: Record<string, string | number> = {};
	if (operation.pagination.style === 'page') {
		query[operation.pagination.pageParam ?? 'page'] = 1;
		if (operation.pagination.sizeParam) query[operation.pagination.sizeParam] = Math.min(20, operation.pagination.sizeMax ?? 20);
	}
	const body = await sendPrepared(this, { ...prepared, url: withQuery(prepared.url, query) }, []);
	const path = operation.pagination.itemsPath ?? ['results'];
	let cursor: unknown = body;
	for (const key of path) {
		if (!cursor || typeof cursor !== 'object') break;
		cursor = (cursor as Record<string, unknown>)[key];
	}
	const rows = Array.isArray(cursor) ? cursor : [];
	return {
		results: rows
			.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object' && 'id' in row)
			.map((row) => ({ name: rowLabel(row), value: String(row.id) })),
	};
}

function currentOperation(this: ILoadOptionsFunctions): string {
	return textParameter(this, 'operation');
}

export async function searchJobs(this: ILoadOptionsFunctions, filter?: string): Promise<INodeListSearchResult> {
	return searchOperation.call(this, 'findJobs', filter, {});
}

export async function searchApplications(this: ILoadOptionsFunctions, filter?: string): Promise<INodeListSearchResult> {
	const operation = currentOperation.call(this);
	return searchOperation.call(this, 'findApplications', filter, { jobId: textParameter(this, `${operation}__jobId`) });
}

export async function searchSteps(this: ILoadOptionsFunctions, filter?: string): Promise<INodeListSearchResult> {
	const operation = currentOperation.call(this);
	return searchOperation.call(this, 'findSteps', filter, { jobId: textParameter(this, `${operation}__jobId`) });
}

export async function searchDepartments(this: ILoadOptionsFunctions, filter?: string): Promise<INodeListSearchResult> {
	return searchOperation.call(this, 'getDepartments', filter, {});
}

export async function searchRoles(this: ILoadOptionsFunctions, filter?: string): Promise<INodeListSearchResult> {
	return searchOperation.call(this, 'getRoles', filter, {});
}

export async function searchBranches(this: ILoadOptionsFunctions, filter?: string): Promise<INodeListSearchResult> {
	return searchOperation.call(this, 'getBranches', filter, {});
}

export async function searchCareerPages(this: ILoadOptionsFunctions, filter?: string): Promise<INodeListSearchResult> {
	return searchOperation.call(this, 'findCareerPages', filter, {});
}

export async function searchVacancies(this: ILoadOptionsFunctions, filter?: string): Promise<INodeListSearchResult> {
	const operation = currentOperation.call(this);
	return searchOperation.call(this, 'findVacancies', filter, { jobId: textParameter(this, `${operation}__jobId`) });
}

export async function searchWebhooks(this: ILoadOptionsFunctions, filter?: string): Promise<INodeListSearchResult> {
	return searchOperation.call(this, 'findWebhooks', filter, {});
}

export async function searchUsers(this: ILoadOptionsFunctions, filter?: string): Promise<INodeListSearchResult> {
	return searchOperation.call(this, 'getUsers', filter, {});
}

export async function searchDismissals(this: ILoadOptionsFunctions, filter?: string): Promise<INodeListSearchResult> {
	return searchOperation.call(this, 'getDismissals', filter, {});
}

export async function searchTags(this: ILoadOptionsFunctions, filter?: string): Promise<INodeListSearchResult> {
	const operation = currentOperation.call(this);
	return searchOperation.call(this, 'findApplicationTags', filter, {
		jobId: textParameter(this, `${operation}__jobId`),
		applicationId: textParameter(this, `${operation}__applicationId`),
	});
}

export async function searchJobTemplates(this: ILoadOptionsFunctions, filter?: string): Promise<INodeListSearchResult> {
	return searchOperation.call(this, 'list', filter, {});
}

export async function searchEmailTemplates(this: ILoadOptionsFunctions, filter?: string): Promise<INodeListSearchResult> {
	return searchOperation.call(this, 'findEmailTemplates', filter, {});
}
