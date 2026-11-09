import type { CatalogField, CatalogOperation } from '../spec/types';

const RESOURCE_LABELS: Record<string, string> = {
	emailTemplates: 'Email Templates',
	group: 'Groups',
	user: 'Users',
};

export function displayName(name: string): string {
	const spaced = name
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.replace(/[._:/]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
	if (!spaced) return 'Field';
	return spaced.split(' ').map(titleWord).join(' ');
}

function titleWord(word: string): string {
	const lower = word.toLowerCase();
	if (lower === 'id') return 'ID';
	if (lower === 'url') return 'URL';
	if (lower === 'uuid') return 'UUID';
	if (lower === 'cpf') return 'CPF';
	if (lower === 'cnpj') return 'CNPJ';
	if (lower === 'api') return 'API';
	return word.charAt(0).toUpperCase() + word.slice(1);
}

export function resourceLabel(resource: string): string {
	return RESOURCE_LABELS[resource] ?? displayName(resource);
}

export function locatorFor(operation: CatalogOperation, field: CatalogField): string | undefined {
	if (operation.product !== 'recruitment') return undefined;
	if (field.locator) return field.locator;
	if (field.name === 'currentStepId') return 'step';
	if (field.name === 'vacancyId') return 'vacancy';
	if (field.name === 'webhookId') return 'webhook';
	if (field.name === 'userId') return 'user';
	if (field.name === 'dismissalId') return 'dismissal';
	if (field.name === 'tagId') return 'tag';
	if (field.name === 'templateId' && operation.id === 'createJob') return 'jobTemplate';
	if (field.name === 'templateId' && (operation.id === 'createJobOffer' || operation.id === 'createMessage')) {
		return 'emailTemplate';
	}
	return undefined;
}

function pathPhrase(operation: CatalogOperation): string {
	const parts = operation.path.split('/').filter((part) => part.length > 0);
	const last = parts[parts.length - 1] ?? '';
	const staticParts = parts.filter((part) => !part.includes('{') && !part.startsWith(':'));
	const noun = displayName(staticParts[staticParts.length - 1] ?? operation.resource);
	const parent = staticParts.length > 1 ? displayName(staticParts[staticParts.length - 2] ?? '') : '';
	if (last === 'find' || last === 'search') return `Find ${parent || noun}`;
	if (last === 'tree') return `Get ${parent || noun} Tree`;
	if (last === 'cancel') return `Cancel ${parent || noun}`;
	if (last === 'send') return `Send ${parent || noun}`;
	if (last === 'close') return `Close ${parent || noun}`;
	if (last.includes('export')) return `Export ${parent || noun}`;
	const endsWithParameter = /\{[^}]+\}\/?$/.test(operation.path);
	const verb =
		operation.method === 'POST'
			? 'Create'
			: operation.method === 'DELETE'
				? 'Delete'
				: operation.method === 'PUT' || operation.method === 'PATCH'
					? 'Update'
					: endsWithParameter
						? 'Get'
						: operation.pagination.style === 'none'
							? 'Get'
							: 'Get Many';
	if (endsWithParameter && parent) return `${verb} ${parent} ${noun}`;
	if (endsWithParameter) return `${verb} ${noun} By ID`;
	return `${verb} ${noun}`;
}

function baseLabel(operation: CatalogOperation): string {
	if (operation.id.includes('/')) return pathPhrase(operation);
	const parts = operation.id
		.split('_')
		.filter((part) => !/^v\d+$/i.test(part) && !/controller$/i.test(part));
	const fromId = parts.map((part) => displayName(part.replace(/Handler$/, ''))).join(' ');
	if (fromId.split(' ').length > 1) return fromId;
	return pathPhrase(operation);
}

export function operationLabels(operations: CatalogOperation[]): Map<string, string> {
	const labels = new Map<string, string>();
	const groups = new Map<string, CatalogOperation[]>();
	for (const operation of operations) {
		const key = `${operation.product}:${operation.resource}`;
		const list = groups.get(key) ?? [];
		list.push(operation);
		groups.set(key, list);
	}
	for (const group of groups.values()) {
		const used = new Map<string, number>();
		const taken = new Set<string>();
		for (const operation of group) {
			const base = baseLabel(operation);
			const count = used.get(base) ?? 0;
			used.set(base, count + 1);
			let label = count === 0 ? base : `${base} ${count + 1}`;
			let extra = 2;
			while (taken.has(label)) {
				label = `${base} ${extra}`;
				extra += 1;
			}
			taken.add(label);
			labels.set(operation.operation, label);
		}
	}
	return labels;
}

export function editorText(text: string, fallback: string): string {
	const cleaned = text.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();
	const value = cleaned || fallback;
	return /[.!?]$/.test(value) ? value : `${value}.`;
}
