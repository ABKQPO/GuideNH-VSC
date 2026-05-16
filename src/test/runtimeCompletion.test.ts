import * as assert from 'assert';
import * as path from 'path';
import { createGuideNhCompletions } from '../server/providers/completion';
import { SemanticCache } from '../server/runtime/semanticCache';
import { loadGuideNhSchema } from '../server/schema/schemaLoader';

suite('GuideNH runtime completion', () => {
	test('completes item ids for id attributes', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const cache = new SemanticCache();
		cache.replace('items', 1, [{ id: 'minecraft:stone', label: 'Stone' }]);

		const completions = createGuideNhCompletions('<ItemLink id="minecraft:s', 24, schema, undefined, cache);

		assert.ok(completions.some((item) => item.insertText === 'minecraft:stone'));
	});

	test('completes runtime item ids for empty ItemImage prefixes', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const cache = new SemanticCache();
		cache.replace('items', 1, [{ id: 'minecraft:stone', label: 'Stone', detail: 'minecraft:stone:0' }]);
		const text = '<ItemImage id="';

		const completions = createGuideNhCompletions(text, text.length, schema, undefined, cache);

		assert.deepStrictEqual(completions.map((item) => item.label), ['Stone']);
		assert.strictEqual(completions[0].insertText, 'minecraft:stone');
	});

	test('completes runtime semantic values by tag and attribute', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const cache = new SemanticCache();
		cache.replace('sounds', 1, [{ id: 'minecraft:block.note_block.pling', label: 'Pling' }]);
		cache.replace('keybinds', 1, [{ id: 'key.jump', label: 'Jump' }]);
		cache.replace('commands', 1, [{ id: '/guidenhc open', label: 'Open guide page', detail: '/guidenhc open' }]);
		cache.replace('recipes', 1, [{ id: 'gregtech:compressor/plate_iron', label: 'Iron Plate', detail: 'gregtech:compressor/plate_iron' }]);
		cache.replace('quests', 1, [{ id: 'quest.getting_started', label: 'Getting Started' }]);
		cache.replace('items', 1, [{ id: 'minecraft:crafting_table', label: 'Crafting Table', detail: 'minecraft:crafting_table:0' }]);

		const soundItems = createGuideNhCompletions('<PlaySound sound="minecraft:block.note', 35, schema, undefined, cache);
		const keybindItems = createGuideNhCompletions('<KeyBind id="key.j', 18, schema, undefined, cache);
		const commandItems = createGuideNhCompletions('<CommandLink command="/guide', 27, schema, undefined, cache);
		const recipeItems = createGuideNhCompletions('<Recipe id="gregtech:compressor', 29, schema, undefined, cache);
		const questItems = createGuideNhCompletions('<QuestCard id="quest.', 21, schema, undefined, cache);
		const blockImageItems = createGuideNhCompletions('<BlockImage id="minecraft:cra', 28, schema, undefined, cache);
		const soundLinkItems = createGuideNhCompletions('<SoundLink sound="minecraft:block.note', 35, schema, undefined, cache);

		assert.deepStrictEqual(soundItems.map((item) => item.label), ['minecraft:block.note_block.pling']);
		assert.deepStrictEqual(keybindItems.map((item) => item.label), ['key.jump']);
		assert.deepStrictEqual(commandItems.map((item) => item.label), ['/guidenhc open']);
		assert.deepStrictEqual(recipeItems.map((item) => item.label), ['gregtech:compressor/plate_iron']);
		assert.deepStrictEqual(questItems.map((item) => item.label), ['quest.getting_started']);
		assert.deepStrictEqual(blockImageItems.map((item) => item.label), ['Crafting Table']);
		assert.strictEqual(blockImageItems[0].insertText, 'minecraft:crafting_table');
		assert.strictEqual(blockImageItems[0].detail, 'minecraft:crafting_table:0 - minecraft:crafting_table');
		assert.deepStrictEqual(soundLinkItems.map((item) => item.label), ['minecraft:block.note_block.pling']);
	});

	test('does not treat every id attribute as an item id', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const cache = new SemanticCache();
		cache.replace('items', 1, [{ id: 'minecraft:stone', label: 'Stone' }]);

		const completions = createGuideNhCompletions('<QuestCard id="minecraft:s', 23, schema, undefined, cache);

		assert.deepStrictEqual(completions.map((item) => item.label), []);
	});

	test('does not reuse controller cache entries for ImportStructureLib channel values', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const cache = new SemanticCache();
		cache.replace('structurelib', 1, [{ id: 'gregtech:gt.blockmachines:1000', label: 'Basic Machine Hull' }]);

		const completions = createGuideNhCompletions(
			'<ImportStructureLib controller="gregtech:gt.blockmachines:1000" channel="1',
			74,
			schema,
			undefined,
			cache
		);

		assert.deepStrictEqual(completions.map((item) => item.label), []);
	});
});
