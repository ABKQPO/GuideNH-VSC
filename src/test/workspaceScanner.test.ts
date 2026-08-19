import * as assert from 'assert';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { FileChangeType } from 'vscode-languageserver/node';
import { GuideNhResourceIndex } from '../server/index/resourceIndex';
import { GuideNhWorkspaceIndex } from '../server/index/workspaceIndex';
import * as workspaceScanner from '../server/index/workspaceScanner';
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

	test('updates resource and page indexes after watched file changes', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'guide-vsc-'));
		const pagePath = path.join(root, 'assets', 'appliedenergistics2', 'guidenh', '_en_us', 'items-blocks', 'facades.md');
		const firstResourcePath = path.join(root, 'assets', 'appliedenergistics2', 'guidenh', 'assets', 'structures', 'facades_1.snbt');
		const movedResourcePath = path.join(root, 'assets', 'appliedenergistics2', 'guidenh', 'assets', 'structures', 'facades_2.snbt');
		await fs.mkdir(path.dirname(pagePath), { recursive: true });
		await fs.mkdir(path.dirname(firstResourcePath), { recursive: true });
		await fs.writeFile(pagePath, '# Facades', 'utf8');
		await fs.writeFile(firstResourcePath, '{}', 'utf8');
		const index = new GuideNhWorkspaceIndex();
		const resourceIndex = new GuideNhResourceIndex();
		const applyChanges = (workspaceScanner as unknown as {
			applyGuideNhWorkspaceFileChanges?: (
				changes: Array<{ uri: string; type: FileChangeType }>,
				workspaceIndex: GuideNhWorkspaceIndex,
				resourceIndex: GuideNhResourceIndex
			) => Promise<void>;
		}).applyGuideNhWorkspaceFileChanges;

		assert.strictEqual(typeof applyChanges, 'function');
		await applyChanges?.([
			{ uri: pathToFileURL(pagePath).toString(), type: FileChangeType.Created },
			{ uri: pathToFileURL(firstResourcePath).toString(), type: FileChangeType.Created }
		], index, resourceIndex);
		assert.strictEqual(resourceIndex.findResourceByRelativePath('appliedenergistics2:assets/structures/facades_1.snbt')?.uri, pathToFileURL(firstResourcePath).toString());
		assert.strictEqual(index.findPageByRelativePath('appliedenergistics2:items-blocks/facades.md')?.uri, pathToFileURL(pagePath).toString());

		await fs.rename(firstResourcePath, movedResourcePath);
		await applyChanges?.([
			{ uri: pathToFileURL(firstResourcePath).toString(), type: FileChangeType.Deleted },
			{ uri: pathToFileURL(movedResourcePath).toString(), type: FileChangeType.Created }
		], index, resourceIndex);
		assert.strictEqual(resourceIndex.findResourceByRelativePath('appliedenergistics2:assets/structures/facades_1.snbt'), undefined);
		assert.strictEqual(resourceIndex.findResourceByRelativePath('appliedenergistics2:assets/structures/facades_2.snbt')?.uri, pathToFileURL(movedResourcePath).toString());

		await applyChanges?.([{ uri: pathToFileURL(movedResourcePath).toString(), type: FileChangeType.Deleted }], index, resourceIndex);
		assert.strictEqual(resourceIndex.findResourceByRelativePath('appliedenergistics2:assets/structures/facades_2.snbt'), undefined);
	});
});
