import * as assert from 'assert';
import { validateBridgeEnvelope } from '../server/runtime/runtimeBridgeEnvelopeGuard';

suite('GuideNH runtime bridge envelope guard', () => {
	test('accepts valid runtime bridge envelopes', () => {
		const envelope = validateBridgeEnvelope({
			id: 'semantic.items.0',
			type: 'response',
			method: 'semantic.query',
			protocol: 1,
			payload: { capability: 'items', version: 1, entries: [] }
		});

		assert.strictEqual(envelope.method, 'semantic.query');
	});

	test('rejects malformed runtime bridge envelopes', () => {
		assert.throws(
			() => validateBridgeEnvelope({ type: 'response', method: 'hello', protocol: 2, payload: {} }),
			/unsupported protocol/
		);
		assert.throws(
			() => validateBridgeEnvelope({ type: 'response', method: 'hello', protocol: 1 }),
			/missing payload/
		);
		assert.throws(
			() => validateBridgeEnvelope({ type: 'unknown', method: 'hello', protocol: 1, payload: {} }),
			/invalid type/
		);
	});
});
