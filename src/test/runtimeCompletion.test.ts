import * as assert from 'assert';
import * as path from 'path';
import { createGuideNhCompletionResult, createGuideNhCompletions, resolveGuideNhCompletionOffset } from '../server/providers/completion';
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
		assert.ok(completions[0].filterText?.includes('minecraftstone'));
	});

	test('completes runtime semantic values by tag and attribute', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const cache = new SemanticCache();
		cache.replace('sounds', 1, [{ id: 'minecraft:block.note_block.pling', label: 'Pling' }]);
		cache.replace('keybinds', 1, [{ id: 'key.jump', label: 'Jump' }]);
		cache.replace('commands', 1, [{ id: '/guidenhc open', label: 'Open guide page', detail: '/guidenhc open' }]);
		cache.replace('recipes', 1, [{ id: 'gregtech:compressor/plate_iron', label: 'Iron Plate', detail: 'gregtech:compressor/plate_iron' }]);
		cache.replace('quests', 1, [{ id: 'quest.getting_started', label: 'Getting Started' }]);
		cache.replace('entities', 1, [{ id: 'minecraft:zombie', label: 'Zombie' }]);
		cache.replace('items', 1, [{ id: 'minecraft:crafting_table', label: 'Crafting Table', detail: 'minecraft:crafting_table:0' }]);

		const soundItems = createGuideNhCompletions('<PlaySound sound="minecraft:block.note', 35, schema, undefined, cache);
		const keybindItems = createGuideNhCompletions('<KeyBind id="key.j', 18, schema, undefined, cache);
		const commandItems = createGuideNhCompletions('<CommandLink command="/guide', 27, schema, undefined, cache);
		const recipeItems = createGuideNhCompletions('<Recipe id="gregtech:compressor', 29, schema, undefined, cache);
		const questItems = createGuideNhCompletions('<QuestCard id="quest.', 21, schema, undefined, cache);
		const entityItems = createGuideNhCompletions('<Entity id="minecraft:z', 24, schema, undefined, cache);
		const blockImageItems = createGuideNhCompletions('<BlockImage id="minecraft:cra', 28, schema, undefined, cache);
		const soundLinkItems = createGuideNhCompletions('<SoundLink sound="minecraft:block.note', 35, schema, undefined, cache);

		assert.deepStrictEqual(soundItems.map((item) => item.label), ['minecraft:block.note_block.pling']);
		assert.deepStrictEqual(keybindItems.map((item) => item.label), ['key.jump']);
		assert.deepStrictEqual(commandItems.map((item) => item.label), ['/guidenhc open']);
		assert.deepStrictEqual(recipeItems.map((item) => item.label), ['gregtech:compressor/plate_iron']);
		assert.deepStrictEqual(questItems.map((item) => item.label), ['quest.getting_started']);
		assert.deepStrictEqual(entityItems.map((item) => item.label), ['minecraft:zombie']);
		assert.deepStrictEqual(blockImageItems.map((item) => item.label), ['Crafting Table']);
		assert.strictEqual(blockImageItems[0].insertText, 'minecraft:crafting_table');
		assert.strictEqual(blockImageItems[0].detail, 'minecraft:crafting_table:0 - minecraft:crafting_table');
		assert.ok(blockImageItems[0].filterText?.includes('craftingtable'));
		assert.deepStrictEqual(soundLinkItems.map((item) => item.label), ['minecraft:block.note_block.pling']);
	});

	test('prioritizes namespace-first item ids for short runtime prefixes', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const cache = new SemanticCache();
		cache.replace('items', 1, [
			{ id: 'minecraft:grass', label: 'Grass', detail: 'minecraft:grass:0' },
			{ id: 'minecraft:gravel', label: 'Gravel', detail: 'minecraft:gravel:0' },
			{ id: 'gregtech:gt.blockmachines', label: 'Basic Machine Hull', detail: 'gregtech:gt.blockmachines:0' },
			{ id: 'gregtech:greenhouse_controller', label: 'Greenhouse Controller', detail: 'gregtech:greenhouse_controller:0' }
		]);

		const completions = createGuideNhCompletions('<Block id="gr', 13, schema, undefined, cache);

		assert.deepStrictEqual(completions.slice(0, 2).map((item) => item.insertText), [
			'gregtech:greenhouse_controller',
			'gregtech:gt.blockmachines'
		]);
	});

	test('matches abbreviated token-initial item ids for runtime prefixes', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const cache = new SemanticCache();
		cache.replace('items', 1, [
			{ id: 'gregtech:gt.blockmachines', label: 'Basic Machine Hull', detail: 'gregtech:gt.blockmachines:0' },
			{ id: 'gregtech:greenhouse_controller', label: 'Greenhouse Controller', detail: 'gregtech:greenhouse_controller:0' }
		]);

		const completions = createGuideNhCompletions('<Block id="gtb', 14, schema, undefined, cache);

		assert.strictEqual(completions[0]?.insertText, 'gregtech:gt.blockmachines');
	});

	test('matches acronym-style item labels for runtime prefixes', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const cache = new SemanticCache();
		cache.replace('items', 1, [
			{ id: 'gregtech:gt.blockmachines:1000', label: 'Electric Blast Furnace', detail: 'gregtech:gt.blockmachines:1000' },
			{ id: 'gregtech:gt.blockmachines:1003', label: 'Multi Smelter', detail: 'gregtech:gt.blockmachines:1003' }
		]);

		const completions = createGuideNhCompletions('<Block id="ebf', 14, schema, undefined, cache);

		assert.strictEqual(completions[0]?.insertText, 'gregtech:gt.blockmachines:1000');
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

	test('completes quest_ids and navigation icons from runtime semantic cache', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const cache = new SemanticCache();
		cache.replace('quests', 1, [{ id: '550e8400-e29b-41d4-a716-446655440000', label: 'Getting Started' }]);
		cache.replace('items', 1, [{ id: 'minecraft:compass', label: 'Compass', detail: 'minecraft:compass:0' }]);

		const questItems = createGuideNhCompletions(
			'---\nquest_ids:\n  - 550e8400-e29b\n---\n',
			28,
			schema,
			undefined,
			cache
		);
		const iconItems = createGuideNhCompletions(
			'---\nnavigation:\n  icon: minecraft:co\n---\n',
			35,
			schema,
			undefined,
			cache
		);

		assert.deepStrictEqual(questItems.map((item) => item.label), ['550e8400-e29b-41d4-a716-446655440000']);
		assert.deepStrictEqual(iconItems.map((item) => item.label), ['Compass']);
		assert.strictEqual(iconItems[0].insertText, 'minecraft:compass');
	});

	test('creates dynamic requests for runtime-backed item and frontmatter completions', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const iconText = '---\nnavigation:\n  icon: minecraft:co\n---\n';
		const modText = '---\nnavigation:\n  required_mods:\n    - greg\n---\n';

		const itemResult = createGuideNhCompletionResult(
			'<ItemImage id="minecraft:sto',
			28,
			schema,
			undefined
		);
		const iconResult = createGuideNhCompletionResult(
			iconText,
			iconText.indexOf('minecraft:co') + 'minecraft:co'.length,
			schema,
			undefined
		);
		const modResult = createGuideNhCompletionResult(
			modText,
			modText.indexOf('greg') + 'greg'.length,
			schema,
			undefined
		);

		assert.deepStrictEqual(itemResult.dynamicRequest, {
			capability: 'items',
			prefix: 'minecraft:sto',
			filters: {}
		});
		assert.deepStrictEqual(iconResult.dynamicRequest, {
			capability: 'items',
			prefix: 'minecraft:co',
			filters: {}
		});
		assert.deepStrictEqual(modResult.dynamicRequest, {
			capability: 'mods',
			prefix: 'greg',
			filters: {}
		});
	});

	test('normalizes auto-closed Block id completion offsets back into the attribute value', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const text = '<Block id="minecraft:" />';
		const result = createGuideNhCompletionResult(
			text,
			resolveGuideNhCompletionOffset(text, text.indexOf('" />') + 2),
			schema,
			undefined
		);

		assert.deepStrictEqual(result.dynamicRequest, {
			capability: 'items',
			prefix: 'minecraft:',
			filters: {}
		});
	});

	test('replaces the current ItemStack prefix when applying dynamic runtime completions', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const cache = new SemanticCache();
		cache.replace('items', 1, [{ id: 'enderio:itemMaterial:9', label: 'Eye of Ender Fragment' }]);
		const text = '<Block id="Eye" />';
		const result = createGuideNhCompletionResult(
			text,
			text.indexOf('Eye') + 'Eye'.length,
			schema,
			undefined,
			cache
		);
		assert.deepStrictEqual(result.runtimeReplacement, {
			text,
			start: text.indexOf('Eye'),
			end: text.indexOf('Eye') + 3
		});
		assert.strictEqual(result.items[0]?.textEdit?.newText, 'enderio:itemMaterial:9');
		if (result.items[0]?.textEdit && 'range' in result.items[0].textEdit) {
			assert.deepStrictEqual(result.items[0].textEdit.range, {
				start: { line: 0, character: text.indexOf('Eye') },
				end: { line: 0, character: text.indexOf('Eye') + 3 }
			});
		}
	});
});
