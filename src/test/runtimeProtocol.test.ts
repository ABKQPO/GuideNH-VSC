import * as assert from 'assert';
import {
	createHelloMessage,
	createPreviewResolveMessage,
	createPreviewSearchMessage,
	createRuntimeDocumentValidateMessage,
	isBridgeError,
	MaxRuntimeDocumentBytes
} from '../common/protocol';

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

	test('creates manual document validation requests with a bounded payload contract', () => {
		const message = createRuntimeDocumentValidateMessage('validation.1', {
			uri: 'file:///repo/page.md',
			languageId: 'markdown',
			text: '# Page'
		});

		assert.strictEqual(MaxRuntimeDocumentBytes, 262144);
		assert.strictEqual(message.method, 'document.validate');
		assert.deepStrictEqual(message.payload, {
			uri: 'file:///repo/page.md',
			languageId: 'markdown',
			text: '# Page'
		});
	});

	test('creates preview search and resolve bridge messages', () => {
		const search = createPreviewSearchMessage('preview.search.1', 'items', '', 80, 'greg', { source: 'picker' });
		const resolve = createPreviewResolveMessage('preview.resolve.1', {
			capability: 'items',
			id: 'minecraft:stone',
			count: 1,
			nbt: '',
			renderVariant: 'picker',
			filters: {}
		});

		assert.strictEqual(search.method, 'preview.search');
		assert.deepStrictEqual(search.payload, {
			capability: 'items',
			cursor: '',
			limit: 80,
			prefix: 'greg',
			filters: { source: 'picker' }
		});
		assert.strictEqual(resolve.method, 'preview.resolve');
		assert.deepStrictEqual(resolve.payload, {
			capability: 'items',
			id: 'minecraft:stone',
			count: 1,
			nbt: '',
			renderVariant: 'picker',
			filters: {}
		});
	});
});
