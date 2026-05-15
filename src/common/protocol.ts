export type BridgeMessageType = 'request' | 'response' | 'event' | 'error';

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

export function isBridgeError(value: unknown): value is BridgeError {
	if (!value || typeof value !== 'object') {
		return false;
	}
	const candidate = value as Partial<BridgeError>;
	return typeof candidate.code === 'string'
		&& typeof candidate.message === 'string'
		&& typeof candidate.retryable === 'boolean';
}
