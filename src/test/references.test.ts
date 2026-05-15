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
});
