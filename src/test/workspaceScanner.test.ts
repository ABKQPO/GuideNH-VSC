import * as assert from 'assert';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { GuideNhWorkspaceIndex } from '../server/index/workspaceIndex';
import { indexGuideNhWorkspaceFolder } from '../server/index/workspaceScanner';

suite('GuideNH workspace scanner', () => {
	test('indexes GuideNH Markdown files from workspace folders', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'guide-vsc-'));
		const pagePath = path.join(root, 'assets', 'guidenh', 'guidenh', '_zh_cn', 'nested', 'page.md');
		const ignoredPath = path.join(root, 'README.md');
		await fs.mkdir(path.dirname(pagePath), { recursive: true });
		await fs.writeFile(pagePath, '---\nitem_ids:\n  - minecraft:stone\n---\n', 'utf8');
		await fs.writeFile(ignoredPath, '[Page](page.md)', 'utf8');
		const index = new GuideNhWorkspaceIndex();

		await indexGuideNhWorkspaceFolder(pathToFileURL(root).toString(), index);

		assert.strictEqual(index.findPageByRelativePath('nested/page.md')?.uri.toLowerCase(), pathToFileURL(pagePath).toString().toLowerCase());
		assert.strictEqual(index.findItemReference('minecraft:stone')?.uri.toLowerCase(), pathToFileURL(pagePath).toString().toLowerCase());
		assert.strictEqual(index.findReferencesToPage('page.md').length, 0);
	});

	test('indexes multiple GuideNH Markdown files during one workspace scan', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'guide-vsc-'));
		const firstPath = path.join(root, 'assets', 'guidenh', 'guidenh', '_zh_cn', 'first.md');
		const secondPath = path.join(root, 'assets', 'guidenh', 'guidenh', '_zh_cn', 'second.md');
		await fs.mkdir(path.dirname(firstPath), { recursive: true });
		await fs.writeFile(firstPath, '---\nitem_ids:\n  - minecraft:stone\n---\n', 'utf8');
		await fs.writeFile(secondPath, '---\nitem_ids:\n  - minecraft:dirt\n---\n', 'utf8');
		const index = new GuideNhWorkspaceIndex();

		await indexGuideNhWorkspaceFolder(pathToFileURL(root).toString(), index);

		assert.strictEqual(index.findItemReference('minecraft:stone')?.uri.toLowerCase(), pathToFileURL(firstPath).toString().toLowerCase());
		assert.strictEqual(index.findItemReference('minecraft:dirt')?.uri.toLowerCase(), pathToFileURL(secondPath).toString().toLowerCase());
	});

	test('continues workspace scans when one matched path cannot be read', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'guide-vsc-'));
		const validPath = path.join(root, 'assets', 'guidenh', 'guidenh', '_zh_cn', 'valid.md');
		const unreadablePath = path.join(root, 'assets', 'guidenh', 'guidenh', '_zh_cn', 'unreadable.md');
		await fs.mkdir(path.dirname(validPath), { recursive: true });
		await fs.writeFile(validPath, '---\nitem_ids:\n  - minecraft:stone\n---\n', 'utf8');
		await fs.mkdir(unreadablePath, { recursive: true });
		const index = new GuideNhWorkspaceIndex();

		await indexGuideNhWorkspaceFolder(pathToFileURL(root).toString(), index);

		assert.strictEqual(index.findItemReference('minecraft:stone')?.uri.toLowerCase(), pathToFileURL(validPath).toString().toLowerCase());
		assert.strictEqual(index.findPageByRelativePath('unreadable.md'), undefined);
	});
});
