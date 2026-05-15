import * as assert from 'assert';
import { findPageReferenceAtOffset, findPageReferences, normalizePageReference } from '../server/navigation/pageReferences';

suite('GuideNH page reference parser', () => {
	test('normalizes relative absolute and namespaced page references', () => {
		assert.strictEqual(normalizePageReference('./crafting.md#smelting'), 'crafting.md');
		assert.strictEqual(normalizePageReference('/index.md'), 'index.md');
		assert.strictEqual(normalizePageReference('gregtech:/index.md'), 'index.md');
		assert.strictEqual(normalizePageReference('#local'), undefined);
	});

	test('finds page references from markdown frontmatter and tag attributes', () => {
		const text = [
			'[Crafting](./crafting.md#smelting)',
			'---',
			'navigation:',
			'  parent: gregtech:/index.md',
			'---',
			'<ItemLink linksTo="machines.md" />'
		].join('\n');
		assert.deepStrictEqual(
			findPageReferences(text).map((reference) => reference.target),
			['crafting.md', 'index.md', 'machines.md']
		);
	});

	test('finds the page reference at the cursor position', () => {
		const text = '[Crafting](crafting.md) and [Machines](machines.md)';
		assert.strictEqual(findPageReferenceAtOffset(text, text.indexOf('machines.md') + 1)?.target, 'machines.md');
	});
});
