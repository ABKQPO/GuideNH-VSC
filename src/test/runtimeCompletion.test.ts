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

		assert.ok(completions.some((item) => item.label === 'minecraft:stone'));
	});

	test('completes runtime semantic values by tag and attribute', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const cache = new SemanticCache();
		cache.replace('sounds', 1, [{ id: 'minecraft:block.note_block.pling', label: 'Pling' }]);
		cache.replace('keybinds', 1, [{ id: 'key.jump', label: 'Jump' }]);
		cache.replace('recipes', 1, [{ id: 'gregtech:compressor/plate_iron', label: 'Iron Plate' }]);
		cache.replace('quests', 1, [{ id: 'quest.getting_started', label: 'Getting Started' }]);

		const soundItems = createGuideNhCompletions('<PlaySound trigger="minecraft:block.note', 37, schema, undefined, cache);
		const keybindItems = createGuideNhCompletions('<KeyBind id="key.j', 18, schema, undefined, cache);
		const recipeItems = createGuideNhCompletions('<Recipe id="gregtech:compressor', 29, schema, undefined, cache);
		const questItems = createGuideNhCompletions('<QuestCard id="quest.', 21, schema, undefined, cache);

		assert.deepStrictEqual(soundItems.map((item) => item.label), ['minecraft:block.note_block.pling']);
		assert.deepStrictEqual(keybindItems.map((item) => item.label), ['key.jump']);
		assert.deepStrictEqual(recipeItems.map((item) => item.label), ['gregtech:compressor/plate_iron']);
		assert.deepStrictEqual(questItems.map((item) => item.label), ['quest.getting_started']);
	});

	test('does not treat every id attribute as an item id', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const cache = new SemanticCache();
		cache.replace('items', 1, [{ id: 'minecraft:stone', label: 'Stone' }]);

		const completions = createGuideNhCompletions('<QuestCard id="minecraft:s', 23, schema, undefined, cache);

		assert.deepStrictEqual(completions.map((item) => item.label), []);
	});
});
