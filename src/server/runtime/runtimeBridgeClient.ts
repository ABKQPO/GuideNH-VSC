import WebSocket from 'ws';
import {
	BridgeEnvelope,
	createHelloMessage,
	createSemanticQueryMessage,
	SemanticEntry,
	SemanticQueryResultPayload
} from '../../common/protocol';
import { SemanticCache } from './semanticCache';

export interface RuntimeBridgeConnectionOptions {
	host: string;
	port: number;
	token: string;
}

export class RuntimeBridgeClient {
	private static readonly bootstrapCapabilities = ['items', 'ores'];

	private socket: WebSocket | undefined;
	private readonly pendingEntries = new Map<string, SemanticEntry[]>();

	public constructor(private readonly cache: SemanticCache) {}

	connect(options: RuntimeBridgeConnectionOptions): void {
		if (!options.host || !options.port || !options.token) {
			throw new Error('Runtime bridge host, port, and token must be configured explicitly');
		}
		this.socket = new WebSocket(`ws://${options.host}:${options.port}`);
		this.socket.on('open', () => {
			this.send(createHelloMessage(options.token));
		});
		this.socket.on('message', (data) => {
			this.handleMessage(data.toString());
		});
		this.socket.on('close', () => {
			this.cache.markStale();
		});
	}

	disconnect(): void {
		this.socket?.close();
		this.socket = undefined;
		this.cache.markStale();
	}

	private send(message: BridgeEnvelope): void {
		this.socket?.send(JSON.stringify(message));
	}

	private handleMessage(data: string): void {
		const message = JSON.parse(data) as BridgeEnvelope;
		if (message.type === 'error') {
			return;
		}
		if (message.method === 'hello' && message.type === 'response') {
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
}
