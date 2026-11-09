import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	Icon,
	INodeProperties,
} from 'n8n-workflow';

export class GupyApi implements ICredentialType {
	name = 'gupyApi';
	displayName = 'Gupy API';
	documentationUrl = 'https://developers.gupy.io/';
	icon: Icon = { light: 'file:gupy.svg', dark: 'file:gupy.dark.svg' };
	properties: INodeProperties[] = [
		{
			displayName: 'Recruitment Token',
			name: 'recruitmentToken',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'Bearer token from Gupy Setup, Tokens Generation. Sent as Authorization: Bearer. The credential test calls GET /api/v1/jobs?perPage=1.',
		},
		{
			displayName: 'Admission Token',
			name: 'admissionToken',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			description:
				'Bearer token from POST https://admission.app.gupy.io/api/v1/auth/token. It is not the recruitment token. Required only for admission operations.',
		},
		{
			displayName: 'Admin Token',
			name: 'adminToken',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			description:
				'Bearer token from POST https://accounts.api.gupy.io/v1/token with routeType public. Required only for admin operations.',
		},
		{
			displayName: 'User Management Token',
			name: 'userManagementToken',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			description:
				'Bearer token for api.gupy.io/user-management. The reference says Bearer authentication and does not publish a separate scheme object.',
		},
		{
			displayName: 'Engagement Token',
			name: 'engagementToken',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			description:
				'Climate API token for www.pulses.com.br. Sent as Authorization with the raw token, without the word Bearer.',
		},
		{
			displayName: 'Education Secret',
			name: 'educationSecret',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			description:
				'Company secret for corporate education. Sent as the secret query parameter. Do not put this value in a browser workflow.',
		},
		{
			displayName: 'Pathways Token',
			name: 'pathwaysToken',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			description: 'Bearer token of the Gupy central account, used by api-pathways.niduu.com.',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: '',
			description:
				'Optional origin for a mock or proxy, such as https://127.0.0.1:43143. Leave empty to use each official host. Do not include a path.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.recruitmentToken}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl || "https://api.gupy.io"}}',
			url: '/api/v1/jobs',
			method: 'GET',
			qs: {
				page: 1,
				perPage: 1,
				fields: 'id,name',
			},
		},
	};
}
