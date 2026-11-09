import catalogJson from './catalog.json';

import type { Catalog, CatalogOperation } from './types';

const catalog = catalogJson as Catalog;

export function loadCatalog(): Catalog {
	return catalog;
}

export function operationByValue(value: string): CatalogOperation {
	const found = loadCatalog().operations.find((operation) => operation.operation === value);
	if (!found) {
		throw new Error(`Unknown Gupy operation ${value}.`);
	}
	return found;
}

export function resetCatalogForTests(): void {
	return undefined;
}
