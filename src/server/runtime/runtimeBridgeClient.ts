import WebSocket from 'ws';
import {
	BridgeEnvelope,
	createRuntimeDocumentValidateMessage,
	createHelloMessage,
	createSemanticQueryMessage,
	MaxRuntimeDocumentBytes,
	SemanticEntry,
	SemanticQueryResultPayload,
	RuntimeDocumentValidateParams,
	RuntimeBridgeStatusParams,
	RuntimeBridgeStatusState
} from '../../common/protocol';
import { SemanticCache } from './semanticCache';
import {
	createSemanticPayloadGuardState,
	SemanticPayloadGuardState,
	validateSemanticPayload
} from './semanticPayloadGuard';
import { validateBridgeEnvelope } from './runtimeBridgeEnvelopeGuard';
import { createRuntimeBridgeWebSocketUrl, resolveRuntimeBridgeConnectionParams } from '../../common/runtimeBridgeSecurity';

export interface RuntimeBridgeConnectionOptions {
	host: string;
	port: number;
	token: string;
	allowRemote: boolean;
}

export type RuntimeBridgeState = RuntimeBridgeStatusState;
export type RuntimeBridgeStatus = RuntimeBridgeStatusParams;

export interface RuntimeBridgeClientEvents {
	onStatus?: (status: RuntimeBridgeStatus) => void;
}

const MaxRuntimeBridgeMessageBytes = 262144;

export class RuntimeBridgeClient {
	private static readonly bootstrapCapabilities = [
		'items',
		'ores',
		'categories',
		'mods',
		'sounds',
		'keybinds',
		'recipes',
		'quests',
		'pages'
	];

	private socket: WebSocket | undefined;
	private connected = false;
	private readonly pendingEntries = new Map<string, SemanticEntry[]>();
	private readonly pendingPayloadStates = new Map<string, SemanticPayloadGuardState>();
	private readonly pendingDocumentValidations = new Set<string>();
	private readonly allowedCapabilities = new Set(RuntimeBridgeClient.bootstrapCapabilities);
	private documentValidationSequence = 0;

	public constructor(
		private readonly cache: SemanticCache,
		private readonly events: RuntimeBridgeClientEvents = {}
	) {}

	connect(options: RuntimeBridgeConnectionOptions): void {
		const resolvedOptions = resolveRuntimeBridgeConnectionParams(options);
		this.closeSocket();
		this.publishStatus({ state: 'connecting' });
		this.socket = new WebSocket(createRuntimeBridgeWebSocketUrl(resolvedOptions));
		this.socket.on('open', () => {
			this.send(createHelloMessage(resolvedOptions.token));
		});
		this.socket.on('message', (data) => {
			this.handleMessage(data.toString());
		});
		this.socket.on('error', (error) => {
			this.connected = false;
			this.publishStatus({ state: 'error', message: error.message });
		});
		this.socket.on('close', () => {
			this.connected = false;
			this.cache.markStale();
			this.publishStatus({ state: 'disconnected' });
		});
	}

	disconnect(): void {
		this.closeSocket();
		this.cache.markStale();
		this.publishStatus({ state: 'disconnected' });
	}

	validateDocument(document: RuntimeDocumentValidateParams): void {
		if (!this.connected) {
			const message = 'Runtime bridge must be connected before document validation.';
			this.publishStatus({ state: 'error', message });
			throw new Error(message);
		}
		const byteLength = Buffer.byteLength(document.text, 'utf8');
		if (byteLength > MaxRuntimeDocumentBytes) {
			throw new Error(`Runtime document validation payload is too large: ${byteLength} bytes`);
		}
		const requestId = this.createDocumentValidationRequestId();
		this.pendingDocumentValidations.add(requestId);
		this.send(createRuntimeDocumentValidateMessage(requestId, document));
	}

	private send(message: BridgeEnvelope): void {
		this.socket?.send(JSON.stringify(message));
	}

	private handleMessage(data: string): void {
		if (Buffer.byteLength(data, 'utf8') > MaxRuntimeBridgeMessageBytes) {
			this.publishStatus({ state: 'error', message: 'Runtime bridge message is too large.' });
			return;
		}
		const message = this.parseMessage(data);
		if (!message) {
			return;
		}
		if (message.type === 'error') {
			this.publishStatus({ state: 'error', message: 'Runtime bridge rejected the request.' });
			return;
		}
		if (message.method === 'hello' && message.type === 'response') {
			this.connected = true;
			this.publishStatus({ state: 'connected' });
			this.refreshBootstrapCapabilities();
			return;
		}
		if (message.method === 'semantic.query' && message.type === 'response') {
			this.handleSemanticQueryResult(message.payload);
			return;
		}
		if (message.method === 'document.validate' && message.type === 'response') {
			this.handleDocumentValidationResult(message.id);
		}
	}

	private refreshBootstrapCapabilities(): void {
		for (const capability of RuntimeBridgeClient.bootstrapCapabilities) {
			this.pendingEntries.set(capability, []);
			this.pendingPayloadStates.set(capability, createSemanticPayloadGuardState());
			this.send(createSemanticQueryMessage(`semantic.${capability}.0`, capability));
		}
	}

	private handleSemanticQueryResult(value: unknown): void {
		let payload: SemanticQueryResultPayload;
		let nextCursor: string | undefined;
		let totalEntries: number;
		try {
			const rawCapability = typeof value === 'object' && value ? (value as Partial<SemanticQueryResultPayload>).capability : undefined;
			const capability = typeof rawCapability === 'string' ? rawCapability : '';
			const state = this.pendingPayloadStates.get(capability);
			if (!state) {
				throw new Error('Runtime semantic payload was not requested.');
			}
			const result = validateSemanticPayload(value, this.allowedCapabilities, state);
			payload = result.payload;
			nextCursor = result.nextCursor;
			totalEntries = result.totalEntries;
			this.pendingPayloadStates.set(payload.capability, state);
		} catch (error) {
			this.publishStatus({ state: 'error', message: error instanceof Error ? error.message : 'Runtime semantic payload is invalid.' });
			return;
		}
		const existing = this.pendingEntries.get(payload.capability) ?? [];
		const entries = existing.concat(payload.entries);
		if (nextCursor) {
			this.pendingPayloadStates.get(payload.capability)?.seenCursors.add(nextCursor);
			const state = this.pendingPayloadStates.get(payload.capability);
			if (state) {
				state.totalEntries = totalEntries;
			}
			this.pendingEntries.set(payload.capability, entries);
			this.send(createSemanticQueryMessage(`semantic.${payload.capability}.${nextCursor}`, payload.capability, nextCursor));
			return;
		}
		this.pendingEntries.delete(payload.capability);
		this.pendingPayloadStates.delete(payload.capability);
		this.cache.replace(payload.capability, payload.version, entries);
	}

	private handleDocumentValidationResult(id: string | undefined): void {
		if (!id || !this.pendingDocumentValidations.has(id)) {
			this.publishStatus({ state: 'error', message: 'Runtime document validation response was not requested.' });
			return;
		}
		this.pendingDocumentValidations.delete(id);
	}

	private parseMessage(data: string): BridgeEnvelope | undefined {
		try {
			return validateBridgeEnvelope(JSON.parse(data));
		} catch (error) {
			this.publishStatus({
				state: 'error',
				message: error instanceof Error ? error.message : 'Runtime bridge returned invalid JSON.'
			});
			return undefined;
		}
	}

	private publishStatus(status: RuntimeBridgeStatus): void {
		this.events.onStatus?.(status);
	}

	private closeSocket(): void {
		this.connected = false;
		this.pendingDocumentValidations.clear();
		this.socket?.close();
		this.socket = undefined;
	}

	private createDocumentValidationRequestId(): string {
		this.documentValidationSequence++;
		return `document.validate.${this.documentValidationSequence}`;
	}
}
