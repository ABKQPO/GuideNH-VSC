import * as assert from 'assert';
import { createHelloMessage, isBridgeError } from '../common/protocol';

suite('GuideNH runtime protocol', () => {
	test('creates hello without logging token fields elsewhere', () => {
		const hello = createHelloMessage('secret');
		assert.strictEqual(hello.method, 'hello');
		assert.strictEqual(hello.payload.token, 'secret');
		assert.strictEqual(JSON.stringify({ method: hello.method }), '{"method":"hello"}');
	});

	test('detects bridge errors', () => {
		assert.strictEqual(isBridgeError({ code: 'auth.failed', message: 'Nope', retryable: false }), true);
		assert.strictEqual(isBridgeError({ message: 'Nope' }), false);
	});
});
