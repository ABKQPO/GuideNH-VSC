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
});
