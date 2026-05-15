import { Dirent, promises as fs } from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { WorkspaceFolder } from 'vscode-languageserver/node';
import { URI } from 'vscode-uri';
import { GuideNhWorkspaceIndex } from './workspaceIndex';

export async function indexGuideNhWorkspaceFolders(folders: WorkspaceFolder[], index: GuideNhWorkspaceIndex): Promise<void> {
	for (const folder of folders) {
		await indexGuideNhWorkspaceFolder(folder.uri, index);
	}
}

export async function indexGuideNhWorkspaceFolder(folderUri: string, index: GuideNhWorkspaceIndex): Promise<void> {
	const folderPath = URI.parse(folderUri).fsPath;
	for (const filePath of await findGuideNhMarkdownFiles(folderPath)) {
		const text = await fs.readFile(filePath, 'utf8');
		index.updatePage(pathToFileURL(filePath).toString(), text);
	}
}

async function findGuideNhMarkdownFiles(root: string): Promise<string[]> {
	const files: string[] = [];
	await visitDirectory(root, files);
	return files.sort((left, right) => left.localeCompare(right));
}

async function visitDirectory(dir: string, files: string[]): Promise<void> {
	let entries: Dirent[];
	try {
		entries = await fs.readdir(dir, { withFileTypes: true });
	} catch {
		return;
	}
	for (const entry of entries) {
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			if (shouldSkipDirectory(entry.name)) {
				continue;
			}
			await visitDirectory(fullPath, files);
		} else if (isGuideNhMarkdownPath(fullPath)) {
			files.push(fullPath);
		}
	}
}

function shouldSkipDirectory(name: string): boolean {
	return name === 'node_modules' || name === '.git' || name === '.vscode-test' || name === 'out' || name === 'dist';
}

function isGuideNhMarkdownPath(filePath: string): boolean {
	const normalized = filePath.replace(/\\/g, '/');
	return /\/assets\/[^/]+\/guidenh\/_[a-z]{2}_[a-z]{2}\/.+\.md$/i.test(normalized);
}
