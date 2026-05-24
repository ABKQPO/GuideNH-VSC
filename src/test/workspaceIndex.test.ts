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

	test('updates item id references when pages change or are removed', () => {
		const index = new GuideNhWorkspaceIndex();
		index.updatePage('file:///repo/assets/guidenh/guidenh/_zh_cn/a.md', `---
item_ids:
  - minecraft:stone
---
`);
		index.updatePage('file:///repo/assets/guidenh/guidenh/_zh_cn/a.md', `---
item_ids:
  - minecraft:dirt
---
`);

		assert.strictEqual(index.findItemReference('minecraft:stone'), undefined);
		assert.strictEqual(index.findItemReference('minecraft:dirt')?.uri, 'file:///repo/assets/guidenh/guidenh/_zh_cn/a.md');

		index.removePage('file:///repo/assets/guidenh/guidenh/_zh_cn/a.md');
		assert.strictEqual(index.findItemReference('minecraft:dirt'), undefined);
	});

	test('keeps shared item id references while one source remains', () => {
		const index = new GuideNhWorkspaceIndex();
		index.updatePage('file:///repo/assets/guidenh/guidenh/_zh_cn/a.md', `---
item_ids:
  - minecraft:stone
---
`);
		index.updatePage('file:///repo/assets/guidenh/guidenh/_zh_cn/b.md', `---
item_ids:
  - minecraft:stone
---
`);

		index.removePage('file:///repo/assets/guidenh/guidenh/_zh_cn/a.md');
		assert.strictEqual(index.findItemReference('minecraft:stone')?.uri, 'file:///repo/assets/guidenh/guidenh/_zh_cn/b.md');
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

	test('normalizes category sort keys in indexed frontmatter values', () => {
		const index = new GuideNhWorkspaceIndex();
		index.updatePage('file:///repo/assets/guidenh/guidenh/_zh_cn/index.md', `---
categories:
  - Machines|Arc Furnace
  - Power | Generator
  - "Logistics|Item Pipe"
  - "  Decor  | Showcase "
---
`);

		assert.deepStrictEqual(index.listFrontmatterValues('categories'), ['Decor', 'Logistics', 'Machines', 'Power']);
	});

	test('updates cached frontmatter values incrementally', () => {
		const index = new GuideNhWorkspaceIndex();
		index.updatePage('file:///repo/assets/guidenh/guidenh/_zh_cn/a.md', `---
categories:
  - intro
  - shared
---
`);
		index.updatePage('file:///repo/assets/guidenh/guidenh/_zh_cn/b.md', `---
categories:
  - shared
  - advanced
---
`);

		assert.deepStrictEqual(index.listFrontmatterValues('categories'), ['advanced', 'intro', 'shared']);

		index.updatePage('file:///repo/assets/guidenh/guidenh/_zh_cn/a.md', `---
categories:
  - updated
---
`);
		assert.deepStrictEqual(index.listFrontmatterValues('categories'), ['advanced', 'shared', 'updated']);

		index.removePage('file:///repo/assets/guidenh/guidenh/_zh_cn/b.md');
		assert.deepStrictEqual(index.listFrontmatterValues('categories'), ['updated']);
	});

	test('queries cached frontmatter values by prefix', () => {
		const index = new GuideNhWorkspaceIndex();
		index.updatePage('file:///repo/assets/guidenh/guidenh/_zh_cn/a.md', `---
categories:
  - advanced
  - archive
  - intro
---
`);

		assert.deepStrictEqual(index.queryFrontmatterValues('categories', 'a'), ['advanced', 'archive']);
		assert.deepStrictEqual(index.queryFrontmatterValues('categories', 'a', 1), ['advanced']);
		assert.deepStrictEqual(index.queryFrontmatterValues('categories', 'missing'), []);
	});

	test('queries normalized category names instead of raw sort keys', () => {
		const index = new GuideNhWorkspaceIndex();
		index.updatePage('file:///repo/assets/guidenh/guidenh/_zh_cn/a.md', `---
categories:
  - Machines|Arc Furnace
  - Mechanics|Bearing
  - Magic|Crystal
---
`);

		assert.deepStrictEqual(index.queryFrontmatterValues('categories', 'Ma'), ['Magic', 'Machines']);
		assert.deepStrictEqual(index.queryFrontmatterValues('categories', 'Me'), ['Mechanics']);
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

	test('keeps listed pages sorted after updates and removals', () => {
		const index = new GuideNhWorkspaceIndex();
		index.updatePage('file:///repo/assets/guidenh/guidenh/_zh_cn/b.md', '# B');
		index.updatePage('file:///repo/assets/guidenh/guidenh/_zh_cn/a.md', '# A');
		assert.deepStrictEqual(index.listPages().map((page) => page.relativePath), ['a.md', 'b.md']);

		index.removePage('file:///repo/assets/guidenh/guidenh/_zh_cn/a.md');
		index.updatePage('file:///repo/assets/guidenh/guidenh/_zh_cn/c.md', '# C');
		assert.deepStrictEqual(index.listPages().map((page) => page.relativePath), ['b.md', 'c.md']);
	});

	test('queries cached pages by normalized prefix', () => {
		const index = new GuideNhWorkspaceIndex();
		index.updatePage('file:///repo/assets/guidenh/guidenh/_zh_cn/intro/a.md', '# A');
		index.updatePage('file:///repo/assets/guidenh/guidenh/_zh_cn/intro/b.md', '# B');
		index.updatePage('file:///repo/assets/guidenh/guidenh/_zh_cn/other/c.md', '# C');

		assert.deepStrictEqual(index.queryPagesByPrefix('./intro/').map((page) => page.relativePath), ['intro/a.md', 'intro/b.md']);
		assert.deepStrictEqual(index.queryPagesByPrefix('/intro/', 1).map((page) => page.relativePath), ['intro/a.md']);
		assert.deepStrictEqual(index.queryPagesByPrefix('missing/'), []);
	});

	test('keeps page prefix queries isolated from listed page snapshots', () => {
		const index = new GuideNhWorkspaceIndex();
		index.updatePage('file:///repo/assets/guidenh/guidenh/_zh_cn/intro/a.md', '# A');
		index.updatePage('file:///repo/assets/guidenh/guidenh/_zh_cn/intro/b.md', '# B');
		const listed = index.listPages();

		listed.splice(0);

		assert.deepStrictEqual(index.queryPagesByPrefix('intro/').map((page) => page.relativePath), ['intro/a.md', 'intro/b.md']);
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

	test('indexes resource references from GuideNH attributes', () => {
		const index = new GuideNhWorkspaceIndex();
		index.updatePage('file:///repo/assets/guidenh/guidenh/_zh_cn/source.md', '<FloatingImage src="./images/test1.png" />');
		assert.strictEqual(index.findReferencesToResource('images/test1.png').length, 1);
	});

	test('indexes runtime-backed item and ore attribute references', () => {
		const index = new GuideNhWorkspaceIndex();
		index.updatePage('file:///repo/assets/guidenh/guidenh/_zh_cn/source.md', [
			'---',
			'item_ids:',
			'  - minecraft:stone',
			'ore_ids:',
			'  - oreIron',
			'---',
			'<ItemImage id="minecraft:stone" />',
			'<Block ore="oreIron" />'
		].join('\n'));
		assert.strictEqual(index.findReferencesToItem('minecraft:stone').length, 1);
		assert.strictEqual(index.findReferencesToOre('oreIron').length, 1);
	});
});
