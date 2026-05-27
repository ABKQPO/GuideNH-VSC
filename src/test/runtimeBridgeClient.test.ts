import * as assert from 'assert';
import { WebSocketServer } from 'ws';
import { RuntimeBridgeClient, RuntimeBridgeStatus } from '../server/runtime/runtimeBridgeClient';
import { PreviewResolvePayload, PreviewSearchPayload } from '../common/protocol';
import { SemanticCache } from '../server/runtime/semanticCache';

const DefaultCapabilities = ['categories', 'commands', 'entities', 'items', 'keybinds', 'mods', 'ores', 'pages', 'quests', 'recipes', 'sounds', 'structurelib'];

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
				if (message.method === 'capabilities') {
					socket.send(JSON.stringify(response(message.id, 'capabilities', { capabilities: DefaultCapabilities })));
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
			await waitFor(() => cache.getVersion('pages') === 7 && cache.getVersion('entities') === 7);
			assert.strictEqual(cache.getVersion('items'), 0);
			assert.deepStrictEqual(
				Array.from(queriedCapabilities).sort(),
				['commands', 'entities', 'keybinds', 'pages', 'quests', 'recipes', 'sounds', 'structurelib']
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
				if (message.method === 'capabilities') {
					socket.send(JSON.stringify(response(message.id, 'capabilities', { capabilities: DefaultCapabilities })));
					return;
				}
				if (message.method === 'semantic.query' && message.payload.capability === 'pages') {
					const payload = message.payload.cursor
						? { capability: 'pages', version: 8, entries: [{ id: 'dirt.md', label: 'Dirt' }], nextCursor: null }
						: { capability: 'pages', version: 8, entries: [{ id: 'stone.md', label: 'Stone' }], nextCursor: '1' };
					socket.send(JSON.stringify(response(message.id, 'semantic.query', payload)));
				}
			});
		});

		try {
			client.connect({ host: '127.0.0.1', port, token: 'secret', allowRemote: false });
			await waitFor(() => cache.getVersion('pages') === 8);
			assert.deepStrictEqual(cache.queryPrefix('pages', '').map((entry) => entry.id), ['dirt.md', 'stone.md']);
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
					return;
				}
				if (message.method === 'capabilities') {
					socket.send(JSON.stringify(response(message.id, 'capabilities', { capabilities: DefaultCapabilities })));
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

	test('uses server-reported capabilities before bootstrapping semantic queries', async () => {
		const server = new WebSocketServer({ port: 0 });
		const port = await listenPort(server);
		const cache = new SemanticCache();
		const client = new RuntimeBridgeClient(cache);
		const queriedCapabilities: string[] = [];

		server.on('connection', (socket) => {
			socket.on('message', (data) => {
				const message = JSON.parse(data.toString()) as { id: string; method: string; payload?: { capability?: string } };
				if (message.method === 'hello') {
					socket.send(JSON.stringify(response(message.id, 'hello', { serverName: 'GuideNH', protocol: 1, limits: { maxPageSize: 200 } })));
					return;
				}
				if (message.method === 'capabilities') {
					socket.send(JSON.stringify(response(message.id, 'capabilities', { capabilities: ['items', 'pages'] })));
					return;
				}
				if (message.method === 'semantic.query' && message.payload?.capability) {
					queriedCapabilities.push(message.payload.capability);
					socket.send(JSON.stringify(response(message.id, 'semantic.query', {
						capability: message.payload.capability,
						version: 1,
						entries: [],
						nextCursor: null
					})));
				}
			});
		});

		try {
			client.connect({ host: '127.0.0.1', port, token: 'secret', allowRemote: false });
			await waitFor(() => queriedCapabilities.length === 1);
			assert.deepStrictEqual(queriedCapabilities, ['pages']);
		} finally {
			client.disconnect();
			await closeServer(server);
		}
	});

	test('sends filtered semantic query payloads for dynamic structurelib requests', async () => {
		const server = new WebSocketServer({ port: 0 });
		const port = await listenPort(server);
		const client = new RuntimeBridgeClient(new SemanticCache());
		const semanticPayloads: Array<{ capability?: string; prefix?: string; filters?: Record<string, string> }> = [];

		server.on('connection', (socket) => {
			socket.on('message', (data) => {
				const message = JSON.parse(data.toString()) as { id: string; method: string; payload?: { capability?: string; prefix?: string; filters?: Record<string, string> } };
				if (message.method === 'hello') {
					socket.send(JSON.stringify(response(message.id, 'hello', { serverName: 'GuideNH', protocol: 1, limits: { maxPageSize: 200 } })));
					return;
				}
				if (message.method === 'capabilities') {
					socket.send(JSON.stringify(response(message.id, 'capabilities', { capabilities: DefaultCapabilities })));
					return;
				}
				if (message.method === 'semantic.query' && message.id.startsWith('semantic.query.dynamic.')) {
					semanticPayloads.push(message.payload ?? {});
					socket.send(JSON.stringify(response(message.id, 'semantic.query', {
						capability: 'structurelib',
						version: 1,
						entries: [{ id: '3', label: 'main', detail: 'Channel main for gregtech:machine:1' }],
						nextCursor: null
					})));
					return;
				}
				if (message.method === 'semantic.query') {
					socket.send(JSON.stringify(response(message.id, 'semantic.query', {
						capability: message.payload?.capability,
						version: 1,
						entries: [],
						nextCursor: null
					})));
				}
			});
		});

		try {
			client.connect({ host: '127.0.0.1', port, token: 'secret', allowRemote: false });
			await waitFor(() => semanticPayloads.length === 0);
			const entries = await client.querySemanticEntries({
				capability: 'structurelib',
				prefix: '3',
				filters: {
					attribute: 'channel',
					controller: 'gregtech:machine:1'
				}
			});
			assert.strictEqual(entries[0]?.id, '3');
			assert.deepStrictEqual(semanticPayloads, [{
				capability: 'structurelib',
				cursor: '',
				limit: 200,
				prefix: '3',
				filters: {
					attribute: 'channel',
					controller: 'gregtech:machine:1'
				}
			}]);
		} finally {
			client.disconnect();
			await closeServer(server);
		}
	});

	test('supports dynamic hover semantic queries for structurelib orientation values', async () => {
		const server = new WebSocketServer({ port: 0 });
		const port = await listenPort(server);
		const client = new RuntimeBridgeClient(new SemanticCache());
		const semanticPayloads: Array<{ capability?: string; prefix?: string; filters?: Record<string, string> }> = [];

		server.on('connection', (socket) => {
			socket.on('message', (data) => {
				const message = JSON.parse(data.toString()) as { id: string; method: string; payload?: { capability?: string; prefix?: string; filters?: Record<string, string> } };
				if (message.method === 'hello') {
					socket.send(JSON.stringify(response(message.id, 'hello', { serverName: 'GuideNH', protocol: 1, limits: { maxPageSize: 200 } })));
					return;
				}
				if (message.method === 'capabilities') {
					socket.send(JSON.stringify(response(message.id, 'capabilities', { capabilities: DefaultCapabilities })));
					return;
				}
				if (message.method === 'semantic.query' && message.id.startsWith('semantic.query.dynamic.')) {
					semanticPayloads.push(message.payload ?? {});
					socket.send(JSON.stringify(response(message.id, 'semantic.query', {
						capability: 'structurelib',
						version: 1,
						entries: [{ id: 'north', label: 'North', detail: 'Allowed orientation for gregtech:machine:1' }],
						nextCursor: null
					})));
					return;
				}
				if (message.method === 'semantic.query') {
					socket.send(JSON.stringify(response(message.id, 'semantic.query', {
						capability: message.payload?.capability,
						version: 1,
						entries: [],
						nextCursor: null
					})));
				}
			});
		});

		try {
			client.connect({ host: '127.0.0.1', port, token: 'secret', allowRemote: false });
			await waitFor(() => semanticPayloads.length === 0);
			const entries = await client.querySemanticEntries({
				capability: 'structurelib',
				prefix: 'north',
				filters: {
					attribute: 'facing',
					controller: 'gregtech:machine:1',
					rotation: 'clockwise'
				}
			});
			assert.strictEqual(entries[0]?.id, 'north');
			assert.deepStrictEqual(semanticPayloads, [{
				capability: 'structurelib',
				cursor: '',
				limit: 200,
				prefix: 'north',
				filters: {
					attribute: 'facing',
					controller: 'gregtech:machine:1',
					rotation: 'clockwise'
				}
			}]);
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
		}, {
			reconnectDelayMs: 5,
			maxReconnectAttempts: 1
		});

		client.connect({ host: '127.0.0.1', port: 9, token: 'secret', allowRemote: false });

		await waitFor(() => statuses.some((status) => status.state === 'error'));
		assert.ok(statuses.some((status) => status.state === 'connecting'));
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
				if (message.method === 'capabilities') {
					socket.send(JSON.stringify(response(message.id, 'capabilities', { capabilities: DefaultCapabilities })));
					return;
				}
				if (message.method === 'semantic.query' && message.payload?.capability === 'pages') {
					socket.send(JSON.stringify(response(message.id, 'semantic.query', {
						capability: 'pages',
						version: 9,
						entries: Array.from({ length: 501 }, (_, index) => ({ id: `page_${index}.md` })),
						nextCursor: null
					})));
				}
			});
		});

		try {
			client.connect({ host: '127.0.0.1', port, token: 'secret', allowRemote: false });
			await waitFor(() => statuses.some((status) => status.state === 'error'));
			assert.strictEqual(cache.getVersion('pages'), 0);
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
					return;
				}
				if (message.method === 'capabilities') {
					socket.send(JSON.stringify(response(message.id, 'capabilities', { capabilities: DefaultCapabilities })));
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
					return;
				}
				if (message.method === 'capabilities') {
					socket.send(JSON.stringify(response(message.id, 'capabilities', { capabilities: DefaultCapabilities })));
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

	test('limits websocket payloads before dispatching messages', async () => {
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
				const message = JSON.parse(data.toString()) as { method: string };
				if (message.method === 'hello') {
					socket.send('x'.repeat(262145));
				}
			});
		});

		try {
			client.connect({ host: '127.0.0.1', port, token: 'secret', allowRemote: false });
			await waitFor(() => statuses.some((status) => status.state === 'error'));
			assert.ok(statuses.find((status) => status.state === 'error')?.message);
		} finally {
			client.disconnect();
			await closeServer(server);
		}
	});

	test('rejects malformed runtime bridge envelopes before dispatching them', async () => {
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
				const message = JSON.parse(data.toString()) as { method: string };
				if (message.method === 'hello') {
					socket.send(JSON.stringify({ type: 'response', method: 'hello', protocol: 1 }));
				}
			});
		});

		try {
			client.connect({ host: '127.0.0.1', port, token: 'secret', allowRemote: false });
			await waitFor(() => statuses.some((status) => status.state === 'error'));
			assert.ok(statuses.find((status) => status.state === 'error')?.message?.includes('missing payload'));
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
				if (message.method === 'capabilities') {
					socket.send(JSON.stringify(response(message.id, 'capabilities', { capabilities: DefaultCapabilities })));
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

	test('tracks manual document validation request ids', async () => {
		const server = new WebSocketServer({ port: 0 });
		const port = await listenPort(server);
		const client = new RuntimeBridgeClient(new SemanticCache());
		const validationIds: string[] = [];

		server.on('connection', (socket) => {
			socket.on('message', (data) => {
				const message = JSON.parse(data.toString()) as { id: string; method: string };
				if (message.method === 'hello') {
					socket.send(JSON.stringify(response(message.id, 'hello', { serverName: 'GuideNH', protocol: 1, limits: { maxPageSize: 200 } })));
					return;
				}
				if (message.method === 'capabilities') {
					socket.send(JSON.stringify(response(message.id, 'capabilities', { capabilities: DefaultCapabilities })));
					return;
				}
				if (message.method === 'document.validate') {
					validationIds.push(message.id);
					socket.send(JSON.stringify(response(message.id, 'document.validate', { diagnostics: [] })));
				}
			});
		});

		try {
			client.connect({ host: '127.0.0.1', port, token: 'secret', allowRemote: false });
			await waitFor(() => validationIds.length === 0);
			client.validateDocument({ uri: 'file:///repo/first.md', languageId: 'markdown', text: '# First' });
			client.validateDocument({ uri: 'file:///repo/second.md', languageId: 'markdown', text: '# Second' });
			await waitFor(() => validationIds.length === 2);
			assert.deepStrictEqual(validationIds, ['document.validate.1', 'document.validate.2']);
		} finally {
			client.disconnect();
			await closeServer(server);
		}
	});

	test('rejects document validation responses that were not requested', async () => {
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
					socket.send(JSON.stringify(response('document.validate.999', 'document.validate', { diagnostics: [] })));
					return;
				}
				if (message.method === 'capabilities') {
					socket.send(JSON.stringify(response(message.id, 'capabilities', { capabilities: DefaultCapabilities })));
				}
			});
		});

		try {
			client.connect({ host: '127.0.0.1', port, token: 'secret', allowRemote: false });
			await waitFor(() => statuses.some((status) => status.state === 'error'));
			assert.ok(statuses.find((status) => status.state === 'error')?.message?.includes('not requested'));
		} finally {
			client.disconnect();
			await closeServer(server);
		}
	});

	test('sends preview search and resolve requests without touching semantic cache', async () => {
		const server = new WebSocketServer({ port: 0 });
		const port = await listenPort(server);
		const cache = new SemanticCache();
		const client = new RuntimeBridgeClient(cache);
		const searchPayloads: PreviewSearchPayload[] = [];
		const resolvePayloads: PreviewResolvePayload[] = [];

		server.on('connection', (socket) => {
			socket.on('message', (data) => {
				const message = JSON.parse(data.toString()) as {
					id: string;
					method: string;
					payload?: PreviewSearchPayload | PreviewResolvePayload | { capability?: string };
				};
				if (message.method === 'hello') {
					socket.send(JSON.stringify(response(message.id, 'hello', { serverName: 'GuideNH', protocol: 1, limits: { maxPageSize: 200 } })));
					return;
				}
				if (message.method === 'capabilities') {
					socket.send(JSON.stringify(response(message.id, 'capabilities', { capabilities: DefaultCapabilities })));
					return;
				}
				if (message.method === 'preview.search') {
					searchPayloads.push(message.payload as PreviewSearchPayload);
					socket.send(JSON.stringify(response(message.id, 'preview.search', {
						capability: 'items',
						version: 2,
						entries: [{ id: 'minecraft:stone', label: 'Stone', detail: 'minecraft:stone:0', previewKey: 'items|minecraft:stone|0|1|default|0', matchKind: 'id-prefix' }],
						nextCursor: null
					})));
					return;
				}
				if (message.method === 'preview.resolve') {
					resolvePayloads.push(message.payload as PreviewResolvePayload);
					socket.send(JSON.stringify(response(message.id, 'preview.resolve', {
						capability: 'items',
						previewKey: 'items|minecraft:stone|0|1|default|0',
						id: 'minecraft:stone',
						displayName: 'Stone',
						detail: 'minecraft:stone:0',
						meta: 0,
						count: 1,
						nbt: '',
						tooltipLines: ['Stone'],
						iconPngBase64: 'ZmFrZQ==',
						pixelWidth: 64,
						pixelHeight: 64
					})));
					return;
				}
				if (message.method === 'semantic.query') {
					socket.send(JSON.stringify(response(message.id, 'semantic.query', {
						capability: message.payload?.capability,
						version: 1,
						entries: [],
						nextCursor: null
					})));
				}
			});
		});

		try {
			client.connect({ host: '127.0.0.1', port, token: 'secret', allowRemote: false });
			await waitFor(() => cache.getVersion('pages') >= 0);
			const searchResult = await client.queryPreviewSearch({
				capability: 'items',
				cursor: '',
				limit: 80,
				prefix: 'stone',
				filters: { source: 'picker' }
			});
			const resolveResult = await client.queryPreviewResolve({
				capability: 'items',
				id: 'minecraft:stone',
				count: 1,
				nbt: '',
				renderVariant: 'picker',
				filters: {}
			});
			assert.strictEqual(searchResult.entries[0]?.id, 'minecraft:stone');
			assert.strictEqual(resolveResult.id, 'minecraft:stone');
			assert.strictEqual(cache.getVersion('items'), 0);
			assert.deepStrictEqual(searchPayloads, [{
				capability: 'items',
				cursor: '',
				limit: 80,
				prefix: 'stone',
				filters: { source: 'picker' }
			}]);
			assert.deepStrictEqual(resolvePayloads, [{
				capability: 'items',
				id: 'minecraft:stone',
				count: 1,
				nbt: '',
				renderVariant: 'picker',
				filters: {}
			}]);
		} finally {
			client.disconnect();
			await closeServer(server);
		}
	});

	test('does not publish a global error when a preview resolve request is rejected', async () => {
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
				const message = JSON.parse(data.toString()) as {
					id: string;
					method: string;
					payload?: { capability?: string };
				};
				if (message.method === 'hello') {
					socket.send(JSON.stringify(response(message.id, 'hello', {
						serverName: 'GuideNH',
						protocol: 1,
						limits: { maxPageSize: 200 }
					})));
					return;
				}
				if (message.method === 'capabilities') {
					socket.send(JSON.stringify(response(message.id, 'capabilities', { capabilities: DefaultCapabilities })));
					return;
				}
				if (message.method === 'preview.resolve') {
					socket.send(JSON.stringify({
						id: message.id,
						type: 'error',
						method: 'preview.resolve',
						protocol: 1,
						payload: {
							code: 'invalid_preview_query',
							message: 'Unknown item id',
							retryable: false
						}
					}));
					return;
				}
				if (message.method === 'semantic.query') {
					socket.send(JSON.stringify(response(message.id, 'semantic.query', {
						capability: message.payload?.capability,
						version: 1,
						entries: [],
						nextCursor: null
					})));
				}
			});
		});

		try {
			client.connect({ host: '127.0.0.1', port, token: 'secret', allowRemote: false });
			await waitFor(() => statuses.some((status) => status.state === 'connected'));
			await assert.rejects(
				() => client.queryPreviewResolve({
					capability: 'items',
					id: 'gregtech:missing',
					count: 1,
					nbt: '',
					renderVariant: 'inline',
					filters: { source: 'inline' }
				}),
				/Unknown item id/
			);
			assert.strictEqual(statuses.some((status) => status.state === 'error'), false);
		} finally {
			client.disconnect();
			await closeServer(server);
		}
	});

	test('retries after unexpected disconnect and resets after reconnect succeeds', async () => {
		const statuses: RuntimeBridgeStatus[] = [];
		const client = new RuntimeBridgeClient(new SemanticCache(), {
			onStatus: (status) => {
				statuses.push(status);
			}
		}, {
			reconnectDelayMs: 5,
			maxReconnectAttempts: 3
		});
		let helloCount = 0;
		const server = new WebSocketServer({ port: 0 });
		const port = await listenPort(server);
		server.on('connection', (socket) => {
			socket.on('message', (data) => {
				const message = JSON.parse(data.toString()) as { id: string; method: string };
				if (message.method === 'hello') {
					helloCount++;
					socket.send(JSON.stringify(response(message.id, 'hello', { serverName: 'GuideNH', protocol: 1, limits: { maxPageSize: 200 } })));
					socket.close();
					return;
				}
				if (message.method === 'capabilities') {
					socket.send(JSON.stringify(response(message.id, 'capabilities', { capabilities: DefaultCapabilities })));
				}
			});
		});

		try {
			client.connect({ host: '127.0.0.1', port, token: 'secret', allowRemote: false });
			await waitFor(() => helloCount >= 2);
			assert.ok(statuses.some((status) => status.state === 'connecting'));
			assert.ok(statuses.some((status) => status.state === 'connected'));
		} finally {
			client.disconnect();
			await closeServer(server);
		}
	});

	test('does not retry after manual disconnect', async () => {
		const server = new WebSocketServer({ port: 0 });
		const port = await listenPort(server);
		let helloCount = 0;
		const client = new RuntimeBridgeClient(new SemanticCache(), {}, {
			reconnectDelayMs: 5,
			maxReconnectAttempts: 3
		});
		server.on('connection', (socket) => {
			socket.on('message', (data) => {
				const message = JSON.parse(data.toString()) as { id: string; method: string };
				if (message.method === 'hello') {
					helloCount++;
					socket.send(JSON.stringify(response(message.id, 'hello', { serverName: 'GuideNH', protocol: 1, limits: { maxPageSize: 200 } })));
					return;
				}
				if (message.method === 'capabilities') {
					socket.send(JSON.stringify(response(message.id, 'capabilities', { capabilities: DefaultCapabilities })));
				}
			});
		});

		try {
			client.connect({ host: '127.0.0.1', port, token: 'secret', allowRemote: false });
			await waitFor(() => helloCount === 1);
			client.disconnect();
			await sleep(25);
			assert.strictEqual(helloCount, 1);
		} finally {
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

function sleep(durationMs: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, durationMs);
	});
}
