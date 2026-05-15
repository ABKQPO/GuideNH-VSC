import * as assert from 'assert';
import { WebSocketServer } from 'ws';
import { RuntimeBridgeClient, RuntimeBridgeStatus } from '../server/runtime/runtimeBridgeClient';
import { SemanticCache } from '../server/runtime/semanticCache';

suite('GuideNH runtime bridge client', () => {
	test('queries semantic pages after hello succeeds', async () => {
		const server = new WebSocketServer({ port: 0 });
		const port = await listenPort(server);
		const cache = new SemanticCache();
		const client = new RuntimeBridgeClient(cache);
		const queriedCapabilities = new Set<string>();

		server.on('connection', (socket) => {
			socket.on('message', (data) => {
				const message = JSON.parse(data.toString()) as { id: string; method: string; payload?: { capability?: string } };
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
					assert.ok(message.payload?.capability);
					queriedCapabilities.add(message.payload.capability);
					socket.send(JSON.stringify({
						id: message.id,
						type: 'response',
						method: 'semantic.query',
						protocol: 1,
						payload: {
							capability: message.payload.capability,
							version: 7,
							entries: [{ id: 'minecraft:stone', label: 'Stone' }],
							nextCursor: null
						}
					}));
				}
			});
		});

		try {
			client.connect({ host: '127.0.0.1', port, token: 'secret', allowRemote: false });
			await waitFor(() => cache.getVersion('items') === 7 && cache.getVersion('pages') === 7);
			assert.strictEqual(cache.queryPrefix('items', 'minecraft:s')[0]?.label, 'Stone');
			assert.deepStrictEqual(
				Array.from(queriedCapabilities).sort(),
				['categories', 'items', 'keybinds', 'mods', 'ores', 'pages', 'quests', 'recipes', 'sounds']
			);
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
			client.connect({ host: '127.0.0.1', port, token: 'secret', allowRemote: false });
			await waitFor(() => cache.getVersion('items') === 8);
			assert.deepStrictEqual(cache.queryPrefix('items', 'minecraft:').map((entry) => entry.id), ['minecraft:stone', 'minecraft:dirt']);
		} finally {
			client.disconnect();
			await closeServer(server);
		}
	});

	test('publishes connected status after hello succeeds', async () => {
		const server = new WebSocketServer({ port: 0 });
		const port = await listenPort(server);
		const statuses: RuntimeBridgeStatus[] = [];
		const client = new RuntimeBridgeClient(new SemanticCache(), {
			onStatus: (status) => {
				statuses.push(status);
			}
		});

		server.on('connection', (socket) => {
			socket.on('message', (data) => {
				const message = JSON.parse(data.toString()) as { id: string; method: string };
				if (message.method === 'hello') {
					socket.send(JSON.stringify(response(message.id, 'hello', { serverName: 'GuideNH', protocol: 1, limits: { maxPageSize: 200 } })));
				}
			});
		});

		try {
			client.connect({ host: '127.0.0.1', port, token: 'secret', allowRemote: false });
			await waitFor(() => statuses.some((status) => status.state === 'connected'));
			assert.strictEqual(statuses[0].state, 'connecting');
			assert.ok(statuses.some((status) => status.state === 'connected'));
		} finally {
			client.disconnect();
			await closeServer(server);
		}
	});

	test('publishes error status when websocket connection fails', async () => {
		const statuses: RuntimeBridgeStatus[] = [];
		const client = new RuntimeBridgeClient(new SemanticCache(), {
			onStatus: (status) => {
				statuses.push(status);
			}
		});

		client.connect({ host: '127.0.0.1', port: 9, token: 'secret', allowRemote: false });

		await waitFor(() => statuses.some((status) => status.state === 'error'));
		assert.ok(statuses.find((status) => status.state === 'error')?.message);
		client.disconnect();
	});

	test('rejects document validation before the runtime bridge is connected', () => {
		const statuses: RuntimeBridgeStatus[] = [];
		const client = new RuntimeBridgeClient(new SemanticCache(), {
			onStatus: (status) => {
				statuses.push(status);
			}
		});

		assert.throws(
			() => client.validateDocument({ uri: 'file:///repo/page.md', languageId: 'markdown', text: '# Page' }),
			/must be connected/
		);
		assert.strictEqual(statuses[0].state, 'error');
	});

	test('rejects remote runtime bridge connections unless explicitly allowed', () => {
		const client = new RuntimeBridgeClient(new SemanticCache());
		assert.throws(
			() => client.connect({ host: '192.0.2.10', port: 8765, token: 'secret', allowRemote: false }),
			/must be local/
		);
	});

	test('rejects oversized semantic result pages before caching entries', async () => {
		const server = new WebSocketServer({ port: 0 });
		const port = await listenPort(server);
		const cache = new SemanticCache();
		const statuses: RuntimeBridgeStatus[] = [];
		const client = new RuntimeBridgeClient(cache, {
			onStatus: (status) => {
				statuses.push(status);
			}
		});

		server.on('connection', (socket) => {
			socket.on('message', (data) => {
				const message = JSON.parse(data.toString()) as { id: string; method: string; payload?: { capability?: string } };
				if (message.method === 'hello') {
					socket.send(JSON.stringify(response(message.id, 'hello', { serverName: 'GuideNH', protocol: 1, limits: { maxPageSize: 200 } })));
					return;
				}
				if (message.method === 'semantic.query' && message.payload?.capability === 'items') {
					socket.send(JSON.stringify(response(message.id, 'semantic.query', {
						capability: 'items',
						version: 9,
						entries: Array.from({ length: 501 }, (_, index) => ({ id: `minecraft:item_${index}` })),
						nextCursor: null
					})));
				}
			});
		});

		try {
			client.connect({ host: '127.0.0.1', port, token: 'secret', allowRemote: false });
			await waitFor(() => statuses.some((status) => status.state === 'error'));
			assert.strictEqual(cache.getVersion('items'), 0);
			assert.ok(statuses.find((status) => status.state === 'error')?.message?.includes('too large'));
		} finally {
			client.disconnect();
			await closeServer(server);
		}
	});

	test('rejects semantic results that were not requested', async () => {
		const server = new WebSocketServer({ port: 0 });
		const port = await listenPort(server);
		const cache = new SemanticCache();
		const statuses: RuntimeBridgeStatus[] = [];
		const client = new RuntimeBridgeClient(cache, {
			onStatus: (status) => {
				statuses.push(status);
			}
		});

		server.on('connection', (socket) => {
			socket.on('message', (data) => {
				const message = JSON.parse(data.toString()) as { id: string; method: string };
				if (message.method === 'hello') {
					socket.send(JSON.stringify(response(message.id, 'hello', { serverName: 'GuideNH', protocol: 1, limits: { maxPageSize: 200 } })));
					socket.send(JSON.stringify(response('unexpected', 'semantic.query', {
						capability: 'unknown',
						version: 1,
						entries: [{ id: 'bad:value' }],
						nextCursor: null
					})));
				}
			});
		});

		try {
			client.connect({ host: '127.0.0.1', port, token: 'secret', allowRemote: false });
			await waitFor(() => statuses.some((status) => status.state === 'error'));
			assert.strictEqual(cache.getVersion('unknown'), 0);
			assert.ok(statuses.find((status) => status.state === 'error')?.message?.includes('not requested'));
		} finally {
			client.disconnect();
			await closeServer(server);
		}
	});

	test('rejects oversized runtime bridge messages', async () => {
		const server = new WebSocketServer({ port: 0 });
		const port = await listenPort(server);
		const statuses: RuntimeBridgeStatus[] = [];
		const client = new RuntimeBridgeClient(new SemanticCache(), {
			onStatus: (status) => {
				statuses.push(status);
			}
		});

		server.on('connection', (socket) => {
			socket.on('message', (data) => {
				const message = JSON.parse(data.toString()) as { id: string; method: string };
				if (message.method === 'hello') {
					socket.send(JSON.stringify(response(message.id, 'hello', { serverName: 'GuideNH', protocol: 1, limits: { maxPageSize: 200 } })));
					socket.send('x'.repeat(262145));
				}
			});
		});

		try {
			client.connect({ host: '127.0.0.1', port, token: 'secret', allowRemote: false });
			await waitFor(() => statuses.some((status) => status.state === 'error'));
			assert.ok(statuses.find((status) => status.state === 'error')?.message?.includes('too large'));
		} finally {
			client.disconnect();
			await closeServer(server);
		}
	});

	test('sends manual document validation without oversized payloads', async () => {
		const server = new WebSocketServer({ port: 0 });
		const port = await listenPort(server);
		const cache = new SemanticCache();
		const client = new RuntimeBridgeClient(cache);
		const validationRequests: unknown[] = [];

		server.on('connection', (socket) => {
			socket.on('message', (data) => {
				const message = JSON.parse(data.toString()) as { id: string; method: string; payload?: unknown };
				if (message.method === 'hello') {
					socket.send(JSON.stringify(response(message.id, 'hello', { serverName: 'GuideNH', protocol: 1, limits: { maxPageSize: 200 } })));
					return;
				}
				if (message.method === 'document.validate') {
					validationRequests.push(message.payload);
					socket.send(JSON.stringify(response(message.id, 'document.validate', { diagnostics: [] })));
				}
			});
		});

		try {
			client.connect({ host: '127.0.0.1', port, token: 'secret', allowRemote: false });
			await waitFor(() => cache.getVersion('items') === 0 && validationRequests.length === 0);
			client.validateDocument({ uri: 'file:///repo/page.md', languageId: 'markdown', text: '# Page' });
			await waitFor(() => validationRequests.length === 1);
			assert.deepStrictEqual(validationRequests, [{ uri: 'file:///repo/page.md', languageId: 'markdown', text: '# Page' }]);
			assert.throws(
				() => client.validateDocument({ uri: 'file:///repo/large.md', languageId: 'markdown', text: 'x'.repeat(262145) }),
				/too large/
			);
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
