import * as assert from 'assert';
import { Location } from 'vscode-languageserver/node';
import { GuideNhResourceIndex } from '../server/index/resourceIndex';
import { GuideNhWorkspaceIndex } from '../server/index/workspaceIndex';
import { createGuideNhDefinition } from '../server/providers/definition';

suite('GuideNH definition provider', () => {
	test('resolves the markdown link at the cursor position', () => {
		const index = new GuideNhWorkspaceIndex();
		index.updatePage('file:///repo/a.md', '[A](a.md)');
		index.updatePage('file:///repo/b.md', '[B](b.md)');
		const text = '[A](a.md) and [B](b.md)';
		const definition = createGuideNhDefinition(text, text.indexOf('b.md') + 1, index);
		assert.strictEqual((definition as Location | undefined)?.uri, 'file:///repo/b.md');
	});

	test('ignores markdown links away from the cursor position', () => {
		const index = new GuideNhWorkspaceIndex();
		index.updatePage('file:///repo/a.md', '[A](a.md)');
		const definition = createGuideNhDefinition('prefix [A](a.md)', 1, index);
		assert.strictEqual(definition, undefined);
	});

	test('resolves navigation parent values at the cursor position', () => {
		const index = new GuideNhWorkspaceIndex();
		index.updatePage('file:///repo/index.md', '# Index');
		const text = '---\nnavigation:\n  parent: index.md\n---\n';
		const definition = createGuideNhDefinition(text, text.indexOf('index.md') + 1, index);
		assert.strictEqual((definition as Location | undefined)?.uri, 'file:///repo/index.md');
	});

	test('resolves linksTo attribute values at the cursor position', () => {
		const index = new GuideNhWorkspaceIndex();
		index.updatePage('file:///repo/crafting.md', '# Crafting');
		const text = '<ItemLink id="minecraft:stone" linksTo="./crafting.md#smelting" />';
		const definition = createGuideNhDefinition(text, text.indexOf('crafting.md') + 1, index);
		assert.strictEqual((definition as Location | undefined)?.uri, 'file:///repo/crafting.md');
	});

	test('resolves resource attribute values at the cursor position', () => {
		const index = new GuideNhWorkspaceIndex();
		const resourceIndex = new GuideNhResourceIndex();
		resourceIndex.updateResource('file:///repo/assets/mod/guidenh/_en_us/images/test1.png');
		const text = '<FloatingImage src="./images/test1.png" />';
		const definition = createGuideNhDefinition(text, text.indexOf('images/test1.png') + 1, index, resourceIndex);
		assert.strictEqual((definition as Location | undefined)?.uri, 'file:///repo/assets/mod/guidenh/_en_us/images/test1.png');
	});

	test('resolves runtime-backed item ids to indexed frontmatter pages', () => {
		const index = new GuideNhWorkspaceIndex();
		index.updatePage('file:///repo/items.md', '---\nitem_ids:\n  - minecraft:stone\n---\n');
		const text = '<ItemImage id="minecraft:stone" />';
		const definition = createGuideNhDefinition(text, text.indexOf('minecraft:stone') + 1, index);
		assert.strictEqual((definition as Location | undefined)?.uri, 'file:///repo/items.md');
	});

	test('resolves runtime-backed ore ids to indexed frontmatter pages', () => {
		const index = new GuideNhWorkspaceIndex();
		index.updatePage('file:///repo/ores.md', '---\nore_ids:\n  - oreIron\n---\n');
		const text = '<Block ore="oreIron" />';
		const definition = createGuideNhDefinition(text, text.indexOf('oreIron') + 1, index);
		assert.strictEqual((definition as Location | undefined)?.uri, 'file:///repo/ores.md');
	});

	test('resolves indexed frontmatter item ids to their defining page', () => {
		const index = new GuideNhWorkspaceIndex();
		const text = '---\nitem_ids:\n  - minecraft:stone\n---\n';
		index.updatePage('file:///repo/items.md', text);
		const definition = createGuideNhDefinition(text, text.indexOf('minecraft:stone') + 1, index);
		assert.strictEqual((definition as Location | undefined)?.uri, 'file:///repo/items.md');
	});
});
