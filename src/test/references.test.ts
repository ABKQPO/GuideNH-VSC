import * as assert from 'assert';
import { GuideNhWorkspaceIndex } from '../server/index/workspaceIndex';
import { createGuideNhReferences } from '../server/providers/references';

suite('GuideNH references provider', () => {
	test('resolves references for the page target at the cursor position', () => {
		const index = new GuideNhWorkspaceIndex();
		index.updatePage('file:///repo/source.md', '<ItemLink id="minecraft:stone" linksTo="./crafting.md#smelting" />');
		index.updatePage('file:///repo/other.md', '[Crafting](crafting.md)');
		index.updatePage('file:///repo/crafting.md', '# Crafting');
		const text = '<ItemLink id="minecraft:stone" linksTo="./crafting.md#smelting" />';
		const references = createGuideNhReferences(text, text.indexOf('crafting.md') + 1, 'source.md', index);
		assert.deepStrictEqual(
			references.map((location) => location.uri).sort(),
			['file:///repo/other.md', 'file:///repo/source.md']
		);
	});

	test('falls back to references for the current page', () => {
		const index = new GuideNhWorkspaceIndex();
		index.updatePage('file:///repo/source.md', '[Crafting](crafting.md)');
		index.updatePage('file:///repo/crafting.md', '# Crafting');
		const references = createGuideNhReferences('# Crafting', 0, 'crafting.md', index);
		assert.deepStrictEqual(
			references.map((location) => location.uri),
			['file:///repo/source.md']
		);
	});

	test('resolves references for the resource target at the cursor position', () => {
		const index = new GuideNhWorkspaceIndex();
		index.updatePage('file:///repo/source.md', '<FloatingImage src="./images/test1.png" />');
		index.updatePage('file:///repo/other.md', '<FloatingImage src="images/test1.png" />');
		const text = '<FloatingImage src="./images/test1.png" />';
		const references = createGuideNhReferences(text, text.indexOf('images/test1.png') + 1, 'source.md', index);
		assert.deepStrictEqual(
			references.map((location) => location.uri).sort(),
			['file:///repo/other.md', 'file:///repo/source.md']
		);
	});

	test('resolves references for runtime-backed item ids', () => {
		const index = new GuideNhWorkspaceIndex();
		index.updatePage('file:///repo/items.md', '---\nitem_ids:\n  - minecraft:stone\n---\n');
		index.updatePage('file:///repo/source.md', '<ItemImage id="minecraft:stone" />');
		index.updatePage('file:///repo/other.md', '<ItemLink id="minecraft:stone" />');
		const text = '<ItemImage id="minecraft:stone" />';
		const references = createGuideNhReferences(text, text.indexOf('minecraft:stone') + 1, 'source.md', index);
		assert.deepStrictEqual(
			references.map((location) => location.uri).sort(),
			['file:///repo/items.md', 'file:///repo/other.md', 'file:///repo/source.md']
		);
	});

	test('resolves references for runtime-backed ore ids', () => {
		const index = new GuideNhWorkspaceIndex();
		index.updatePage('file:///repo/ores.md', '---\nore_ids:\n  - oreIron\n---\n');
		index.updatePage('file:///repo/source.md', '<Block ore="oreIron" />');
		index.updatePage('file:///repo/other.md', '<ItemLink ore="oreIron" />');
		const text = '<Block ore="oreIron" />';
		const references = createGuideNhReferences(text, text.indexOf('oreIron') + 1, 'source.md', index);
		assert.deepStrictEqual(
			references.map((location) => location.uri).sort(),
			['file:///repo/ores.md', 'file:///repo/other.md', 'file:///repo/source.md']
		);
	});

	test('resolves references from indexed frontmatter item ids to all uses', () => {
		const index = new GuideNhWorkspaceIndex();
		const text = '---\nitem_ids:\n  - minecraft:stone\n---\n';
		index.updatePage('file:///repo/items.md', text);
		index.updatePage('file:///repo/source.md', '<ItemImage id="minecraft:stone" />');
		index.updatePage('file:///repo/other.md', '<ItemLink id="minecraft:stone" />');
		const references = createGuideNhReferences(text, text.indexOf('minecraft:stone') + 1, 'items.md', index);
		assert.deepStrictEqual(
			references.map((location) => location.uri).sort(),
			['file:///repo/items.md', 'file:///repo/other.md', 'file:///repo/source.md']
		);
	});
});
