export class GupyInputError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'GupyInputError';
	}
}

export class GupyApiError extends Error {
	readonly status: number | undefined;

	constructor(message: string, status?: number) {
		super(message);
		this.name = 'GupyApiError';
		this.status = status;
	}
}

export function redact(text: string, secrets: string[]): string {
	let output = text;
	for (const secret of secrets) {
		if (secret.length > 3) output = output.split(secret).join('[secret]');
	}
	return output
		.replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[document]')
		.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
		.slice(0, 500);
}

export function assertNever(value: never, label: string): never {
	throw new GupyInputError(`${label}: ${String(value)}.`);
}
