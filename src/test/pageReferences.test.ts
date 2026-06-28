import * as assert from 'assert';
import {
	createGuideNhDocumentModel,
	findReferenceAtOffset,
	normalizePageReference
} from '../server/parser/documentModel';
import { findIndexedFrontmatterValueAtOffset } from '../server/parser/frontmatterIndexing';

suite('GuideNH page reference parser', () => {
	test('normalizes relative absolute and namespaced page references', () => {
		assert.strictEqual(normalizePageReference('./crafting.md#smelting'), 'crafting.md');
		assert.strictEqual(normalizePageReference('../crafting.md#smelting'), 'crafting.md');
		assert.strictEqual(normalizePageReference('/index.md'), 'index.md');
		assert.strictEqual(normalizePageReference('gregtech:/index.md'), 'gregtech:index.md');
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
		const references = createGuideNhDocumentModel(text).references.filter((reference) => reference.kind === 'page');
		assert.deepStrictEqual(
			references.map((reference) => reference.normalizedTarget),
			['crafting.md', 'gregtech:index.md', 'machines.md']
		);
	});

	test('resolves namespaced and rooted references against the current document namespace', () => {
		const uri = 'file:///repo/assets/gregtech/guidenh/_en_us/multiblocks/gt-ebf.md';
		const text = [
			'[Home](/index.md)',
			'[Guide](guide.md)',
			'[External](guidenh:index.md)'
		].join('\n');
		const references = createGuideNhDocumentModel(text, uri).references.filter((reference) => reference.kind === 'page');
		assert.deepStrictEqual(
			references.map((reference) => reference.normalizedTarget),
			['gregtech:index.md', 'gregtech:multiblocks/guide.md', 'guidenh:index.md']
		);
	});

	test('resolves parent-directory references against the current document directory', () => {
		const uri = 'file:///repo/assets/gregtech/guidenh/_en_us/multiblocks/gt-ebf.md';
		const text = [
			'[Machines](../machines/index.md)',
			'<ItemLink linksTo="../materials.md" />'
		].join('\n');
		const references = createGuideNhDocumentModel(text, uri).references.filter((reference) => reference.kind === 'page');
		assert.deepStrictEqual(
			references.map((reference) => reference.normalizedTarget),
			['gregtech:machines/index.md', 'gregtech:materials.md']
		);
	});

	test('finds the page reference at the cursor position', () => {
		const text = '[Crafting](crafting.md) and [Machines](machines.md)';
		const model = createGuideNhDocumentModel(text);
		assert.strictEqual(findReferenceAtOffset(model, text.indexOf('machines.md') + 1, ['page'])?.normalizedTarget, 'machines.md');
	});

	test('finds indexed frontmatter values at the cursor position', () => {
		const text = [
			'---',
			'navigation:',
			'  icons:',
			'    - minecraft:compass',
			'item_ids:',
			'  - minecraft:stone',
			'ore_ids:',
			'  - oreIron',
			'---'
		].join('\n');
		assert.deepStrictEqual(findIndexedFrontmatterValueAtOffset(text, text.indexOf('minecraft:compass') + 1), {
			path: 'navigation.icons',
			value: 'minecraft:compass',
			start: text.indexOf('minecraft:compass'),
			end: text.indexOf('minecraft:compass') + 'minecraft:compass'.length
		});
		assert.deepStrictEqual(findIndexedFrontmatterValueAtOffset(text, text.indexOf('minecraft:stone') + 1), {
			path: 'item_ids',
			value: 'minecraft:stone',
			start: text.indexOf('minecraft:stone'),
			end: text.indexOf('minecraft:stone') + 'minecraft:stone'.length
		});
		assert.deepStrictEqual(findIndexedFrontmatterValueAtOffset(text, text.indexOf('oreIron') + 1), {
			path: 'ore_ids',
			value: 'oreIron',
			start: text.indexOf('oreIron'),
			end: text.indexOf('oreIron') + 'oreIron'.length
		});
	});
});
