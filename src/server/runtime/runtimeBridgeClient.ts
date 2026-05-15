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
import { validateRuntimeBridgeConnectionParams } from '../../common/runtimeBridgeSecurity';

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
	private readonly allowedCapabilities = new Set(RuntimeBridgeClient.bootstrapCapabilities);

	public constructor(
		private readonly cache: SemanticCache,
		private readonly events: RuntimeBridgeClientEvents = {}
	) {}

	connect(options: RuntimeBridgeConnectionOptions): void {
		validateRuntimeBridgeConnectionParams(options);
		this.closeSocket();
		this.publishStatus({ state: 'connecting' });
		this.socket = new WebSocket(`ws://${options.host}:${options.port}`);
		this.socket.on('open', () => {
			this.send(createHelloMessage(options.token));
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
		this.send(createRuntimeDocumentValidateMessage(`document.validate.${Date.now()}`, document));
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

	private parseMessage(data: string): BridgeEnvelope | undefined {
		try {
			return JSON.parse(data) as BridgeEnvelope;
		} catch {
			this.publishStatus({ state: 'error', message: 'Runtime bridge returned invalid JSON.' });
			return undefined;
		}
	}

	private publishStatus(status: RuntimeBridgeStatus): void {
		this.events.onStatus?.(status);
	}

	private closeSocket(): void {
		this.connected = false;
		this.socket?.close();
		this.socket = undefined;
	}
}
