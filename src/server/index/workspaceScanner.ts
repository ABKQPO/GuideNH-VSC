import { Dirent, promises as fs } from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { WorkspaceFolder } from 'vscode-languageserver/node';
import { URI } from 'vscode-uri';
import { GuideNhResourceIndex } from './resourceIndex';
import { GuideNhWorkspaceIndex } from './workspaceIndex';

const WorkspaceScanReadConcurrency = 8;

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
	await visitDirectory(folderPath, runner, index, resourceIndex);
	await runner.waitForIdle();
}

async function visitDirectory(
	dir: string,
	runner: LimitedTaskRunner,
	index: GuideNhWorkspaceIndex,
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
			await visitDirectory(fullPath, runner, index, resourceIndex);
		} else if (isGuideNhMarkdownPath(fullPath)) {
			runner.schedule(async () => {
				await indexGuideNhMarkdownFile(fullPath, index);
			});
		} else if (resourceIndex && isGuideNhResourcePath(fullPath)) {
			resourceIndex.updateResource(pathToFileURL(fullPath).toString());
		}
	}
}

async function indexGuideNhMarkdownFile(filePath: string, index: GuideNhWorkspaceIndex): Promise<void> {
	try {
		const text = await fs.readFile(filePath, 'utf8');
		index.updatePage(pathToFileURL(filePath).toString(), text);
	} catch {
		return;
	}
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
