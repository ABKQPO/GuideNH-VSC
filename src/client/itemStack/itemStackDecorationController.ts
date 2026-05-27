import * as vscode from 'vscode';
import { MarkdownString, ThemeColor } from 'vscode';
import { localize } from '../localization';
import { PreviewResolveResultPayload } from '../../common/protocol';
import { createFallbackInlineIconUri, createPreviewIconUri } from './itemStackDecorationAssets';
import {
	findItemStackContextAtPosition,
	findVisibleItemStackContexts,
	isGuideNhPreviewDocument,
	ItemStackContext
} from './itemStackContextResolver';
import { ItemStackPickerPanel } from './itemStackPickerPanel';
import { ItemStackPreviewClient } from './itemStackPreviewClient';

interface ItemStackDecorationState {
	context: ItemStackContext;
	preview?: PreviewResolveResultPayload;
}

export class ItemStackDecorationController implements vscode.Disposable {
	private readonly disposables: vscode.Disposable[] = [];
	private readonly refreshByUri = new Map<string, NodeJS.Timeout>();
	private readonly fallbackDecorationType: vscode.TextEditorDecorationType;
	private readonly iconDecorationTypes = new Map<string, vscode.TextEditorDecorationType>();
	private readonly editorState = new WeakMap<vscode.TextEditor, ItemStackDecorationState[]>();

	public constructor(
		private readonly previewClient: ItemStackPreviewClient,
		private readonly pickerPanel: ItemStackPickerPanel
	) {
		this.fallbackDecorationType = vscode.window.createTextEditorDecorationType({
			gutterIconPath: createFallbackInlineIconUri(),
			gutterIconSize: 'contain',
			rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
		});
		this.disposables.push(this.fallbackDecorationType);
		this.disposables.push(
			vscode.window.onDidChangeVisibleTextEditors((editors) => {
				for (const editor of editors) {
					this.scheduleRefresh(editor, 20);
				}
			}),
			vscode.window.onDidChangeTextEditorVisibleRanges((event) => {
				this.scheduleRefresh(event.textEditor, 50);
			}),
			vscode.window.onDidChangeActiveTextEditor((editor) => {
				if (editor) {
					this.scheduleRefresh(editor, 20);
				}
			}),
			vscode.workspace.onDidChangeTextDocument((event) => {
				for (const editor of vscode.window.visibleTextEditors) {
					if (editor.document.uri.toString() !== event.document.uri.toString()) {
						continue;
					}
					this.scheduleRefresh(editor, 90);
				}
			}),
			vscode.commands.registerCommand('guide-vsc.openItemStackPicker', async (position?: vscode.Position) => {
				await this.openPickerForActiveEditor(position);
			})
		);
		for (const editor of vscode.window.visibleTextEditors) {
			this.scheduleRefresh(editor, 20);
		}
	}

	public dispose(): void {
		for (const timeout of this.refreshByUri.values()) {
			clearTimeout(timeout);
		}
		this.refreshByUri.clear();
		for (const decorationType of this.iconDecorationTypes.values()) {
			decorationType.dispose();
		}
		this.iconDecorationTypes.clear();
		while (this.disposables.length > 0) {
			this.disposables.pop()?.dispose();
		}
	}

	public async openPickerForActiveEditor(position?: vscode.Position): Promise<void> {
		const editor = vscode.window.activeTextEditor;
		if (!editor || !isGuideNhPreviewDocument(editor.document)) {
			await vscode.window.showInformationMessage(localize('Open a GuideNH document and place the cursor inside an ItemStack id first.'));
			return;
		}
		const targetPosition = position ?? editor.selection.active;
		const stateContext = this.findEditorStateContext(editor, targetPosition)
			?? findItemStackContextAtPosition(editor.document, targetPosition);
		if (!stateContext) {
			await vscode.window.showInformationMessage(localize('Move the cursor into an ItemStack id before opening the picker.'));
			return;
		}
		await this.pickerPanel.show(stateContext, editor);
	}

	private scheduleRefresh(editor: vscode.TextEditor, delayMs: number): void {
		if (!isGuideNhPreviewDocument(editor.document)) {
			this.clearDecorations(editor);
			return;
		}
		const uri = editor.document.uri.toString();
		const existing = this.refreshByUri.get(uri);
		if (existing) {
			clearTimeout(existing);
		}
		const timeout = setTimeout(() => {
			this.refreshByUri.delete(uri);
			void this.refreshEditor(editor);
		}, delayMs);
		this.refreshByUri.set(uri, timeout);
	}

	private async refreshEditor(editor: vscode.TextEditor): Promise<void> {
		const contexts = findVisibleItemStackContexts(editor.document, editor.visibleRanges).slice(0, 24);
		const states = await Promise.all(contexts.map(async (context) => {
			try {
				const preview = context.value.trim().length === 0
					? undefined
					: await this.previewClient.resolve({
						capability: 'items',
						id: context.value.trim(),
						count: 1,
						renderVariant: 'inline',
						filters: {
							source: 'inline'
						}
					});
				return {
					context,
					preview
				} satisfies ItemStackDecorationState;
			} catch {
				return {
					context,
					preview: undefined
				} satisfies ItemStackDecorationState;
			}
		}));
		this.editorState.set(editor, states);
		this.applyDecorations(editor, states);
	}

	private applyDecorations(editor: vscode.TextEditor, states: ItemStackDecorationState[]): void {
		const decorationGroups = new Map<vscode.TextEditorDecorationType, vscode.DecorationOptions[]>();
		const fallbackOptions: vscode.DecorationOptions[] = [];
		for (const state of states) {
			const option = this.createDecorationOption(state);
			if (!state.preview) {
				fallbackOptions.push(option);
				continue;
			}
			const decorationType = this.getOrCreateDecorationType(state.preview);
			const group = decorationGroups.get(decorationType) ?? [];
			group.push(option);
			decorationGroups.set(decorationType, group);
		}
		editor.setDecorations(this.fallbackDecorationType, fallbackOptions);
		const usedTypes = new Set(decorationGroups.keys());
		for (const [iconKey, decorationType] of this.iconDecorationTypes.entries()) {
			const options = usedTypes.has(decorationType) ? decorationGroups.get(decorationType) ?? [] : [];
			editor.setDecorations(decorationType, options);
			if (options.length === 0 && !states.some((state) => state.preview && this.createIconKey(state.preview) === iconKey)) {
				editor.setDecorations(decorationType, []);
			}
		}
	}

	private clearDecorations(editor: vscode.TextEditor): void {
		editor.setDecorations(this.fallbackDecorationType, []);
		for (const decorationType of this.iconDecorationTypes.values()) {
			editor.setDecorations(decorationType, []);
		}
		this.editorState.set(editor, []);
	}

	private createDecorationOption(state: ItemStackDecorationState): vscode.DecorationOptions {
		return {
			range: state.context.valueRange,
			hoverMessage: this.createHoverMessage(state)
		};
	}

	private createHoverMessage(state: ItemStackDecorationState): MarkdownString {
		const message = new MarkdownString(undefined, true);
		message.isTrusted = true;
		if (state.preview) {
			message.appendMarkdown(`**${escapeMarkdown(state.preview.displayName || state.preview.id)}**  \n`);
			message.appendMarkdown(`${escapeMarkdown(state.preview.id)}  \n`);
			if (state.preview.detail && state.preview.detail !== state.preview.id) {
				message.appendMarkdown(`${escapeMarkdown(state.preview.detail)}  \n`);
			}
			for (const line of state.preview.tooltipLines.slice(0, 8)) {
				message.appendMarkdown(`${escapeMarkdown(line)}  \n`);
			}
		} else {
			message.appendMarkdown(`${escapeMarkdown(localize('Runtime preview unavailable for this ItemStack id.'))}  \n`);
		}
		message.appendMarkdown(`\n[${escapeMarkdown(localize('Open ItemStack picker'))}](command:guide-vsc.openItemStackPicker)`);
		return message;
	}

	private getOrCreateDecorationType(preview: PreviewResolveResultPayload): vscode.TextEditorDecorationType {
		const iconKey = this.createIconKey(preview);
		const existing = this.iconDecorationTypes.get(iconKey);
		if (existing) {
			return existing;
		}
		const decorationType = vscode.window.createTextEditorDecorationType({
			gutterIconPath: createPreviewIconUri(preview),
			gutterIconSize: 'contain',
			rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
			overviewRulerColor: new ThemeColor('editor.findMatchHighlightBackground')
		});
		this.iconDecorationTypes.set(iconKey, decorationType);
		this.disposables.push(decorationType);
		this.trimDecorationTypeCache();
		return decorationType;
	}

	private trimDecorationTypeCache(): void {
		const maxTypes = 96;
		while (this.iconDecorationTypes.size > maxTypes) {
			const oldestKey = this.iconDecorationTypes.keys().next().value as string | undefined;
			if (!oldestKey) {
				break;
			}
			const decorationType = this.iconDecorationTypes.get(oldestKey);
			this.iconDecorationTypes.delete(oldestKey);
			decorationType?.dispose();
		}
	}

	private createIconKey(preview: PreviewResolveResultPayload): string {
		return `${preview.previewKey}:${preview.id}:${preview.iconPngBase64.slice(0, 64)}`;
	}

	private findEditorStateContext(editor: vscode.TextEditor, position: vscode.Position): ItemStackContext | undefined {
		const states = this.editorState.get(editor) ?? [];
		return states.find((state) => state.context.valueRange.contains(position))?.context;
	}
}

function escapeMarkdown(value: string): string {
	return value.replace(/[\\`*_{}[\]()#+\-.!]/g, '\\$&');
}
