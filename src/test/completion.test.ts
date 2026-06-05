import * as assert from 'assert';
import * as path from 'path';
import { CompletionItem, CompletionItemKind, InsertTextFormat } from 'vscode-languageserver/node';
import { shouldTriggerGuideNhSuggest } from '../client/completionAssist';
import { GuideNhResourceIndex } from '../server/index/resourceIndex';
import { GuideNhWorkspaceIndex } from '../server/index/workspaceIndex';
import {
	createGuideNhCompletionResult,
	createGuideNhCompletions,
	GuideNhCompletionTriggerCharacters,
	resolveGuideNhCompletionOffset
} from '../server/providers/completion';
import { SemanticCache } from '../server/runtime/semanticCache';
import { loadGuideNhSchema } from '../server/schema/schemaLoader';

suite('GuideNH completion provider', () => {
	test('declares trigger characters for GuideNH syntax families', () => {
		for (const trigger of ['<', ' ', '"', '\'', '`', '=', '+', ':', '^']) {
			assert.ok(GuideNhCompletionTriggerCharacters.includes(trigger));
		}
	});

	test('completes tags after opening angle bracket', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const items = createGuideNhCompletions('<', 1, schema, undefined);
		const gameScene = items.find((item: CompletionItem) => item.label === 'GameScene' && item.kind === CompletionItemKind.Class);
		assert.ok(gameScene);
		assert.strictEqual(gameScene?.insertTextFormat, InsertTextFormat.Snippet);
		assert.strictEqual(gameScene?.insertText, '<GameScene>$0</GameScene>');
	});

	test('completes tags when the cursor is inside an auto-closed angle bracket pair', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const allItems = createGuideNhCompletions('<>', 1, schema, undefined);
		const filteredItems = createGuideNhCompletions('<B>', 2, schema, undefined);

		assert.ok(allItems.some((item: CompletionItem) => item.label === 'GameScene' && item.kind === CompletionItemKind.Class));
		assert.ok(filteredItems.some((item: CompletionItem) => item.label === 'Block'));
		assert.ok(filteredItems.some((item: CompletionItem) => item.label === 'BlockImage'));
		assert.strictEqual(filteredItems.some((item: CompletionItem) => item.label === 'Recipe'), false);
	});

	test('normalizes completion offsets when VS Code requests suggest at the auto-closed bracket edge', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const emptyOffset = resolveGuideNhCompletionOffset('<>', 2);
		const filteredOffset = resolveGuideNhCompletionOffset('<B>', 3);
		const emptyItems = createGuideNhCompletions('<>', emptyOffset, schema, undefined);
		const filteredItems = createGuideNhCompletions('<B>', filteredOffset, schema, undefined);

		assert.strictEqual(emptyOffset, 1);
		assert.strictEqual(filteredOffset, 2);
		assert.ok(emptyItems.some((item: CompletionItem) => item.label === 'GameScene'));
		assert.ok(filteredItems.some((item: CompletionItem) => item.label === 'Block'));
	});

	test('replaces the auto-closed angle bracket pair when completing a tag inside it', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const items = createGuideNhCompletions('<>', 1, schema, undefined);
		const gameScene = items.find((item: CompletionItem) => item.label === 'GameScene' && item.kind === CompletionItemKind.Class);

		assert.ok(gameScene?.textEdit && 'range' in gameScene.textEdit);
		assert.deepStrictEqual(gameScene?.textEdit.range, {
			start: { line: 0, character: 0 },
			end: { line: 0, character: 2 }
		});
	});

	test('completes inline tags as self-closing snippets after opening angle bracket', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const items = createGuideNhCompletions('<ItemI', 6, schema, undefined);
		const itemImage = items.find((item: CompletionItem) => item.label === 'ItemImage' && item.kind === CompletionItemKind.Class);
		assert.ok(itemImage);
		assert.strictEqual(itemImage?.insertTextFormat, InsertTextFormat.Snippet);
		assert.strictEqual(itemImage?.insertText, '<ItemImage $0 />');
	});

	test('completes GameScene attributes', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const items = createGuideNhCompletions('<GameScene ', 11, schema, undefined);
		const width = items.find((item: CompletionItem) => item.label === 'width');
		const zoom = items.find((item: CompletionItem) => item.label === 'zoom');
		const interactive = items.find((item: CompletionItem) => item.label === 'interactive');
		const showBackground = items.find((item: CompletionItem) => item.label === 'showBackground');
		assert.strictEqual(width?.insertText, 'width="${1:0}"');
		assert.strictEqual(zoom?.insertText, 'zoom={${1:0}}');
		assert.strictEqual(interactive?.insertText, 'interactive={${1:true}}');
		assert.strictEqual(showBackground?.insertText, 'showBackground={${1:true}}');
		assert.strictEqual(width?.insertTextFormat, InsertTextFormat.Snippet);
	});

	test('completes details attributes', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const items = createGuideNhCompletions('<details ', 9, schema, undefined);
		const open = items.find((item: CompletionItem) => item.label === 'open');
		const width = items.find((item: CompletionItem) => item.label === 'width');
		const wrap = items.find((item: CompletionItem) => item.label === 'wrap');
		assert.strictEqual(open?.insertText, 'open');
		assert.strictEqual(width?.insertText, 'width="${1:0}"');
		assert.strictEqual(wrap?.insertText, 'wrap="${1:value}"');
	});

	test('completes ContentTabs attributes with the correct value styles', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const items = createGuideNhCompletions('<ContentTabs ', 13, schema, undefined);
		const defaultAttr = items.find((item: CompletionItem) => item.label === 'default');
		const defaultIndex = items.find((item: CompletionItem) => item.label === 'defaultIndex');
		const color = items.find((item: CompletionItem) => item.label === 'color');
		const title = items.find((item: CompletionItem) => item.label === 'title');
		assert.strictEqual(defaultAttr?.insertText, 'default="${1:value}"');
		assert.strictEqual(defaultIndex?.insertText, 'defaultIndex="${1:0}"');
		assert.strictEqual(color?.insertText, 'color="${1:#ffffff}"');
		assert.strictEqual(title, undefined);
	});

	test('completes partial attribute names inside an open tag', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const text = '<GameScene wid';
		const items = createGuideNhCompletions(text, text.length, schema, undefined);
		const width = items.find((item: CompletionItem) => item.label === 'width');
		assert.ok(width);
		assert.strictEqual(width?.insertText, 'width="${1:0}"');
		assert.ok(width?.textEdit && 'range' in width.textEdit);
		assert.deepStrictEqual(width?.textEdit.range, {
			start: { line: 0, character: 11 },
			end: { line: 0, character: 14 }
		});
	});

	test('completes integer scene coordinates as string attributes', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const items = createGuideNhCompletions('<Block ', 7, schema, 'GameScene');
		const x = items.find((item: CompletionItem) => item.label === 'x');
		const y = items.find((item: CompletionItem) => item.label === 'y');
		const z = items.find((item: CompletionItem) => item.label === 'z');
		assert.strictEqual(x?.insertText, 'x="${1:0}"');
		assert.strictEqual(y?.insertText, 'y="${1:0}"');
		assert.strictEqual(z?.insertText, 'z="${1:0}"');
	});

	test('completes tag snippets before typing an opening angle bracket', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const items = createGuideNhCompletions('GameSc', 6, schema, undefined);
		const gameScene = items.find((item: CompletionItem) => item.label === 'GameScene');
		assert.strictEqual(gameScene?.insertTextFormat, InsertTextFormat.Snippet);
		assert.match(String(gameScene?.insertText), /^<GameScene>/);
	});

	test('completes partial tag names after opening angle bracket', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const items = createGuideNhCompletions('<GameSc', 7, schema, undefined);
		const gameScene = items.find((item: CompletionItem) => item.label === 'GameScene' && item.kind === CompletionItemKind.Class);
		assert.ok(gameScene);
		assert.ok(gameScene.textEdit && 'range' in gameScene.textEdit);
		assert.deepStrictEqual(gameScene.textEdit.range, {
			start: { line: 0, character: 0 },
			end: { line: 0, character: 7 }
		});
	});

	test('reoffers partial tag completions after deleting and retyping the prefix', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const items = createGuideNhCompletions('<B', 2, schema, undefined);
		assert.ok(items.some((item: CompletionItem) => item.label === 'Block'));
		assert.ok(items.some((item: CompletionItem) => item.label === 'BlockImage'));
	});

	test('completes lowercase GuideNH tags after opening angle bracket', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const items = createGuideNhCompletions('<de', 3, schema, undefined);
		assert.ok(items.some((item: CompletionItem) => item.label === 'details'));
	});

	test('triggers VS Code suggest for GuideNH open-tag typing and single-character deletion', () => {
		const base = {
			languageId: 'markdown',
			uriScheme: 'file',
			fileName: 'E:/Github/GuideNH/wiki/resourcepack/assets/guidenh/guidenh/_zh_cn/images.md',
			selectionEmpty: true
		};

		assert.strictEqual(shouldTriggerGuideNhSuggest({
			...base,
			textBeforeCursor: '<',
			changeText: '<',
			rangeLength: 0
		}), true);
		assert.strictEqual(shouldTriggerGuideNhSuggest({
			...base,
			textBeforeCursor: '<',
			changeText: '<>',
			rangeLength: 0
		}), true);
		assert.strictEqual(shouldTriggerGuideNhSuggest({
			...base,
			textBeforeCursor: '<>',
			changeText: '<>',
			rangeLength: 0
		}), true);
		assert.strictEqual(shouldTriggerGuideNhSuggest({
			...base,
			textBeforeCursor: '<B',
			changeText: 'B',
			rangeLength: 0
		}), true);
		assert.strictEqual(shouldTriggerGuideNhSuggest({
			...base,
			textBeforeCursor: '<d',
			changeText: 'd',
			rangeLength: 0
		}), true);
		assert.strictEqual(shouldTriggerGuideNhSuggest({
			...base,
			textBeforeCursor: '<',
			changeText: '',
			rangeLength: 1
		}), true);
		assert.strictEqual(shouldTriggerGuideNhSuggest({
			...base,
			textBeforeCursor: 'plain text',
			changeText: '<',
			rangeLength: 0
		}), false);
	});

	test('triggers VS Code suggest while editing open-tag attributes and values', () => {
		const base = {
			languageId: 'markdown',
			uriScheme: 'file',
			fileName: 'E:/Github/GuideNH/wiki/resourcepack/assets/guidenh/guidenh/_zh_cn/images.md',
			selectionEmpty: true
		};

		assert.strictEqual(shouldTriggerGuideNhSuggest({
			...base,
			textBeforeCursor: '<GameScene wid',
			changeText: 'd',
			rangeLength: 0
		}), true);
		assert.strictEqual(shouldTriggerGuideNhSuggest({
			...base,
			textBeforeCursor: '<ImportStructureLib controller="greg" facing="n',
			changeText: 'n',
			rangeLength: 0
		}), true);
	});

	test('completes boolean showBackground values from schema', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const text = '<GameScene showBackground="';
		const items = createGuideNhCompletions(text, text.length, schema, undefined);
		assert.deepStrictEqual(
			items.map((item: CompletionItem) => item.label),
			['true', 'false']
		);
		assert.strictEqual(items[0].kind, CompletionItemKind.Value);
		assert.strictEqual(items[0].detail, 'GameScene.showBackground');
	});

	test('completes boolean attribute values from schema', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const text = '<GameScene interactive="';
		const items = createGuideNhCompletions(text, text.length, schema, undefined);
		assert.deepStrictEqual(
			items.map((item: CompletionItem) => item.label),
			['true', 'false']
		);
	});

	test('filters tag completions by the open parent tag', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const text = '<GameScene>\n  <';
		const items = createGuideNhCompletions(text, text.length, schema, undefined);
		assert.ok(items.some((item: CompletionItem) => item.label === 'Block' && item.kind === CompletionItemKind.Class));
		assert.strictEqual(items.some((item: CompletionItem) => item.label === 'Recipe'), false);
	});

	test('keeps global tag completions inside details blocks with unrestricted children', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const text = '<details>\n  <';
		const items = createGuideNhCompletions(text, text.length, schema, undefined);
		assert.ok(items.some((item: CompletionItem) => item.label === 'summary'));
		assert.ok(items.some((item: CompletionItem) => item.label === 'BlockImage'));
	});

	test('filters tag completions inside ContentTabs to Tab children', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const text = '<ContentTabs>\n  <';
		const items = createGuideNhCompletions(text, text.length, schema, undefined);
		assert.ok(items.some((item: CompletionItem) => item.label === 'Tab' && item.kind === CompletionItemKind.Class));
		assert.strictEqual(items.some((item: CompletionItem) => item.label === 'BlockImage'), false);
	});

	test('completes Tab attributes inside ContentTabs', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const items = createGuideNhCompletions('<ContentTabs>\n  <Tab ', 21, schema, undefined);
		const title = items.find((item: CompletionItem) => item.label === 'title');
		const color = items.find((item: CompletionItem) => item.label === 'color');
		assert.strictEqual(title?.insertText, 'title="${1:value}"');
		assert.strictEqual(color, undefined);
	});

	test('offers Mermaid node content completions inside Mermaid blocks', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const text = '<Mermaid>\n  <';
		const items = createGuideNhCompletions(text, text.length, schema, undefined);
		assert.ok(items.some((item: CompletionItem) => item.label === 'NodeContent'));
		assert.strictEqual(items.some((item: CompletionItem) => item.label === 'Recipe'), false);
	});

	test('filters tag completions by the Scene alias parent tag', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const text = '<Scene>\n  <';
		const items = createGuideNhCompletions(text, text.length, schema, undefined);
		assert.ok(items.some((item: CompletionItem) => item.label === 'Block' && item.kind === CompletionItemKind.Class));
		assert.strictEqual(items.some((item: CompletionItem) => item.label === 'Recipe'), false);
	});

	test('restores global tag completions after closing the parent tag', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const text = '<GameScene>\n  <Block id="minecraft:stone" />\n</GameScene>\n<';
		const items = createGuideNhCompletions(text, text.length, schema, undefined);
		assert.ok(items.some((item: CompletionItem) => item.label === 'Recipe'));
	});

	test('completes reusable GuideNH snippets', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const items = createGuideNhCompletions('<', 1, schema, undefined);
		const snippet = items.find((item: CompletionItem) => item.label === 'GameScene' && item.kind === CompletionItemKind.Snippet);
		assert.strictEqual(snippet?.insertTextFormat, InsertTextFormat.Snippet);
		assert.match(String(snippet?.insertText), /<GameScene width="\$\{1:220\}"/);
	});

	test('completes top-level frontmatter keys', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const text = '---\nna\n---\n';
		const items = createGuideNhCompletions(text, 6, schema, undefined);
		assert.ok(items.some((item: CompletionItem) => item.label === 'navigation' && item.kind === CompletionItemKind.Property));
		assert.ok(items.some((item: CompletionItem) => item.label === 'item_ids' && item.detail === 'list'));
	});

	test('completes nested frontmatter keys', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const text = '---\nnavigation:\n  ti\n---\n';
		const items = createGuideNhCompletions(text, 20, schema, undefined);
		assert.ok(items.some((item: CompletionItem) => item.label === 'title' && item.kind === CompletionItemKind.Property));
		assert.ok(items.some((item: CompletionItem) => item.label === 'required_mods' && item.detail === 'list'));
		assert.ok(items.some((item: CompletionItem) => item.label === 'recommend' && item.detail === 'number'));
	});

	test('completes navigation parent values from indexed pages', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const index = new GuideNhWorkspaceIndex();
		index.updatePage('file:///repo/index.md', '# Index');
		index.updatePage('file:///repo/crafting.md', '# Crafting');
		const text = '---\nnavigation:\n  parent: c\n---\n';
		const items = createGuideNhCompletions(text, text.indexOf('c') + 1, schema, undefined, undefined, index);
		assert.deepStrictEqual(
			items.map((item: CompletionItem) => item.label),
			['crafting.md']
		);
	});

	test('merges runtime page values into page completions', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const index = new GuideNhWorkspaceIndex();
		const cache = new SemanticCache();
		index.updatePage('file:///repo/local.md', '# Local');
		cache.replace('pages', 1, [{ id: 'runtime.md', label: 'Runtime Page' }]);
		const frontmatterText = '---\nnavigation:\n  parent: r\n---\n';
		const attributeText = '<ItemLink id="minecraft:stone" linksTo="r';

		const frontmatterItems = createGuideNhCompletions(
			frontmatterText,
			frontmatterText.indexOf('parent: r') + 'parent: r'.length,
			schema,
			undefined,
			cache,
			index
		);
		const attributeItems = createGuideNhCompletions(attributeText, attributeText.length, schema, undefined, cache, index);

		assert.ok(frontmatterItems.some((item: CompletionItem) => item.label === 'runtime.md'));
		assert.ok(attributeItems.some((item: CompletionItem) => item.label === 'runtime.md'));
	});

	test('completes frontmatter item ids from indexed pages', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const index = new GuideNhWorkspaceIndex();
		index.updatePage('file:///repo/stone.md', '---\nitem_ids:\n  - minecraft:stone\n---\n');
		const text = '---\nitem_ids:\n  - minecraft:s\n---\n';
		const items = createGuideNhCompletions(text, text.indexOf('minecraft:s') + 'minecraft:s'.length, schema, undefined, undefined, index);
		assert.deepStrictEqual(
			items.map((item: CompletionItem) => item.label),
			['minecraft:stone']
		);
		assert.strictEqual(items[0].kind, CompletionItemKind.Value);
		assert.strictEqual(items[0].detail, 'Indexed item id');
	});

	test('completes frontmatter values from runtime semantic cache', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const cache = new SemanticCache();
		cache.replace('ores', 1, [{ id: 'oreIron', label: 'Iron Ore' }]);
		cache.replace('categories', 1, [{ id: 'intro', label: 'Intro Category' }]);
		cache.replace('mods', 1, [{ id: 'gregtech', label: 'GregTech' }]);

		const oreText = '---\nore_ids:\n  - oreI\n---\n';
		const categoryText = '---\ncategories:\n  - in\n---\n';
		const modText = '---\nnavigation:\n  required_mods:\n    - greg\n---\n';

		const oreItems = createGuideNhCompletions(oreText, oreText.indexOf('oreI') + 4, schema, undefined, cache);
		const categoryItems = createGuideNhCompletions(categoryText, categoryText.indexOf('in') + 2, schema, undefined, cache);
		const modItems = createGuideNhCompletions(modText, modText.indexOf('greg') + 4, schema, undefined, cache);

		assert.deepStrictEqual(oreItems.map((item: CompletionItem) => item.label), ['oreIron']);
		assert.deepStrictEqual(categoryItems.map((item: CompletionItem) => item.label), ['intro']);
		assert.deepStrictEqual(modItems.map((item: CompletionItem) => item.label), ['gregtech']);
		assert.strictEqual(oreItems[0].detail, 'Iron Ore');
		assert.strictEqual(modItems[0].detail, 'GregTech');
	});

	test('completes normalized category names from indexed frontmatter values', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const index = new GuideNhWorkspaceIndex();
		index.updatePage('file:///repo/source.md', '---\ncategories:\n  - Machines|Arc Furnace\n  - Magic|Crystal\n---\n');
		const text = '---\ncategories:\n  - Ma\n---\n';
		const items = createGuideNhCompletions(text, text.indexOf('Ma') + 2, schema, undefined, undefined, index);

		assert.deepStrictEqual(
			items.map((item: CompletionItem) => item.label),
			['Machines', 'Magic']
		);
		assert.strictEqual(items[0].detail, 'Indexed category');
	});

	test('completes linksTo values from indexed pages', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const index = new GuideNhWorkspaceIndex();
		index.updatePage('file:///repo/crafting.md', '# Crafting');
		const text = '<ItemLink id="minecraft:stone" linksTo="c';
		const items = createGuideNhCompletions(text, text.length, schema, undefined, undefined, index);
		assert.deepStrictEqual(
			items.map((item: CompletionItem) => item.label),
			['crafting.md']
		);
	});

	test('completes namespaced page values from indexed pages', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const index = new GuideNhWorkspaceIndex();
		index.updatePage('file:///repo/assets/gregtech/guidenh/_en_us/index.md', '# Index');
		const text = '<ItemLink linksTo="gregtech:i';
		const items = createGuideNhCompletions(text, text.length, schema, undefined, undefined, index);
		assert.deepStrictEqual(
			items.map((item: CompletionItem) => item.label),
			['gregtech:index.md']
		);
	});

	test('completes resource attribute values from indexed resources', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const resourceIndex = new GuideNhResourceIndex();
		resourceIndex.updateResource('file:///repo/assets/mod/guidenh/_en_us/images/test1.png');
		resourceIndex.updateResource('file:///repo/assets/mod/guidenh/_en_us/images/test2.png');
		const text = '<FloatingImage src="./images/t';
		const items = createGuideNhCompletions(text, text.length, schema, undefined, undefined, undefined, resourceIndex);
		assert.deepStrictEqual(
			items.map((item: CompletionItem) => item.label),
			['images/test1.png', 'images/test2.png']
		);
	});

	test('completes ImportStructureLib controller values from runtime semantic cache', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const cache = new SemanticCache();
		cache.replace('structurelib', 1, [
			{
				id: 'gregtech:gt.blockmachines:1000',
				label: 'Basic Machine Hull',
				detail: 'gregtech:gt.blockmachines:1000'
			}
		]);
		const text = '<ImportStructureLib controller="greg';
		const items = createGuideNhCompletions(text, text.length, schema, undefined, cache);
		assert.deepStrictEqual(
			items.map((item: CompletionItem) => item.label),
			['gregtech:gt.blockmachines:1000']
		);
		assert.strictEqual(items[0].detail, 'Basic Machine Hull');
		assert.strictEqual(items[0].documentation, 'gregtech:gt.blockmachines:1000');
	});

	test('completes ImportStructureLib orientation values from schema context', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const facingItems = createGuideNhCompletions('<ImportStructureLib facing="n', 29, schema, undefined);
		const rotationItems = createGuideNhCompletions('<ImportStructureLib rotation="c', 31, schema, undefined);
		const flipItems = createGuideNhCompletions('<ImportStructureLib flip="h', 27, schema, undefined);

		assert.ok(facingItems.some((item: CompletionItem) => item.label === 'north'));
		assert.ok(rotationItems.some((item: CompletionItem) => item.label === 'clockwise'));
		assert.ok(flipItems.some((item: CompletionItem) => item.label === 'horizontal'));
	});

	test('completes StructureLib conditional scene attributes from schema context', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const importItems = createGuideNhCompletions('<ImportStructureLib ', 20, schema, undefined);
		const annotationItems = createGuideNhCompletions('<BlockAnnotation ', 17, schema, 'GameScene');
		const soundItems = createGuideNhCompletions('<PlaySound ', 11, schema, 'GameScene');

		assert.ok(importItems.some((item: CompletionItem) => item.label === 'name'));
		assert.ok(annotationItems.some((item: CompletionItem) => item.label === 'showWhenStructure'));
		assert.ok(annotationItems.some((item: CompletionItem) => item.label === 'showWhenTier'));
		assert.ok(annotationItems.some((item: CompletionItem) => item.label === 'showWhenChannels'));
		assert.ok(soundItems.some((item: CompletionItem) => item.label === 'showWhenStructure'));
	});

	test('completes lowercase ImportStructureLib orientation values from schema context', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const facingItems = createGuideNhCompletions('<importstructurelib facing="n', 29, schema, undefined);
		assert.ok(facingItems.some((item: CompletionItem) => item.label === 'north'));
	});

	test('creates a dynamic runtime query for ImportStructureLib channel values', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const result = createGuideNhCompletionResult(
			'<ImportStructureLib controller="gregtech:gt.blockmachines:1000" channel="3',
			74,
			schema,
			undefined
		);

		assert.deepStrictEqual(result.items, []);
		assert.deepStrictEqual(result.dynamicRequest, {
			capability: 'structurelib',
			prefix: '3',
			filters: {
				attribute: 'channel',
				controller: 'gregtech:gt.blockmachines:1000'
			}
		});
	});

	test('creates a controller-aware dynamic runtime query for ImportStructureLib orientation values', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const text = '<ImportStructureLib controller="gregtech:gt.blockmachines:1000" facing="n" rotation="clockwise" ';
		const result = createGuideNhCompletionResult(
			text,
			text.indexOf('facing="n') + 'facing="n'.length,
			schema,
			undefined
		);

		assert.deepStrictEqual(result.items, []);
		assert.deepStrictEqual(result.dynamicRequest, {
			capability: 'structurelib',
			prefix: 'n',
			filters: {
				attribute: 'facing',
				controller: 'gregtech:gt.blockmachines:1000',
				rotation: 'clockwise'
			}
		});
	});

	test('creates dynamic runtime queries for generic runtime-backed attribute values', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const soundResult = createGuideNhCompletionResult(
			'<PlaySound sound="guidenh:guide.sample',
			38,
			schema,
			undefined
		);
		const pageResult = createGuideNhCompletionResult(
			'<ItemLink linksTo="intro',
			24,
			schema,
			undefined
		);

		assert.deepStrictEqual(soundResult.dynamicRequest, {
			capability: 'sounds',
			prefix: 'guidenh:guide.sample',
			filters: {}
		});
		assert.deepStrictEqual(pageResult.dynamicRequest, {
			capability: 'pages',
			prefix: 'intro',
			filters: {}
		});
	});

	test('completes GuideNH inline markdown markers', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const items = createGuideNhCompletions('Use =', 5, schema, undefined);
		const highlight = items.find((item: CompletionItem) => item.label === 'highlight');
		assert.strictEqual(highlight?.kind, CompletionItemKind.Snippet);
		assert.strictEqual(highlight?.insertTextFormat, InsertTextFormat.Snippet);
		assert.strictEqual(highlight?.insertText, '==${1:text}==');
	});

	test('completes GuideNH fenced code block languages', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const items = createGuideNhCompletions('```f', 4, schema, undefined);
		assert.ok(items.some((item: CompletionItem) => item.label === 'filetree' && item.kind === CompletionItemKind.Value));
		assert.ok(items.some((item: CompletionItem) => item.label === 'funcgraph' && item.detail === 'GuideNH fenced block'));
	});

	test('ignores inline code tags when offering later tag completions', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const text = [
			'`<Recipe>` and `<RecipeFor>` examples.',
			'',
			'<B'
		].join('\n');
		const items = createGuideNhCompletions(text, text.length, schema, undefined);
		assert.ok(items.some((item: CompletionItem) => item.label === 'Block'));
		assert.ok(items.some((item: CompletionItem) => item.label === 'BlockStats'));
	});
});
