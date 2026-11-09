const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const { buildRequest, readCredentials, withQuery } = require('../dist/nodes/Gupy/api/buildRequest');
const { collectList } = require('../dist/nodes/Gupy/api/paginate');
const { backoffMs, paceDelay, shouldRetry } = require('../dist/nodes/Gupy/api/transport');
const { operationLabels } = require('../dist/nodes/Gupy/description/labels');
const { LIMIT_DESCRIPTION, RETURN_ALL_DESCRIPTION, buildNodeProperties } = require('../dist/nodes/Gupy/description/properties');
const {
	ABOUT_ONLY_EVENT,
	documentedWebhookActions,
	evaluateWebhook,
	registrationBody,
	registerableActions,
} = require('../dist/nodes/GupyTrigger/webhook');

const catalog = JSON.parse(
	fs.readFileSync(path.join(__dirname, '..', 'nodes', 'Gupy', 'spec', 'catalog.json'), 'utf8'),
);
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'operations.json'), 'utf8'));

function credentials(extra = {}) {
	return readCredentials({
		recruitmentToken: 'recruitment-token',
		admissionToken: 'admission-token',
		adminToken: 'admin-token',
		userManagementToken: 'users-token',
		engagementToken: 'engagement-token',
		educationSecret: 'education-secret',
		pathwaysToken: 'pathways-token',
		...extra,
	});
}

function sampleLeaf(field) {
	if (field.kind === 'options') return field.options[0].value;
	if (field.kind === 'multiOptions') return [field.options[0].value];
	if (field.kind === 'boolean') return true;
	if (field.kind === 'number' || field.kind === 'locator') return field.kind === 'locator' ? '10' : 1;
	if (field.kind === 'valueList') {
		const value = field.itemKind === 'number' || field.itemKind === 'integer' ? 1 : 'item';
		return { item: [{ value }] };
	}
	if (field.kind === 'freeform' || field.kind === 'freeformList') return { item: [{ key: 'custom', value: '1' }] };
	if (field.kind === 'objectList') return { item: [sampleObject(field.children || [])] };
	return 'sample';
}

function sampleObject(children) {
	const result = {};
	for (const child of children) {
		if (child.kind === 'object') {
			result[child.name] = sampleObject(child.children || []);
		} else if (child.required) {
			result[child.name] = sampleLeaf(child);
		}
	}
	return result;
}

function sampleValues(operation) {
	const values = {};
	const walk = (fields) => {
		for (const field of fields) {
			if (field.hidden) continue;
			if (field.kind === 'object') {
				walk(field.children || []);
				continue;
			}
			const webhookUrl =
				(operation.id === 'createWebhook' || operation.id === 'updateWebhook') && field.name === 'postbackUrl';
			if (field.required || webhookUrl) values[field.formName] = sampleLeaf(field);
		}
	};
	walk(operation.fields);
	return values;
}

test('catalog matches the fixture for every documented operation', () => {
	assert.equal(catalog.operationCount, 179);
	assert.equal(fixture.length, catalog.operations.length);
	catalog.operations.forEach((operation, index) => {
		const row = fixture[index];
		assert.equal(row.id, operation.id);
		assert.equal(row.method, operation.method);
		assert.equal(row.path, operation.path);
		assert.equal(row.server, operation.server);
		assert.equal(row.auth, operation.auth);
		assert.equal(row.pagination, operation.pagination.style);
		assert.equal(row.source, operation.sourceUrl);
	});
});

test('every operation builds the documented method, path, and auth', () => {
	for (const operation of catalog.operations) {
		const prepared = buildRequest(operation, sampleValues(operation), credentials());
		const url = new URL(prepared.url);
		assert.equal(prepared.method, operation.method, operation.id);
		const serverPath = new URL(operation.server).pathname.replace(/\/$/, '');
		let expectedPath = operation.path;
		for (const field of operation.fields) {
			if (field.location !== 'path') continue;
			expectedPath = expectedPath.split(`{${field.name}}`).join(encodeURIComponent(String(sampleLeaf(field))));
		}
		assert.equal(url.pathname, `${serverPath}${expectedPath.startsWith('/') ? expectedPath : `/${expectedPath}`}`, operation.id);
		if (operation.auth === 'bearer') assert.match(prepared.headers.Authorization, /^Bearer /, operation.id);
		if (operation.auth === 'authorizationRaw') assert.equal(prepared.headers.Authorization, 'engagement-token', operation.id);
		if (operation.auth === 'secretQuery') {
			assert.equal(prepared.headers.Authorization, undefined, operation.id);
			assert.equal(url.searchParams.get('secret'), 'education-secret', operation.id);
		}
		assert.equal(prepared.write, operation.method !== 'GET', operation.id);
	}
});

test('base URL override keeps the official path prefix and drops any extra path', () => {
	const jobs = catalog.operations.find((operation) => operation.id === 'findJobs');
	const prepared = buildRequest(jobs, {}, credentials({ baseUrl: 'https://127.0.0.1:43143/ignored' }));
	assert.equal(prepared.url.split('?')[0], 'https://127.0.0.1:43143/api/v1/jobs');
});

test('webhook registration sends both URL spellings and the content type', () => {
	const body = registrationBody('https://example.com/webhook/gupy', 'candidate.hired', 'top-secret');
	assert.equal(body.postbackUrl, 'https://example.com/webhook/gupy');
	assert.equal(body.postBackUrl, 'https://example.com/webhook/gupy');
	assert.equal(body.action, 'candidate.hired');
	assert.equal(body.clientHeaders['Content-Type'], 'application/json;charset=utf-8');
	assert.equal(body.clientHeaders.Authorization, 'top-secret');
	assert.equal(documentedWebhookActions().includes(ABOUT_ONLY_EVENT), false);
	assert.deepEqual(registerableActions([ABOUT_ONLY_EVENT, 'job.published']), ['job.published']);
});

test('page pagination follows totalPages and does not return a partial list', async () => {
	const operation = catalog.operations.find((item) => item.id === 'findJobs');
	const calls = [];
	const rows = await collectList(
		operation,
		async (query) => {
			calls.push(query.page);
			return { results: [{ id: query.page }], page: query.page, totalPages: 2 };
		},
		{ returnAll: true, limit: 50, maxPages: 5 },
	);
	assert.deepEqual(calls, [1, 2]);
	assert.deepEqual(rows.map((row) => row.id), [1, 2]);
});

test('limit stops after enough rows without requesting another page', async () => {
	const operation = catalog.operations.find((item) => item.id === 'findJobs');
	let calls = 0;
	const rows = await collectList(
		operation,
		async () => {
			calls += 1;
			return { results: [{ id: 1 }, { id: 2 }, { id: 3 }], totalPages: 4 };
		},
		{ returnAll: false, limit: 2, maxPages: 5 },
	);
	assert.equal(calls, 1);
	assert.equal(rows.length, 2);
});

test('max pages fails closed', async () => {
	const operation = catalog.operations.find((item) => item.id === 'findJobs');
	await assert.rejects(
		() =>
			collectList(
				operation,
				async (query) => ({ results: [{ id: query.page }], totalPages: 5 }),
				{ returnAll: true, limit: 50, maxPages: 2 },
			),
		/lista parcial não foi devolvida/,
	);
});

test('admin example envelope uses result.data and total', async () => {
	const operation = catalog.operations.find((item) => item.id === 'PositionPublicController_findPositions_v1');
	assert.deepEqual(operation.pagination.itemsPath, ['data']);
	assert.equal(operation.pagination.totalPagesPath, null);
	const rows = await collectList(
		operation,
		async (query) => ({ data: [{ uuid: `p${query.page}` }], total: 2, page: query.page, maxPageSize: query.maxPageSize }),
		{ returnAll: true, limit: 50, maxPages: 5 },
	);
	assert.equal(rows.length, 2);
});

test('cursor repeat fails closed and a missing next token stops', async () => {
	const operation = catalog.operations.find((item) => item.id === 'groups_list');
	const rows = await collectList(
		operation,
		async (query) => ({ results: [{ id: query.cursor || 'first' }], next_cursor: query.cursor ? '' : 'next' }),
		{ returnAll: true, limit: 50, maxPages: 5 },
	);
	assert.deepEqual(rows.map((row) => row.id), ['first', 'next']);
	await assert.rejects(
		() =>
			collectList(
				operation,
				async () => ({ results: [{ id: 1 }], next_cursor: 'same' }),
				{ returnAll: true, limit: 50, maxPages: 5 },
			),
		/repetiu o cursor/,
	);
});

test('retries are only for read failures that the docs or the network can recover', () => {
	assert.equal(shouldRetry(false, 429, false), true);
	assert.equal(shouldRetry(false, 502, false), true);
	assert.equal(shouldRetry(false, 504, false), true);
	assert.equal(shouldRetry(false, undefined, true), true);
	assert.equal(shouldRetry(false, 400, false), false);
	assert.equal(shouldRetry(false, 500, false), false);
	assert.equal(shouldRetry(true, 429, false), false);
	assert.equal(shouldRetry(true, undefined, true), false);
	assert.equal(backoffMs(1), 500);
	assert.equal(backoffMs(4), 4000);
	assert.equal(backoffMs(1, 2), 2000);
});

test('api.gupy.io is paced at the documented 500 requests per minute', () => {
	const calls = [];
	const now = 1_000_000;
	for (let index = 0; index < 499; index += 1) calls.push(now);
	assert.equal(paceDelay('api.gupy.io', now, calls), 0);
	calls.push(now);
	assert.ok(paceDelay('api.gupy.io', now, [...calls]) > 0);
	assert.equal(paceDelay('www.pulses.com.br', now, calls), 0);
});

test('webhook decisions acknowledge duplicates and reject a bad secret', () => {
	const payload = JSON.stringify({ id: 'evt-1', event: 'candidate.hired', data: { candidate: { email: 'a@b.com' } } });
	const accepted = evaluateWebhook({
		rawBody: payload,
		authorization: 'top-secret',
		secret: 'top-secret',
		allowed: ['candidate.hired'],
		seen: [],
	});
	assert.equal(accepted.emit, true);
	const duplicate = evaluateWebhook({
		rawBody: payload,
		authorization: 'top-secret',
		secret: 'top-secret',
		allowed: ['candidate.hired'],
		seen: ['evt-1'],
	});
	assert.equal(duplicate.duplicate, true);
	assert.equal(duplicate.emit, false);
	assert.equal(duplicate.status, 200);
	const rejected = evaluateWebhook({
		rawBody: payload,
		authorization: 'nope',
		secret: 'top-secret',
		allowed: [],
		seen: [],
	});
	assert.equal(rejected.status, 401);
	const filtered = evaluateWebhook({
		rawBody: payload,
		authorization: undefined,
		secret: '',
		allowed: ['job.published'],
		seen: [],
	});
	assert.equal(filtered.status, 200);
	assert.equal(filtered.emit, false);
});

test('the editor exposes Return All, Limit, and no JSON fields', () => {
	const properties = buildNodeProperties();
	const returnAll = properties.find((property) => property.name === 'returnAll');
	const limit = properties.find((property) => property.name === 'limit');
	assert.equal(returnAll.description, RETURN_ALL_DESCRIPTION);
	assert.equal(limit.description, LIMIT_DESCRIPTION);
	const types = new Set();
	const walk = (items) => {
		for (const property of items) {
			types.add(property.type);
			assert.notEqual(property.type, 'json');
			if (!property.description && property.type !== 'notice') {
				assert.ok(property.description, property.name);
			}
			if (property.description && property.type !== 'notice' && property.name !== 'returnAll' && property.name !== 'limit') {
				assert.ok(property.description.trim().length > 0, property.name);
			}
			if (property.options && property.type !== 'collection' && property.type !== 'fixedCollection') {
				for (const option of property.options) {
					if (typeof option.name === 'string') assert.match(option.name, /^[A-Z0-9]/, option.name);
				}
			}
			if (property.options && (property.type === 'collection' || property.type === 'fixedCollection')) {
				for (const group of property.options) walk(group.values || []);
			}
		}
	};
	walk(properties);
	const labels = operationLabels(catalog.operations);
	assert.equal(labels.size, catalog.operations.length);
});

test('query helper keeps repeated keys', () => {
	const url = withQuery('https://api.gupy.io/api/v1/jobs', { tag: ['a', 'b'], page: 1 });
	const parsed = new URL(url);
	assert.deepEqual(parsed.searchParams.getAll('tag'), ['a', 'b']);
	assert.equal(parsed.searchParams.get('page'), '1');
});
