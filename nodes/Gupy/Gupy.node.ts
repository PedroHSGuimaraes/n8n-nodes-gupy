import {
	NodeConnectionTypes,
	NodeOperationError,
	type IExecuteFunctions,
	type INodeExecutionData,
	type INodeType,
	type INodeTypeDescription,
} from 'n8n-workflow';

import { executeOperation } from './api/transport';
import { locatorFor } from './description/labels';
import { buildNodeProperties, isRequired } from './description/properties';
import {
	searchApplications,
	searchBranches,
	searchCareerPages,
	searchDepartments,
	searchDismissals,
	searchEmailTemplates,
	searchJobTemplates,
	searchJobs,
	searchRoles,
	searchSteps,
	searchTags,
	searchUsers,
	searchVacancies,
	searchWebhooks,
} from './methods';
import { operationByValue } from './spec/load';
import type { CatalogField } from './spec/types';

function describedNames(): Set<string> {
	return new Set(buildNodeProperties().map((property) => property.name));
}

const propertyNameSet = describedNames();

function collectValues(ctx: IExecuteFunctions, itemIndex: number): Record<string, unknown> {
	const operation = operationByValue(ctx.getNodeParameter('operation', itemIndex) as string);
	const values: Record<string, unknown> = {};
	const additionalName = `additional__${operation.operation}`;
	const additional = propertyNameSet.has(additionalName)
		? (ctx.getNodeParameter(additionalName, itemIndex, {}) as Record<string, unknown>)
		: {};
	const walk = (fields: CatalogField[]): void => {
		for (const field of fields) {
			if (field.hidden) continue;
			if (field.kind === 'object') {
				walk(field.children ?? []);
				continue;
			}
			if (isRequired(operation, field)) {
				const locator = Boolean(locatorFor(operation, field));
				values[field.formName] = ctx.getNodeParameter(
					field.formName,
					itemIndex,
					'',
					locator ? { extractValue: true } : undefined,
				);
			} else if (Object.prototype.hasOwnProperty.call(additional, field.formName)) {
				values[field.formName] = additional[field.formName];
			}
		}
	};
	walk(operation.fields);
	return values;
}

function asRows(paginated: boolean, result: unknown): unknown[] {
	if (paginated) return Array.isArray(result) ? result : [];
	if (Array.isArray(result)) return result;
	if (result === undefined || result === null || result === '') return [{}];
	if (typeof result === 'object') return [result];
	return [{ value: result }];
}

export class Gupy implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Gupy',
		name: 'gupy',
		icon: { light: 'file:gupy.svg', dark: 'file:gupy.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description:
			'Reads and updates the official Gupy company APIs for recruitment, admission, admin, education, engagement, and pathways.',
		defaults: { name: 'Gupy' },
		usableAsTool: {
			replacements: {
				description:
					'Gupy company API tool. Prefer read operations such as listing jobs or applications. Creating applications, moving steps, hiring, dismissing, and deleting records change candidate data and should be confirmed by a person. Do not invent IDs: use a list or ask for the ID. Webhooks are received by Gupy Trigger.',
			},
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'gupyApi', required: true }],
		codex: {
			categories: ['Productivity', 'Data & Storage'],
			resources: {
				primaryDocumentation: [{ url: 'https://developers.gupy.io/' }],
			},
		},
		properties: buildNodeProperties(),
	};

	methods = {
		listSearch: {
			searchJobs,
			searchApplications,
			searchSteps,
			searchDepartments,
			searchRoles,
			searchBranches,
			searchCareerPages,
			searchVacancies,
			searchWebhooks,
			searchUsers,
			searchDismissals,
			searchTags,
			searchJobTemplates,
			searchEmailTemplates,
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
			try {
				const operation = operationByValue(this.getNodeParameter('operation', itemIndex) as string);
				const returnAll = this.getNodeParameter('returnAll', itemIndex, false) as boolean;
				const limit = this.getNodeParameter('limit', itemIndex, 50) as number;
				const maxPages = this.getNodeParameter('maxPages', itemIndex, 100) as number;
				const result = await executeOperation(this, operation, collectValues(this, itemIndex), {
					returnAll,
					limit,
					maxPages,
				});
				for (const row of asRows(operation.pagination.style !== 'none', result)) {
					returnData.push({
						json: (row && typeof row === 'object' ? row : { value: row }) as INodeExecutionData['json'],
						pairedItem: { item: itemIndex },
					});
				}
			} catch (error) {
				const message = error instanceof Error ? error.message : 'Falha ao executar a Gupy.';
				if (this.continueOnFail()) {
					returnData.push({ json: { message }, pairedItem: { item: itemIndex } });
					continue;
				}
				throw new NodeOperationError(this.getNode(), message, { itemIndex });
			}
		}
		return [returnData];
	}
}
