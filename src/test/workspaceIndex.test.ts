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
});
