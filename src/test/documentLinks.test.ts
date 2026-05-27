import * as assert from 'assert';
import { GuideNhWorkspaceIndex } from '../server/index/workspaceIndex';
import { createGuideNhDocumentLinks } from '../server/providers/documentLinks';

suite('GuideNH document links', () => {
	test('resolves rooted markdown page links to the preferred locale target uri', () => {
		const index = new GuideNhWorkspaceIndex();
		index.updatePage('file:///repo/assets/gregtech/guidenh/_en_us/multiblocks/index.md', '# Index EN');
		index.updatePage('file:///repo/assets/gregtech/guidenh/_zh_cn/multiblocks/index.md', '# Index ZH');
		const text = 'tier [multiblock](/multiblocks/index.md) for smelting.';
		const links = createGuideNhDocumentLinks(
			text,
			'file:///repo/assets/gregtech/guidenh/_zh_cn/multiblocks/gt-ebf.md',
			index,
			'zh-CN'
		);

		assert.strictEqual(links.length, 1);
		assert.strictEqual(links[0].target, 'file:///repo/assets/gregtech/guidenh/_zh_cn/multiblocks/index.md');
		assert.deepStrictEqual(links[0].range.start, { line: 0, character: 5 });
		assert.deepStrictEqual(links[0].range.end, { line: 0, character: 40 });
	});

	test('falls back to en_us for document links when the preferred locale page is missing', () => {
		const index = new GuideNhWorkspaceIndex();
		index.updatePage('file:///repo/assets/gregtech/guidenh/_en_us/multiblocks/index.md', '# Index EN');
		const text = 'tier [multiblock](/multiblocks/index.md) for smelting.';
		const links = createGuideNhDocumentLinks(
			text,
			'file:///repo/assets/gregtech/guidenh/_zh_cn/multiblocks/gt-ebf.md',
			index,
			'zh-CN'
		);

		assert.strictEqual(links.length, 1);
		assert.strictEqual(links[0].target, 'file:///repo/assets/gregtech/guidenh/_en_us/multiblocks/index.md');
	});
});
