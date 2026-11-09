import type { INodeProperties, INodePropertyOptions } from 'n8n-workflow';

import { displayName, editorText, locatorFor, operationLabels, resourceLabel } from './labels';
import { loadCatalog } from '../spec/load';
import type { CatalogField, CatalogOperation, GupyProduct } from '../spec/types';

export const RETURN_ALL_DESCRIPTION = 'Whether to return all results or only up to a given limit';
export const LIMIT_DESCRIPTION = 'Max number of results to return';

const SEARCH_METHOD: Record<string, string> = {
	job: 'searchJobs',
	application: 'searchApplications',
	step: 'searchSteps',
	department: 'searchDepartments',
	role: 'searchRoles',
	branch: 'searchBranches',
	careerPage: 'searchCareerPages',
	vacancy: 'searchVacancies',
	webhook: 'searchWebhooks',
	user: 'searchUsers',
	dismissal: 'searchDismissals',
	tag: 'searchTags',
	jobTemplate: 'searchJobTemplates',
	emailTemplate: 'searchEmailTemplates',
};

const PRODUCTS: Array<{ value: GupyProduct; name: string; description: string }> = [
	{
		value: 'recruitment',
		name: 'Recruitment',
		description: 'Recruitment and selection at api.gupy.io/api/v1, with a Bearer token',
	},
	{
		value: 'admission',
		name: 'Admission',
		description: 'Admission at admission.app.gupy.io. This Bearer token is not the recruitment token.',
	},
	{
		value: 'admin',
		name: 'Admin',
		description: 'Admin Global at api.gupy.io/os, with the accounts Bearer token',
	},
	{
		value: 'userManagement',
		name: 'User Management',
		description: 'Admin Global user management. The page says Bearer authentication.',
	},
	{
		value: 'engagement',
		name: 'Engagement',
		description: 'Climate engagement at pulses.com.br. The token is sent without the Bearer prefix.',
	},
	{
		value: 'education',
		name: 'Education',
		description: 'Corporate education. The company secret goes in the secret query parameter.',
	},
	{
		value: 'pathways',
		name: 'Pathways',
		description: 'Learning pathways. Uses the central-account Bearer token.',
	},
];

function optionName(name: string, value: string | number | boolean): string {
	const text = editorText(name, String(value)).replace(/[.!?]$/, '');
	return text.charAt(0).toUpperCase() + text.slice(1);
}

function uniqueOptions(options: Array<{ name: string; value: string | number | boolean }>): INodePropertyOptions[] {
	const used = new Set<string>();
	return options.map((option) => {
		let name = optionName(option.name, option.value);
		if (used.has(name)) name = `${name} ${String(option.value)}`;
		used.add(name);
		return { name, value: option.value };
	});
}

function leafProperty(operation: CatalogOperation, field: CatalogField, name: string): INodeProperties {
	const locator = locatorFor(operation, field);
	const description = editorText(field.description, `Documented field ${field.name}.`);
	if (locator && SEARCH_METHOD[locator]) {
		return {
			displayName: displayName(field.name),
			name,
			type: 'resourceLocator',
			default: { mode: 'list', value: '' },
			description,
			modes: [
				{
					displayName: 'From List',
					name: 'list',
					type: 'list',
					typeOptions: { searchListMethod: SEARCH_METHOD[locator], searchable: true },
				},
				{
					displayName: 'By ID',
					name: 'id',
					type: 'string',
					placeholder: '123',
				},
			],
		};
	}
	if (field.kind === 'options' && field.options?.length) {
		const options = uniqueOptions(field.options);
		const optionDefault = options[0].value;
		return {
			displayName: displayName(field.name),
			name,
			type: 'options',
			options,
			default: optionDefault,
			description,
		};
	}
	if (field.kind === 'multiOptions' && field.options?.length) {
		return {
			displayName: displayName(field.name),
			name,
			type: 'multiOptions',
			options: uniqueOptions(field.options),
			default: [],
			description,
		};
	}
	if (field.kind === 'boolean') {
		return { displayName: displayName(field.name), name, type: 'boolean', default: false, description };
	}
	if (field.kind === 'number') {
		return {
			displayName: displayName(field.name),
			name,
			type: 'number',
			default: 0,
			description,
			typeOptions: {
				...(field.minimum !== undefined ? { minValue: field.minimum } : {}),
				...(field.maximum !== undefined && field.maximum <= 1_000_000 ? { maxValue: field.maximum } : {}),
			},
		};
	}
	if (field.kind === 'valueList') {
		const itemType = field.itemKind === 'number' || field.itemKind === 'integer' ? 'number' : 'string';
		return {
			displayName: displayName(field.name),
			name,
			type: 'fixedCollection',
			typeOptions: { multipleValues: true },
			default: {},
			description,
			options: [
				{
					displayName: 'Item',
					name: 'item',
					values: [
						{
							displayName: 'Value',
							name: 'value',
							type: itemType,
							default: itemType === 'number' ? 0 : '',
							description: 'One list entry',
						},
					],
				},
			],
		};
	}
	if (field.kind === 'freeform' || field.kind === 'freeformList') {
		return {
			displayName: displayName(field.name),
			name,
			type: 'fixedCollection',
			typeOptions: { multipleValues: true },
			default: {},
			description: editorText(
				`${field.description} The published schema does not list the keys, so each entry is a key and a value.`,
				'Key and value pairs.',
			),
			options: [
				{
					displayName: 'Entry',
					name: 'item',
					values: [
						{ displayName: 'Key', name: 'key', type: 'string', default: '', description: 'Field name' },
						{ displayName: 'Value', name: 'value', type: 'string', default: '', description: 'Field value' },
					],
				},
			],
		};
	}
	if (field.kind === 'objectList') {
		return {
			displayName: displayName(field.name),
			name,
			type: 'fixedCollection',
			typeOptions: { multipleValues: true },
			default: {},
			description,
			options: [
				{
					displayName: 'Item',
					name: 'item',
					values: (field.children ?? []).map((child) => leafProperty(operation, child, child.name)),
				},
			],
		};
	}
	return {
		displayName: displayName(field.name),
		name,
		type: 'string',
		default: '',
		description,
		...(field.maxLength && field.maxLength <= 4000 ? { typeOptions: { maxLength: field.maxLength } } : {}),
	};
}

export function isRequired(operation: CatalogOperation, field: CatalogField): boolean {
	if (field.required) return true;
	if (
		(operation.id === 'createWebhook' || operation.id === 'updateWebhook') &&
		field.name === 'postbackUrl'
	) {
		return true;
	}
	return false;
}

function walkFields(
	operation: CatalogOperation,
	fields: CatalogField[],
	required: INodeProperties[],
	optional: INodeProperties[],
): void {
	for (const field of fields) {
		if (field.hidden) continue;
		if (field.kind === 'object') {
			walkFields(operation, field.children ?? [], required, optional);
			continue;
		}
		const property = leafProperty(operation, field, field.formName);
		if (isRequired(operation, field)) required.push(property);
		else optional.push(property);
	}
}

function rank(operation: CatalogOperation): number {
	if (operation.method === 'GET' && operation.pagination.style !== 'none') return 0;
	if (operation.method === 'GET') return 1;
	if (operation.method === 'POST') return 2;
	if (operation.method === 'PATCH' || operation.method === 'PUT') return 3;
	return 4;
}

export function buildNodeProperties(): INodeProperties[] {
	const catalog = loadCatalog();
	const labels = operationLabels(catalog.operations);
	const properties: INodeProperties[] = [
		{
			displayName:
				'Candidate and employee records are personal data. Prefer read operations, and confirm writes before an AI agent runs them.',
			name: 'gupyNotice',
			type: 'notice',
			default: '',
		},
		{
			displayName: 'Product',
			name: 'product',
			type: 'options',
			noDataExpression: true,
			options: PRODUCTS.map((product) => ({
				name: product.name,
				value: product.value,
				description: product.description,
			})),
			default: 'recruitment',
			description: 'Gupy product. Each product has its own host and credential field.',
		},
	];

	for (const product of PRODUCTS) {
		const resources = [
			...new Set(catalog.operations.filter((operation) => operation.product === product.value).map((operation) => operation.resource)),
		].sort((left, right) => resourceLabel(left).localeCompare(resourceLabel(right)));
		const defaultResource =
			product.value === 'recruitment' && resources.includes('jobs') ? 'jobs' : (resources[0] ?? 'resource');
		properties.push({
			displayName: 'Resource',
			name: 'resource',
			type: 'options',
			noDataExpression: true,
			displayOptions: { show: { product: [product.value] } },
			options: resources.map((resource) => ({ name: resourceLabel(resource), value: resource })),
			default: defaultResource,
			description: 'Resource in this Gupy product',
		});
		for (const resource of resources) {
			const operations = catalog.operations
				.filter((operation) => operation.product === product.value && operation.resource === resource)
				.sort((left, right) => rank(left) - rank(right) || (labels.get(left.operation) ?? '').localeCompare(labels.get(right.operation) ?? ''));
			const operationDefault = operations[0]?.operation ?? '';
			properties.push({
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { product: [product.value], resource: [resource] } },
				options: operations.map((operation) => {
					const name = labels.get(operation.operation) ?? operation.operation;
					return {
						name,
						value: operation.operation,
						description: editorText(operation.description, name),
						action: name,
					};
				}),
				default: operationDefault,
				description: 'Operation to run. The list comes from the published reference.',
			});
		}
	}

	const paginated = catalog.operations
		.filter((operation) => operation.pagination.style !== 'none')
		.map((operation) => operation.operation);
	properties.push(
		{
			displayName: 'Return All',
			name: 'returnAll',
			type: 'boolean',
			displayOptions: { show: { operation: paginated } },
			default: false,
			description: 'Whether to return all results or only up to a given limit',
		},
		{
			displayName: 'Limit',
			name: 'limit',
			type: 'number',
			typeOptions: { minValue: 1 },
			displayOptions: { show: { operation: paginated, returnAll: [false] } },
			default: 50,
			description: 'Max number of results to return',
		},
		{
			displayName: 'Max Pages',
			name: 'maxPages',
			type: 'number',
			typeOptions: { minValue: 1 },
			displayOptions: { show: { operation: paginated } },
			default: 100,
			description: 'Maximum pages to request before failing instead of returning a partial list',
		},
	);

	for (const operation of catalog.operations) {
		const required: INodeProperties[] = [];
		const optional: INodeProperties[] = [];
		walkFields(operation, operation.fields, required, optional);
		for (const property of required) {
			properties.push({
				...property,
				displayOptions: { show: { operation: [operation.operation] } },
				required: true,
			});
		}
		if (optional.length > 0) {
			properties.push({
				displayName: 'Additional Fields',
				name: `additional__${operation.operation}`,
				type: 'collection',
				placeholder: 'Add Field',
				default: {},
				displayOptions: { show: { operation: [operation.operation] } },
				description: 'Optional fields documented for this operation',
				options: optional,
			});
		}
	}
	return properties;
}

export function propertyNames(): Set<string> {
	return new Set(buildNodeProperties().map((property) => property.name));
}
