import * as vscode from 'vscode';
import { localize } from '../localization';
import { ItemStackContextCache } from './itemStackContextCache';
import { isGuideNhPreviewDocument } from './itemStackContextResolver';

export class ItemStackCodeLensProvider implements vscode.CodeLensProvider, vscode.Disposable {
	private readonly onDidChangeEmitter = new vscode.EventEmitter<void>();
	private readonly disposables: vscode.Disposable[] = [];
	private readonly refreshByUri = new Map<string, NodeJS.Timeout>();

	public readonly onDidChangeCodeLenses = this.onDidChangeEmitter.event;

	public constructor(private readonly contextCache: ItemStackContextCache) {
		this.disposables.push(
			this.onDidChangeEmitter,
			vscode.window.onDidChangeActiveTextEditor((editor) => this.scheduleRefresh(editor, 20)),
			vscode.window.onDidChangeTextEditorSelection((event) => this.scheduleRefresh(event.textEditor, 40)),
			vscode.workspace.onDidChangeTextDocument(() => this.scheduleRefresh(vscode.window.activeTextEditor, 80))
		);
	}

	public dispose(): void {
		for (const timeout of this.refreshByUri.values()) {
			clearTimeout(timeout);
		}
		this.refreshByUri.clear();
		while (this.disposables.length > 0) {
			this.disposables.pop()?.dispose();
		}
	}

	public provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
		const editor = vscode.window.activeTextEditor;
		if (!editor || editor.document.uri.toString() !== document.uri.toString() || !isGuideNhPreviewDocument(document)) {
			return [];
		}
		const activeContext = this.contextCache.findNearestContext(editor);
		if (!activeContext) {
			return [];
		}
		const visibleContexts = this.contextCache.getVisibleContexts(editor);
		const target = visibleContexts.find((context) => {
			return context.valueRange.start.isEqual(activeContext.valueRange.start)
				&& context.valueRange.end.isEqual(activeContext.valueRange.end);
		}) ?? activeContext;
		return [
			new vscode.CodeLens(target.tagRange, {
				title: localize('Open ItemStack Picker'),
				command: 'guide-vsc.openItemStackPicker',
				arguments: [target.valueRange.end]
			})
		];
	}

	private scheduleRefresh(editor: vscode.TextEditor | undefined, delayMs: number): void {
		const key = editor?.document.uri.toString() ?? 'active';
		const existing = this.refreshByUri.get(key);
		if (existing) {
			clearTimeout(existing);
		}
		const timeout = setTimeout(() => {
			this.refreshByUri.delete(key);
			this.onDidChangeEmitter.fire();
		}, delayMs);
		this.refreshByUri.set(key, timeout);
	}
}
