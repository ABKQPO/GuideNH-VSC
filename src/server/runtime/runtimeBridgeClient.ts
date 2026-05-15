import WebSocket from 'ws';
import { BridgeEnvelope, createHelloMessage } from '../../common/protocol';
import { SemanticCache } from './semanticCache';

export interface RuntimeBridgeConnectionOptions {
	host: string;
	port: number;
	token: string;
}

export class RuntimeBridgeClient {
	private socket: WebSocket | undefined;

	public constructor(private readonly cache: SemanticCache) {}

	connect(options: RuntimeBridgeConnectionOptions): void {
		if (!options.host || !options.port || !options.token) {
			throw new Error('Runtime bridge host, port, and token must be configured explicitly');
		}
		this.socket = new WebSocket(`ws://${options.host}:${options.port}`);
		this.socket.on('open', () => {
			this.send(createHelloMessage(options.token));
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
}
