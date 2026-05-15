import * as assert from 'assert';
import { SemanticCache } from '../server/runtime/semanticCache';

suite('GuideNH semantic cache', () => {
	test('stores capability entries by version', () => {
		const cache = new SemanticCache();
		cache.replace('items', 3, [{ id: 'minecraft:stone', label: 'Stone' }]);
		assert.strictEqual(cache.queryPrefix('items', 'minecraft:s').length, 1);
		assert.strictEqual(cache.getVersion('items'), 3);
	});

	test('queries sorted runtime entries with bounded prefix scans', () => {
		const cache = new SemanticCache();
		cache.replace('items', 4, [
			{ id: 'minecraft:stone' },
			{ id: 'Minecraft:Stick' },
			{ id: 'minecraft:dirt' },
			{ id: 'minecraft:stone', label: 'Duplicate' }
		]);

		assert.deepStrictEqual(cache.queryPrefix('items', 'minecraft:s').map((entry) => entry.id), [
			'Minecraft:Stick',
			'minecraft:stone'
		]);
		assert.deepStrictEqual(cache.queryPrefix('items', 'minecraft:', 2).map((entry) => entry.id), [
			'minecraft:dirt',
			'Minecraft:Stick'
		]);
		assert.deepStrictEqual(cache.queryPrefix('items', 'minecraft:', 0), []);
	});

	test('marks cache stale after disconnect', () => {
		const cache = new SemanticCache();
		cache.replace('items', 1, [{ id: 'minecraft:stone' }]);
		cache.markStale();
		assert.strictEqual(cache.isStale('items'), true);
	});
});
