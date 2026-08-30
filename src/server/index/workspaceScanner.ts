import { Dirent, promises as fs } from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { DidChangeWatchedFilesParams, FileChangeType, WorkspaceFolder } from 'vscode-languageserver/node';
import { URI } from 'vscode-uri';
import { GuideNhResourceIndex } from './resourceIndex';
import { GuideNhWorkspaceIndex } from './workspaceIndex';

const WorkspaceScanReadConcurrency = 8;

export interface GuideNhWorkspaceDocument {
	uri: string;
	text: string;
}

export async function indexGuideNhWorkspaceFolders(
	folders: WorkspaceFolder[],
	index: GuideNhWorkspaceIndex,
	resourceIndex?: GuideNhResourceIndex
): Promise<void> {
	for (const folder of folders) {
		await indexGuideNhWorkspaceFolder(folder.uri, index, resourceIndex);
	}
}

export async function indexGuideNhWorkspaceFolder(
	folderUri: string,
	index: GuideNhWorkspaceIndex,
	resourceIndex?: GuideNhResourceIndex
): Promise<void> {
	const folderPath = URI.parse(folderUri).fsPath;
	const runner = new LimitedTaskRunner(WorkspaceScanReadConcurrency);
	await visitDirectory(folderPath, runner, (filePath) => indexGuideNhMarkdownFile(filePath, index), resourceIndex);
	await runner.waitForIdle();
}

/** Rebuild all page entries and remove URIs that disappeared without a delete watcher event. */
export async function reconcileGuideNhWorkspaceFolders(
	folders: WorkspaceFolder[],
	index: GuideNhWorkspaceIndex,
	resourceIndex?: GuideNhResourceIndex
): Promise<void> {
	const seenUris = new Set<string>();
	for (const folder of folders) {
		const folderPath = URI.parse(folder.uri).fsPath;
		const runner = new LimitedTaskRunner(WorkspaceScanReadConcurrency);
		await visitDirectory(folderPath, runner, async (filePath) => {
			const document = await readGuideNhMarkdownFile(filePath);
			if (document) {
				seenUris.add(document.uri);
				index.updatePage(document.uri, document.text);
			}
		}, resourceIndex);
		await runner.waitForIdle();
	}
	index.removePagesNotIn(seenUris);
}

/** Apply client file-watcher events without requiring a full workspace rescan. */
export async function applyGuideNhWorkspaceFileChanges(
	changes: DidChangeWatchedFilesParams['changes'],
	index: GuideNhWorkspaceIndex,
	resourceIndex: GuideNhResourceIndex
): Promise<void> {
	for (const change of changes) {
		const filePath = URI.parse(change.uri).fsPath;
		if (isGuideNhMarkdownPath(filePath)) {
			if (change.type === FileChangeType.Deleted) {
				index.removePage(normalizeFileUri(change.uri));
			} else {
				const document = await readGuideNhMarkdownFile(filePath);
				if (document) {
					index.updatePage(document.uri, document.text);
				} else {
					index.removePage(normalizeFileUri(change.uri));
				}
			}
			continue;
		}
		if (!isGuideNhResourcePath(filePath)) {
			continue;
		}
		if (change.type === FileChangeType.Deleted) {
			resourceIndex.removeResource(normalizeFileUri(change.uri));
		} else {
			resourceIndex.updateResource(normalizeFileUri(change.uri));
		}
	}
}

export async function forEachGuideNhMarkdownDocument(
	folders: WorkspaceFolder[],
	consumer: (document: GuideNhWorkspaceDocument) => Promise<void>
): Promise<void> {
	for (const folder of folders) {
		const folderPath = URI.parse(folder.uri).fsPath;
		const runner = new LimitedTaskRunner(WorkspaceScanReadConcurrency);
		await visitDirectory(folderPath, runner, async (filePath) => {
			const document = await readGuideNhMarkdownFile(filePath);
			if (document) {
				await consumer(document);
			}
		});
		await runner.waitForIdle();
	}
}

async function visitDirectory(
	dir: string,
	runner: LimitedTaskRunner,
	processMarkdownFile: (filePath: string) => Promise<void>,
	resourceIndex?: GuideNhResourceIndex
): Promise<void> {
	let entries: Dirent[];
	try {
		entries = await fs.readdir(dir, { withFileTypes: true });
	} catch {
		return;
	}
	entries.sort((left, right) => left.name.localeCompare(right.name));
	for (const entry of entries) {
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			if (shouldSkipDirectory(entry.name)) {
				continue;
			}
			await visitDirectory(fullPath, runner, processMarkdownFile, resourceIndex);
		} else if (isGuideNhMarkdownPath(fullPath)) {
			runner.schedule(() => processMarkdownFile(fullPath));
		} else if (resourceIndex && isGuideNhResourcePath(fullPath)) {
			resourceIndex.updateResource(normalizeFileUri(fullPath));
		}
	}
}

async function indexGuideNhMarkdownFile(filePath: string, index: GuideNhWorkspaceIndex): Promise<void> {
	const document = await readGuideNhMarkdownFile(filePath);
	if (document) {
		index.updatePage(document.uri, document.text);
	}
}

async function readGuideNhMarkdownFile(filePath: string): Promise<GuideNhWorkspaceDocument | undefined> {
	try {
		return {
			uri: normalizeFileUri(filePath),
			text: await fs.readFile(filePath, 'utf8')
		};
	} catch {
		return undefined;
	}
}

function normalizeFileUri(filePathOrUri: string): string {
	const uri = filePathOrUri.startsWith('file:')
		? filePathOrUri
		: pathToFileURL(filePathOrUri).toString();
	return uri.replace(/^file:\/\/\/([a-z]):/, (_match, drive: string) => `file:///${drive.toUpperCase()}:`);
}

function shouldSkipDirectory(name: string): boolean {
	return name === 'node_modules' || name === '.git' || name === '.vscode-test' || name === 'out' || name === 'dist';
}

function isGuideNhMarkdownPath(filePath: string): boolean {
	const normalized = filePath.replace(/\\/g, '/');
	return /\/assets\/[^/]+\/guidenh\/(?:guidenh\/)?_[a-z]{2}_[a-z]{2}\/.+\.md$/i.test(normalized);
}

function isGuideNhResourcePath(filePath: string): boolean {
	const normalized = filePath.replace(/\\/g, '/');
	return /\/assets\//i.test(normalized) && !normalized.toLowerCase().endsWith('.md');
}

class LimitedTaskRunner {
	private active = 0;
	private queueOffset = 0;
	private readonly queue: Array<() => void> = [];
	private readonly idleResolvers: Array<() => void> = [];

	public constructor(private readonly concurrency: number) {}

	schedule(task: () => Promise<void>): void {
		const run = () => {
			this.active++;
			void task()
				.catch(() => undefined)
				.finally(() => {
					this.active--;
					this.startNext();
					this.resolveIdleIfDone();
				});
		};
		if (this.active < this.concurrency) {
			run();
			return;
		}
		this.queue.push(run);
	}

	waitForIdle(): Promise<void> {
		if (this.isIdle()) {
			return Promise.resolve();
		}
		return new Promise((resolve) => {
			this.idleResolvers.push(resolve);
		});
	}

	private startNext(): void {
		const next = this.queue[this.queueOffset];
		if (next) {
			this.queueOffset++;
			this.compactQueueIfNeeded();
			next();
		}
	}

	private compactQueueIfNeeded(): void {
		if (this.queueOffset < 256 || this.queueOffset * 2 < this.queue.length) {
			return;
		}
		this.queue.splice(0, this.queueOffset);
		this.queueOffset = 0;
	}

	private resolveIdleIfDone(): void {
		if (!this.isIdle()) {
			return;
		}
		while (this.idleResolvers.length > 0) {
			this.idleResolvers.shift()?.();
		}
	}

	private isIdle(): boolean {
		return this.active === 0 && this.queueOffset >= this.queue.length;
	}
}
