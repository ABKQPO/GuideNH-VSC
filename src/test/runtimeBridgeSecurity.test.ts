import * as assert from 'assert';
import {
	createRuntimeBridgeWebSocketUrl,
	isLoopbackHost,
	normalizeRuntimeBridgeHost,
	resolveRuntimeBridgeConnectionParams
} from '../common/runtimeBridgeSecurity';

suite('GuideNH runtime bridge security', () => {
	test('normalizes loopback hosts before creating websocket urls', () => {
		const params = resolveRuntimeBridgeConnectionParams({
			host: ' LOCALHOST ',
			port: 8765,
			token: 'secret',
			allowRemote: false
		});

		assert.strictEqual(params.host, 'localhost');
		assert.strictEqual(createRuntimeBridgeWebSocketUrl(params), 'ws://localhost:8765');
		assert.strictEqual(normalizeRuntimeBridgeHost('::1'), '[::1]');
		assert.strictEqual(isLoopbackHost('[::1]'), true);
	});

	test('rejects host values that are not plain hosts', () => {
		assert.throws(
			() => normalizeRuntimeBridgeHost('ws://127.0.0.1'),
			/host name or IP address/
		);
		assert.throws(
			() => normalizeRuntimeBridgeHost('127.0.0.1/path'),
			/host name or IP address/
		);
		assert.throws(
			() => normalizeRuntimeBridgeHost('user@127.0.0.1'),
			/host name or IP address/
		);
	});

	test('requires bracketed ipv6 hosts', () => {
		assert.throws(
			() => normalizeRuntimeBridgeHost('fe80::1'),
			/must be bracketed/
		);
		assert.strictEqual(normalizeRuntimeBridgeHost('[fe80::1]'), '[fe80::1]');
	});

	test('rejects remote hosts unless remote access is explicit', () => {
		assert.throws(
			() => resolveRuntimeBridgeConnectionParams({
				host: 'example.com',
				port: 8765,
				token: 'secret',
				allowRemote: false
			}),
			/must be local/
		);

		const params = resolveRuntimeBridgeConnectionParams({
			host: 'Example.COM',
			port: 8765,
			token: 'secret',
			allowRemote: true
		});
		assert.strictEqual(params.host, 'example.com');
	});
});
