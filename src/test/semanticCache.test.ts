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

	test('matches item ids by namespace path segments and compact forms', () => {
		const cache = new SemanticCache();
		cache.replace('items', 5, [
			{ id: 'gregtech:gt.blockmachines', label: 'Basic Machine Hull', detail: 'gregtech:gt.blockmachines:0' },
			{ id: 'minecraft:crafting_table', label: 'Crafting Table', detail: 'minecraft:crafting_table:0' },
			{ id: 'minecraft:stone', label: 'Stone', detail: 'minecraft:stone:0' }
		]);

		assert.deepStrictEqual(cache.queryPrefix('items', 'gregtech').map((entry) => entry.id), ['gregtech:gt.blockmachines']);
		assert.deepStrictEqual(cache.queryPrefix('items', 'gt.block').map((entry) => entry.id), ['gregtech:gt.blockmachines']);
		assert.deepStrictEqual(cache.queryPrefix('items', 'crafting_t').map((entry) => entry.id), ['minecraft:crafting_table']);
		assert.deepStrictEqual(cache.queryPrefix('items', 'craftingtable').map((entry) => entry.id), ['minecraft:crafting_table']);
	});

	test('prioritizes namespace matches for short item prefixes', () => {
		const cache = new SemanticCache();
		cache.replace('items', 6, [
			{ id: 'minecraft:grass', label: 'Grass' },
			{ id: 'minecraft:gravel', label: 'Gravel' },
			{ id: 'gregtech:gt.blockmachines', label: 'Basic Machine Hull', detail: 'gregtech:gt.blockmachines:0' },
			{ id: 'gregtech:greenhouse_controller', label: 'Greenhouse Controller', detail: 'gregtech:greenhouse_controller:0' }
		]);

		assert.deepStrictEqual(cache.queryPrefix('items', 'gr', 2).map((entry) => entry.id), [
			'gregtech:greenhouse_controller',
			'gregtech:gt.blockmachines'
		]);
	});

	test('matches item ids by token initials for abbreviated prefixes', () => {
		const cache = new SemanticCache();
		cache.replace('items', 7, [
			{ id: 'gregtech:gt.blockmachines', label: 'Basic Machine Hull', detail: 'gregtech:gt.blockmachines:0' },
			{ id: 'gregtech:greenhouse_controller', label: 'Greenhouse Controller', detail: 'gregtech:greenhouse_controller:0' }
		]);

		assert.deepStrictEqual(cache.queryPrefix('items', 'gtb', 1).map((entry) => entry.id), ['gregtech:gt.blockmachines']);
	});

	test('matches item labels by acronym prefixes', () => {
		const cache = new SemanticCache();
		cache.replace('items', 8, [
			{ id: 'gregtech:gt.blockmachines:1000', label: 'Electric Blast Furnace', detail: 'gregtech:gt.blockmachines:1000' },
			{ id: 'gregtech:gt.blockmachines:1003', label: 'Multi Smelter', detail: 'gregtech:gt.blockmachines:1003' }
		]);

		assert.deepStrictEqual(cache.queryPrefix('items', 'ebf', 1).map((entry) => entry.id), ['gregtech:gt.blockmachines:1000']);
	});

	test('marks cache stale after disconnect', () => {
		const cache = new SemanticCache();
		cache.replace('items', 1, [{ id: 'minecraft:stone' }]);
		cache.markStale();
		assert.strictEqual(cache.isStale('items'), true);
	});
});
