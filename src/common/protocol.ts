export type BridgeMessageType = 'request' | 'response' | 'event' | 'error';

export const RuntimeBridgeConnectNotification = 'guide-vsc/runtimeBridge/connect';
export const RuntimeBridgeDisconnectNotification = 'guide-vsc/runtimeBridge/disconnect';
export const RuntimeBridgeStatusNotification = 'guide-vsc/runtimeBridge/status';
export const RuntimeDocumentValidateNotification = 'guide-vsc/runtimeDocument/validate';
export const MaxRuntimeDocumentBytes = 262144;

export interface BridgeEnvelope<TPayload = unknown> {
	id?: string;
	type: BridgeMessageType;
	method: string;
	protocol: 1;
	payload: TPayload;
}

export interface HelloPayload {
	token: string;
	clientName: string;
	supportedProtocols: number[];
}

export interface RuntimeBridgeConnectParams {
	host: string;
	port: number;
	token: string;
	allowRemote: boolean;
}

export interface RuntimeDocumentValidateParams {
	uri: string;
	languageId: string;
	text: string;
}

export type RuntimeBridgeStatusState = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface RuntimeBridgeStatusParams {
	state: RuntimeBridgeStatusState;
	message?: string;
}

export interface BridgeError {
	code: string;
	message: string;
	retryable: boolean;
}

export interface SemanticEntry {
	id: string;
	label?: string;
	detail?: string;
}

export interface SemanticQueryPayload {
	capability: string;
	cursor: string;
	limit: number;
	prefix: string;
	filters: Record<string, string>;
}

export interface SemanticQueryResultPayload {
	capability: string;
	version: number;
	entries: SemanticEntry[];
	nextCursor?: string | null;
}

export interface RuntimeDocumentValidationPayload {
	uri: string;
	languageId: string;
	text: string;
}

export function createHelloMessage(token: string): BridgeEnvelope<HelloPayload> {
	return {
		id: 'hello',
		type: 'request',
		method: 'hello',
		protocol: 1,
		payload: {
			token,
			clientName: 'guide-vsc',
			supportedProtocols: [1]
		}
	};
}

export function createSemanticQueryMessage(
	id: string,
	capability: string,
	cursor = '',
	limit = 200
): BridgeEnvelope<SemanticQueryPayload> {
	return {
		id,
		type: 'request',
		method: 'semantic.query',
		protocol: 1,
		payload: {
			capability,
			cursor,
			limit,
			prefix: '',
			filters: {}
		}
	};
}

export function createRuntimeDocumentValidateMessage(
	id: string,
	document: RuntimeDocumentValidateParams
): BridgeEnvelope<RuntimeDocumentValidationPayload> {
	return {
		id,
		type: 'request',
		method: 'document.validate',
		protocol: 1,
		payload: {
			uri: document.uri,
			languageId: document.languageId,
			text: document.text
		}
	};
}

export function isBridgeError(value: unknown): value is BridgeError {
	if (!value || typeof value !== 'object') {
		return false;
	}
	const candidate = value as Partial<BridgeError>;
	return typeof candidate.code === 'string'
		&& typeof candidate.message === 'string'
		&& typeof candidate.retryable === 'boolean';
}
