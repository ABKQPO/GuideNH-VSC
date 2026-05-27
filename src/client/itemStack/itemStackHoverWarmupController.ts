import * as vscode from 'vscode';
import { ItemStackContextCache } from './itemStackContextCache';
import { ItemStackPreviewClient } from './itemStackPreviewClient';
import { isGuideNhPreviewDocument } from './itemStackContextResolver';

export class ItemStackHoverWarmupController implements vscode.Disposable {
	private static readonly hoverWarmupDelayMs = 1000;
	private static readonly hoverWarmupCount = 1;
	private readonly disposables: vscode.Disposable[] = [];
	private readonly timers = new Map<string, NodeJS.Timeout>();
	private readonly lastWarmupByUri = new Map<string, string>();

	public constructor(
		private readonly previewClient: ItemStackPreviewClient,
		private readonly contextCache: ItemStackContextCache
	) {
		this.disposables.push(
			vscode.window.onDidChangeActiveTextEditor((editor) => {
				this.scheduleWarmup(editor);
			}),
			vscode.window.onDidChangeTextEditorSelection((event) => {
				this.scheduleWarmup(event.textEditor);
			}),
			vscode.workspace.onDidChangeTextDocument((event) => {
				const editor = vscode.window.activeTextEditor;
				if (!editor || editor.document.uri.toString() !== event.document.uri.toString()) {
					return;
				}
				this.scheduleWarmup(editor);
			})
		);
		this.scheduleWarmup(vscode.window.activeTextEditor);
	}

	public dispose(): void {
		for (const timeout of this.timers.values()) {
			clearTimeout(timeout);
		}
		this.timers.clear();
		this.lastWarmupByUri.clear();
		while (this.disposables.length > 0) {
			this.disposables.pop()?.dispose();
		}
	}

	private scheduleWarmup(editor: vscode.TextEditor | undefined): void {
		const key = editor?.document.uri.toString() ?? 'active';
		const existing = this.timers.get(key);
		if (existing) {
			clearTimeout(existing);
		}
		if (!editor || !isGuideNhPreviewDocument(editor.document)) {
			this.timers.delete(key);
			return;
		}
		const timeout = setTimeout(() => {
			this.timers.delete(key);
			void this.warmup(editor);
		}, ItemStackHoverWarmupController.hoverWarmupDelayMs);
		this.timers.set(key, timeout);
	}

	private async warmup(editor: vscode.TextEditor): Promise<void> {
		const activeEditor = vscode.window.activeTextEditor;
		if (!activeEditor || activeEditor.document.uri.toString() !== editor.document.uri.toString()) {
			return;
		}
		const context = this.contextCache.findNearestContext(editor);
		const itemId = context?.value.trim();
		if (!context || !itemId) {
			return;
		}
		const uri = editor.document.uri.toString();
		const warmupKey = `${context.valueRange.start.line}:${context.valueRange.start.character}:${itemId}`;
		if (this.lastWarmupByUri.get(uri) === warmupKey) {
			return;
		}
		try {
			await this.previewClient.resolve({
				capability: 'items',
				id: itemId,
				count: ItemStackHoverWarmupController.hoverWarmupCount,
				renderVariant: 'inline',
				filters: {
					source: 'hover-warmup'
				}
			});
			this.lastWarmupByUri.set(uri, warmupKey);
		} catch {
			return;
		}
	}
}
