import * as assert from 'assert';
import { WebSocketServer } from 'ws';
import { RuntimeBridgeClient } from '../server/runtime/runtimeBridgeClient';
import { SemanticCache } from '../server/runtime/semanticCache';

suite('GuideNH runtime bridge client', () => {
	test('queries semantic pages after hello succeeds', async () => {
		const server = new WebSocketServer({ port: 0 });
		const port = await listenPort(server);
		const cache = new SemanticCache();
		const client = new RuntimeBridgeClient(cache);

		server.on('connection', (socket) => {
			socket.on('message', (data) => {
				const message = JSON.parse(data.toString()) as { id: string; method: string };
				if (message.method === 'hello') {
					socket.send(JSON.stringify({
						id: message.id,
						type: 'response',
						method: 'hello',
						protocol: 1,
						payload: {
							serverName: 'GuideNH',
							protocol: 1,
							limits: { maxPageSize: 200 }
						}
					}));
					return;
				}
				if (message.method === 'semantic.query') {
					socket.send(JSON.stringify({
						id: message.id,
						type: 'response',
						method: 'semantic.query',
						protocol: 1,
						payload: {
							capability: 'items',
							version: 7,
							entries: [{ id: 'minecraft:stone', label: 'Stone' }],
							nextCursor: null
						}
					}));
				}
			});
		});

		try {
			client.connect({ host: '127.0.0.1', port, token: 'secret' });
			await waitFor(() => cache.getVersion('items') === 7);
			assert.strictEqual(cache.queryPrefix('items', 'minecraft:s')[0]?.label, 'Stone');
		} finally {
			client.disconnect();
			await closeServer(server);
		}
	});

	test('follows semantic cursors before replacing cache entries', async () => {
		const server = new WebSocketServer({ port: 0 });
		const port = await listenPort(server);
		const cache = new SemanticCache();
		const client = new RuntimeBridgeClient(cache);

		server.on('connection', (socket) => {
			socket.on('message', (data) => {
				const message = JSON.parse(data.toString()) as { id: string; method: string; payload: { capability: string; cursor: string } };
				if (message.method === 'hello') {
					socket.send(JSON.stringify(response(message.id, 'hello', { serverName: 'GuideNH', protocol: 1, limits: { maxPageSize: 200 } })));
					return;
				}
				if (message.method === 'semantic.query' && message.payload.capability === 'items') {
					const payload = message.payload.cursor
						? { capability: 'items', version: 8, entries: [{ id: 'minecraft:dirt', label: 'Dirt' }], nextCursor: null }
						: { capability: 'items', version: 8, entries: [{ id: 'minecraft:stone', label: 'Stone' }], nextCursor: '1' };
					socket.send(JSON.stringify(response(message.id, 'semantic.query', payload)));
				}
			});
		});

		try {
			client.connect({ host: '127.0.0.1', port, token: 'secret' });
			await waitFor(() => cache.getVersion('items') === 8);
			assert.deepStrictEqual(cache.queryPrefix('items', 'minecraft:').map((entry) => entry.id), ['minecraft:stone', 'minecraft:dirt']);
		} finally {
			client.disconnect();
			await closeServer(server);
		}
	});
});

function response(id: string, method: string, payload: unknown): object {
	return {
		id,
		type: 'response',
		method,
		protocol: 1,
		payload
	};
}

function listenPort(server: WebSocketServer): Promise<number> {
	return new Promise((resolve) => {
		server.on('listening', () => {
			const address = server.address();
			assert.ok(address && typeof address === 'object');
			resolve(address.port);
		});
	});
}

function waitFor(predicate: () => boolean): Promise<void> {
	return new Promise((resolve, reject) => {
		const deadline = Date.now() + 2000;
		const timer = setInterval(() => {
			if (predicate()) {
				clearInterval(timer);
				resolve();
				return;
			}
			if (Date.now() > deadline) {
				clearInterval(timer);
				reject(new Error('Timed out waiting for semantic cache update'));
			}
		}, 20);
	});
}

function closeServer(server: WebSocketServer): Promise<void> {
	return new Promise((resolve, reject) => {
		server.close((error) => {
			if (error) {
				reject(error);
				return;
			}
			resolve();
		});
	});
}
