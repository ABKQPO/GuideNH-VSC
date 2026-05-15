import * as assert from 'assert';
import { GuideNhWorkspaceIndex } from '../server/index/workspaceIndex';

suite('GuideNH workspace index', () => {
	test('indexes pages and item ids', () => {
		const index = new GuideNhWorkspaceIndex();
		index.updatePage('file:///repo/assets/guidenh/guidenh/_zh_cn/index.md', `---
item_ids:
  - minecraft:stone
navigation:
  title: Root
---
`);
		assert.strictEqual(index.findPageByRelativePath('index.md')?.uri, 'file:///repo/assets/guidenh/guidenh/_zh_cn/index.md');
		assert.strictEqual(index.findItemReference('minecraft:stone')?.uri, 'file:///repo/assets/guidenh/guidenh/_zh_cn/index.md');
	});

	test('indexes reusable frontmatter list values', () => {
		const index = new GuideNhWorkspaceIndex();
		index.updatePage('file:///repo/assets/guidenh/guidenh/_zh_cn/index.md', `---
item_ids:
  - minecraft:stone
ore_ids:
  - oreIron
categories:
  - intro
navigation:
  required_mods:
    - gregtech
---
`);
		assert.deepStrictEqual(index.listFrontmatterValues('item_ids'), ['minecraft:stone']);
		assert.deepStrictEqual(index.listFrontmatterValues('ore_ids'), ['oreIron']);
		assert.deepStrictEqual(index.listFrontmatterValues('categories'), ['intro']);
		assert.deepStrictEqual(index.listFrontmatterValues('navigation.required_mods'), ['gregtech']);
	});

	test('ignores reusable list examples outside frontmatter', () => {
		const index = new GuideNhWorkspaceIndex();
		index.updatePage('file:///repo/assets/guidenh/guidenh/_zh_cn/index.md', `# Example

categories:
  - body-only
`);
		assert.deepStrictEqual(index.listFrontmatterValues('categories'), []);
	});

	test('indexes nested GuideNH page paths relative to the locale root', () => {
		const index = new GuideNhWorkspaceIndex();
		index.updatePage('file:///repo/assets/guidenh/guidenh/_zh_cn/aae_intro/aae_intro-index.md', '# AAE');
		assert.strictEqual(
			index.findPageByRelativePath('aae_intro/aae_intro-index.md')?.uri,
			'file:///repo/assets/guidenh/guidenh/_zh_cn/aae_intro/aae_intro-index.md'
		);
	});

	test('finds references by uri', () => {
		const index = new GuideNhWorkspaceIndex();
		index.updatePage('file:///repo/assets/guidenh/guidenh/_zh_cn/a.md', '[B](b.md)');
		index.updatePage('file:///repo/assets/guidenh/guidenh/_zh_cn/b.md', '# B');
		assert.strictEqual(index.findReferencesToPage('b.md').length, 1);
	});

	test('removes stale path and reference entries when pages change', () => {
		const index = new GuideNhWorkspaceIndex();
		index.updatePage('file:///repo/assets/guidenh/guidenh/_zh_cn/a.md', '[B](b.md)');
		index.updatePage('file:///repo/assets/guidenh/guidenh/_zh_cn/a-renamed.md', '# A');
		index.removePage('file:///repo/assets/guidenh/guidenh/_zh_cn/a.md');
		assert.strictEqual(index.findPageByRelativePath('a.md'), undefined);
		assert.strictEqual(index.findReferencesToPage('b.md').length, 0);
	});

	test('replaces stale link references when a page is updated', () => {
		const index = new GuideNhWorkspaceIndex();
		index.updatePage('file:///repo/assets/guidenh/guidenh/_zh_cn/a.md', '[B](b.md)');
		index.updatePage('file:///repo/assets/guidenh/guidenh/_zh_cn/a.md', '[C](c.md)');
		assert.strictEqual(index.findReferencesToPage('b.md').length, 0);
		assert.strictEqual(index.findReferencesToPage('c.md').length, 1);
	});

	test('indexes navigation parent references', () => {
		const index = new GuideNhWorkspaceIndex();
		index.updatePage('file:///repo/assets/guidenh/guidenh/_zh_cn/child.md', `---
navigation:
  parent: index.md
---
`);
		index.updatePage('file:///repo/assets/guidenh/guidenh/_zh_cn/index.md', '# Index');
		assert.strictEqual(index.findReferencesToPage('index.md').length, 1);
	});

	test('indexes ItemLink linksTo page references', () => {
		const index = new GuideNhWorkspaceIndex();
		index.updatePage('file:///repo/assets/guidenh/guidenh/_zh_cn/source.md', '<ItemLink id="minecraft:stone" linksTo="./crafting.md#smelting" />');
		index.updatePage('file:///repo/assets/guidenh/guidenh/_zh_cn/crafting.md', '# Crafting');
		assert.strictEqual(index.findReferencesToPage('crafting.md').length, 1);
	});
});
