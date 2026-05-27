import * as assert from 'assert';
import * as path from 'path';
import { GuideNhResourceIndex } from '../server/index/resourceIndex';
import { GuideNhWorkspaceIndex } from '../server/index/workspaceIndex';
import { createGuideNhHover } from '../server/providers/hover';
import { SemanticCache } from '../server/runtime/semanticCache';
import { loadGuideNhSchema } from '../server/schema/schemaLoader';

suite('GuideNH hover provider', () => {
	test('returns tag description', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const hover = createGuideNhHover('<GameScene />', 2, schema);
		assert.ok(typeof hover.hover?.contents === 'object');
		assert.match(JSON.stringify(hover.hover?.contents), /Interactive GuideNH 3D scene/);
	});

	test('returns attribute description', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const hover = createGuideNhHover('<GameScene interactive="true" />', 13, schema);
		assert.match(JSON.stringify(hover.hover?.contents), /GameScene\.interactive/);
		assert.match(JSON.stringify(hover.hover?.contents), /Whether the scene accepts mouse input/);
	});

	test('returns frontmatter key description', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const hover = createGuideNhHover('---\nnavigation:\n  title: Machines\n---\n', 19, schema);
		assert.match(JSON.stringify(hover.hover?.contents), /navigation\.title/);
		assert.match(JSON.stringify(hover.hover?.contents), /Navigation title/);
	});

	test('returns indexed frontmatter item value hover details', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const index = new GuideNhWorkspaceIndex();
		const text = '---\nitem_ids:\n  - minecraft:stone\n---\n';
		index.updatePage('file:///repo/items.md', text);
		const hover = createGuideNhHover(text, text.indexOf('minecraft:stone') + 1, schema, index);
		assert.match(JSON.stringify(hover.hover?.contents), /GuideNH item id/);
		assert.match(JSON.stringify(hover.hover?.contents), /minecraft:stone/);
		assert.match(JSON.stringify(hover.hover?.contents), /items\.md/);
	});

	test('returns indexed frontmatter ore value hover details', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const index = new GuideNhWorkspaceIndex();
		const text = '---\nore_ids:\n  - oreIron\n---\n';
		index.updatePage('file:///repo/ores.md', text);
		const hover = createGuideNhHover(text, text.indexOf('oreIron') + 1, schema, index);
		assert.match(JSON.stringify(hover.hover?.contents), /GuideNH ore id/);
		assert.match(JSON.stringify(hover.hover?.contents), /oreIron/);
		assert.match(JSON.stringify(hover.hover?.contents), /ores\.md/);
	});

	test('does not treat inline markdown markers as GuideNH tags', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const text = '| `*Italic*` | `_Italic_` |';
		const hover = createGuideNhHover(text, text.indexOf('Italic') + 1, schema);
		assert.strictEqual(hover.hover, undefined);
	});

	test('returns lowercase tag descriptions', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const hover = createGuideNhHover('<details open />', 2, schema);
		assert.match(JSON.stringify(hover.hover?.contents), /details/i);
	});

	test('returns lowercase attribute descriptions on mixed-case schema tags', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const hover = createGuideNhHover('<importstructurelib controller="gregtech:machine" />', 21, schema);
		assert.match(JSON.stringify(hover.hover?.contents), /ImportStructureLib\.controller/);
	});

	test('returns page reference hover details', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const index = new GuideNhWorkspaceIndex();
		index.updatePage('file:///repo/crafting.md', '# Crafting');
		const text = '<ItemLink linksTo="./crafting.md#smelting" />';
		const hover = createGuideNhHover(text, text.indexOf('crafting.md') + 1, schema, index);
		assert.match(JSON.stringify(hover.hover?.contents), /GuideNH page reference/);
		assert.match(JSON.stringify(hover.hover?.contents), /Resolved page/);
		assert.match(JSON.stringify(hover.hover?.contents), /file:\/\/\/repo\/crafting\.md/);
	});

	test('returns resource reference hover details', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const resourceIndex = new GuideNhResourceIndex();
		resourceIndex.updateResource('file:///repo/assets/mod/guidenh/_en_us/images/test1.png');
		const text = '<FloatingImage src="./images/test1.png" />';
		const hover = createGuideNhHover(text, text.indexOf('images/test1.png') + 1, schema, undefined, resourceIndex);
		assert.match(JSON.stringify(hover.hover?.contents), /GuideNH resource reference/);
		assert.match(JSON.stringify(hover.hover?.contents), /Resolved resource/);
		assert.match(JSON.stringify(hover.hover?.contents), /file:\/\/\/repo\/assets\/mod\/guidenh\/_en_us\/images\/test1\.png/);
	});

	test('returns namespaced page reference hover details', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const index = new GuideNhWorkspaceIndex();
		index.updatePage('file:///repo/assets/gregtech/guidenh/_en_us/index.md', '# Index');
		const text = '[Index](/index.md)';
		const hover = createGuideNhHover(
			text,
			text.indexOf('index.md') + 1,
			schema,
			index,
			undefined,
			undefined,
			'file:///repo/assets/gregtech/guidenh/_en_us/guide.md'
		);
		assert.match(JSON.stringify(hover.hover?.contents), /gregtech:index\.md/);
		assert.match(JSON.stringify(hover.hover?.contents), /Resolved page/);
	});

	test('shows the preferred locale target when multiple translated pages share one id', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const index = new GuideNhWorkspaceIndex();
		index.updatePage('file:///repo/assets/gregtech/guidenh/_en_us/index.md', '# Index EN');
		index.updatePage('file:///repo/assets/gregtech/guidenh/_zh_cn/index.md', '# Index ZH');
		const text = '[Index](/index.md)';
		const hover = createGuideNhHover(
			text,
			text.indexOf('index.md') + 1,
			schema,
			index,
			undefined,
			undefined,
			'file:///repo/assets/gregtech/guidenh/_zh_cn/guide.md',
			'zh-CN'
		);
		assert.match(JSON.stringify(hover.hover?.contents), /_zh_cn\/index\.md/);
	});

	test('returns runtime hover details for runtime-backed attributes', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const cache = new SemanticCache();
		cache.replace('items', 1, [{ id: 'minecraft:stone', label: 'Stone', detail: 'minecraft:stone:0' }]);
		const hover = createGuideNhHover('<ItemImage id="minecraft:stone" />', 24, schema, undefined, undefined, cache);
		assert.match(JSON.stringify(hover.hover?.contents), /ItemImage\.id/);
		assert.match(JSON.stringify(hover.hover?.contents), /minecraft:stone/);
		assert.match(JSON.stringify(hover.hover?.contents), /Stone/);
	});

	test('returns runtime hover details for entity ids', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const cache = new SemanticCache();
		cache.replace('entities', 1, [{ id: 'minecraft:zombie', label: 'Zombie', detail: 'minecraft:zombie' }]);
		const hover = createGuideNhHover('<Entity id="minecraft:zombie" />', 20, schema, undefined, undefined, cache);
		assert.match(JSON.stringify(hover.hover?.contents), /Entity\.id/);
		assert.match(JSON.stringify(hover.hover?.contents), /minecraft:zombie/);
		assert.match(JSON.stringify(hover.hover?.contents), /Zombie/);
	});

	test('returns local semantic hover details for item attributes without runtime cache', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const index = new GuideNhWorkspaceIndex();
		index.updatePage('file:///repo/items.md', '---\nitem_ids:\n  - minecraft:stone\n---\n');
		const hover = createGuideNhHover('<ItemImage id="minecraft:stone" />', 24, schema, index);
		assert.match(JSON.stringify(hover.hover?.contents), /ItemImage\.id/);
		assert.match(JSON.stringify(hover.hover?.contents), /GuideNH item id/);
		assert.match(JSON.stringify(hover.hover?.contents), /items\.md/);
	});

	test('returns local semantic hover details for ore attributes without runtime cache', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const index = new GuideNhWorkspaceIndex();
		index.updatePage('file:///repo/ores.md', '---\nore_ids:\n  - oreIron\n---\n');
		const hover = createGuideNhHover('<Block ore="oreIron" />', 14, schema, index);
		assert.match(JSON.stringify(hover.hover?.contents), /Block\.ore/);
		assert.match(JSON.stringify(hover.hover?.contents), /GuideNH ore id/);
		assert.match(JSON.stringify(hover.hover?.contents), /ores\.md/);
	});

	test('returns runtime hover details for ImportStructureLib controller values', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const cache = new SemanticCache();
		const text = '<ImportStructureLib controller="gregtech:gt.blockmachines:1000" />';
		cache.replace('structurelib', 1, [{
			id: 'gregtech:gt.blockmachines:1000',
			label: 'Basic Machine Hull',
			detail: 'gregtech:gt.blockmachines:1000'
		}]);
		const hover = createGuideNhHover(
			text,
			text.lastIndexOf('gregtech:gt.blockmachines:1000') + 'gregtech'.length,
			schema,
			undefined,
			undefined,
			cache
		);
		assert.match(JSON.stringify(hover.hover?.contents), /ImportStructureLib\.controller/);
		assert.match(JSON.stringify(hover.hover?.contents), /Basic Machine Hull/);
	});

	test('returns structure piece hover details on the attribute value', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const hover = createGuideNhHover('<ImportStructureLib piece="main" />', 27, schema);
		assert.match(JSON.stringify(hover.hover?.contents), /GuideNH structure piece/);
		assert.match(JSON.stringify(hover.hover?.contents), /main/);
	});

	test('creates a dynamic hover request for ImportStructureLib channel values', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const result = createGuideNhHover(
			'<ImportStructureLib controller="gregtech:gt.blockmachines:1000" channel="3" />',
			74,
			schema
		);
		assert.deepStrictEqual(result.dynamicRequest, {
			capability: 'structurelib',
			prefix: '3',
			filters: {
				attribute: 'channel',
				controller: 'gregtech:gt.blockmachines:1000'
			}
		});
	});

	test('creates dynamic hover requests for runtime-backed attributes without local cache or index data', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const soundResult = createGuideNhHover('<PlaySound sound="guidenh:guide.sample_click" />', 28, schema);
		const recipeResult = createGuideNhHover('<Recipe id="gregtech:compressor/plate_iron" />', 22, schema);
		const questResult = createGuideNhHover('<QuestCard id="quest.getting_started" />', 21, schema);

		assert.deepStrictEqual(soundResult.dynamicRequest, {
			capability: 'sounds',
			prefix: 'guidenh:guide.sample_click',
			filters: {}
		});
		assert.deepStrictEqual(recipeResult.dynamicRequest, {
			capability: 'recipes',
			prefix: 'gregtech:compressor/plate_iron',
			filters: {}
		});
		assert.deepStrictEqual(questResult.dynamicRequest, {
			capability: 'quests',
			prefix: 'quest.getting_started',
			filters: {}
		});
	});
});
