export type GupyProduct =
	| 'recruitment'
	| 'admission'
	| 'admin'
	| 'userManagement'
	| 'engagement'
	| 'education'
	| 'pathways';

export type GupyAuth = 'bearer' | 'authorizationRaw' | 'secretQuery';

export type FieldKind =
	| 'string'
	| 'number'
	| 'boolean'
	| 'options'
	| 'multiOptions'
	| 'object'
	| 'objectList'
	| 'valueList'
	| 'freeform'
	| 'freeformList'
	| 'locator';

export interface CatalogOption {
	name: string;
	value: string | number | boolean;
}

export interface CatalogField {
	name: string;
	location: 'query' | 'path' | 'body' | 'header' | 'meta';
	required: boolean;
	description: string;
	kind: FieldKind;
	formName: string;
	hidden?: boolean;
	credential?: string;
	locator?: string;
	options?: CatalogOption[];
	children?: CatalogField[];
	ambiguous?: boolean;
	maximum?: number;
	minimum?: number;
	maxLength?: number;
	itemKind?: string;
	bodyRoot?: 'array';
	format?: string;
}

export interface PaginationSpec {
	style: 'none' | 'page' | 'pageToken' | 'cursor';
	sizeParam?: string | null;
	sizeMax?: number | null;
	pageParam?: string | null;
	itemsPath?: string[] | null;
	totalPagesPath?: string[] | null;
	totalPath?: string[] | null;
	nextField?: string | null;
	sizeSource?: string;
	envelopeSource?: string;
	nextFieldAmbiguous?: boolean;
}

export interface CatalogOperation {
	id: string;
	operation: string;
	product: GupyProduct;
	resource: string;
	method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
	server: string;
	path: string;
	summary: string;
	description: string;
	source: string;
	sourceUrl: string;
	auth: GupyAuth;
	write: boolean;
	fields: CatalogField[];
	pagination: PaginationSpec;
	listKey?: string | null;
	unmatchedRequired?: string[];
	tag?: string;
}

export interface Catalog {
	source: string;
	operationCount: number;
	operations: CatalogOperation[];
	notes: Array<{ source: string; reason: string }>;
}

export interface GupyCredentials {
	recruitmentToken: string;
	admissionToken: string;
	adminToken: string;
	userManagementToken: string;
	engagementToken: string;
	educationSecret: string;
	pathwaysToken: string;
	baseUrl: string;
}

export interface PreparedRequest {
	method: CatalogOperation['method'];
	url: string;
	body?: unknown;
	headers: Record<string, string>;
	write: boolean;
	operation: CatalogOperation;
}
