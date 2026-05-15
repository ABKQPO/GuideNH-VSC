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

export interface RuntimeBridgeConnectionOptions {
	host: string;
	port: number;
	token: string;
}

export type RuntimeBridgeState = RuntimeBridgeStatusState;
export type RuntimeBridgeStatus = RuntimeBridgeStatusParams;

export interface RuntimeBridgeClientEvents {
	onStatus?: (status: RuntimeBridgeStatus) => void;
}

export class RuntimeBridgeClient {
	private static readonly bootstrapCapabilities = ['items', 'ores', 'categories', 'mods'];

	private socket: WebSocket | undefined;
	private readonly pendingEntries = new Map<string, SemanticEntry[]>();

	public constructor(
		private readonly cache: SemanticCache,
		private readonly events: RuntimeBridgeClientEvents = {}
	) {}

	connect(options: RuntimeBridgeConnectionOptions): void {
		if (!options.host || !options.port || !options.token) {
			throw new Error('Runtime bridge host, port, and token must be configured explicitly');
		}
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
			this.publishStatus({ state: 'error', message: error.message });
		});
		this.socket.on('close', () => {
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
		const message = JSON.parse(data) as BridgeEnvelope;
		if (message.type === 'error') {
			this.publishStatus({ state: 'error', message: 'Runtime bridge rejected the request.' });
			return;
		}
		if (message.method === 'hello' && message.type === 'response') {
			this.publishStatus({ state: 'connected' });
			this.refreshBootstrapCapabilities();
			return;
		}
		if (message.method === 'semantic.query' && message.type === 'response') {
			this.handleSemanticQueryResult(message.payload as SemanticQueryResultPayload);
		}
	}

	private refreshBootstrapCapabilities(): void {
		for (const capability of RuntimeBridgeClient.bootstrapCapabilities) {
			this.pendingEntries.set(capability, []);
			this.send(createSemanticQueryMessage(`semantic.${capability}.0`, capability));
		}
	}

	private handleSemanticQueryResult(payload: SemanticQueryResultPayload): void {
		const existing = this.pendingEntries.get(payload.capability) ?? [];
		const entries = existing.concat(payload.entries);
		if (payload.nextCursor) {
			this.pendingEntries.set(payload.capability, entries);
			this.send(createSemanticQueryMessage(`semantic.${payload.capability}.${payload.nextCursor}`, payload.capability, payload.nextCursor));
			return;
		}
		this.pendingEntries.delete(payload.capability);
		this.cache.replace(payload.capability, payload.version, entries);
	}

	private publishStatus(status: RuntimeBridgeStatus): void {
		this.events.onStatus?.(status);
	}

	private closeSocket(): void {
		this.socket?.close();
		this.socket = undefined;
	}
}
