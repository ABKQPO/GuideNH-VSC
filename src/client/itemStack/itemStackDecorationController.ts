import * as vscode from 'vscode';
import { MarkdownString } from 'vscode';
import { localize } from '../localization';
import { PreviewResolveResultPayload } from '../../common/protocol';
import { ItemStackContextCache } from './itemStackContextCache';
import { createFallbackInlineIconUri, createSizedInlineIconUri } from './itemStackDecorationAssets';
import { renderMinecraftFormattingHtml, stripMinecraftFormatting } from './itemStackTextFormatting';
import {
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
	private static readonly maxVisibleContexts = 24;
	private static readonly resolveConcurrency = 4;
	private readonly disposables: vscode.Disposable[] = [];
	private readonly refreshByUri = new Map<string, NodeJS.Timeout>();
	private readonly inlineDecorationType: vscode.TextEditorDecorationType;
	private readonly editorState = new WeakMap<vscode.TextEditor, ItemStackDecorationState[]>();

	public constructor(
		private readonly previewClient: ItemStackPreviewClient,
		private readonly pickerPanel: ItemStackPickerPanel,
		private readonly contextCache: ItemStackContextCache
	) {
		this.inlineDecorationType = vscode.window.createTextEditorDecorationType({
			rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
		});
		this.disposables.push(this.inlineDecorationType);
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
			vscode.commands.registerCommand('guide-vsc.openItemStackPicker', async (position?: unknown) => {
				await this.openPickerForActiveEditor(normalizePosition(position));
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
			?? this.contextCache.findNearestContext(editor, targetPosition)
			?? this.contextCache.findContextAt(editor, targetPosition);
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
		const contexts = this.contextCache.getVisibleContexts(editor)
			.slice(0, ItemStackDecorationController.maxVisibleContexts);
		const states = await this.resolveDecorationStates(contexts);
		this.editorState.set(editor, states);
		this.applyDecorations(editor, states);
	}

	private applyDecorations(editor: vscode.TextEditor, states: ItemStackDecorationState[]): void {
		editor.setDecorations(this.inlineDecorationType, states.map((state) => this.createDecorationOption(state)));
	}

	private clearDecorations(editor: vscode.TextEditor): void {
		editor.setDecorations(this.inlineDecorationType, []);
		this.editorState.set(editor, []);
	}

	private createDecorationOption(state: ItemStackDecorationState): vscode.DecorationOptions {
		const iconUri = state.preview ? createSizedInlineIconUri(state.preview) : createFallbackInlineIconUri();
		return {
			range: state.context.valueRange,
			hoverMessage: this.createHoverMessage(state),
			renderOptions: {
				before: {
					contentIconPath: iconUri,
					margin: '0 0.28em -0.18em 0',
					width: '1em',
					height: '1em'
				}
			}
		};
	}

	private createHoverMessage(state: ItemStackDecorationState): MarkdownString {
		const message = new MarkdownString(undefined, true);
		message.isTrusted = true;
		message.supportHtml = true;
		const pickerCommandUri = createPickerCommandUri(state.context.valueRange.end);
		if (state.preview) {
			appendFormattedHoverLine(message, state.preview.displayName || state.preview.id);
			if (state.preview.detail && state.preview.detail !== state.preview.id) {
				appendFormattedHoverLine(message, state.preview.detail);
			}
			for (const line of state.preview.tooltipLines.slice(0, 8)) {
				appendFormattedHoverLine(message, line);
			}
			message.appendMarkdown(`\n**ID** \`${escapeMarkdown(stripMinecraftFormatting(state.preview.id))}\``);
			if (state.preview.meta !== undefined) {
				message.appendMarkdown(`  \n**Meta** \`${String(state.preview.meta)}\``);
			}
			if (state.preview.count !== undefined) {
				message.appendMarkdown(`  \n**Count** \`${String(state.preview.count)}\``);
			}
			if (state.preview.nbt) {
				message.appendMarkdown(`  \n**NBT** \`${escapeMarkdown(stripMinecraftFormatting(state.preview.nbt))}\``);
			}
		} else {
			message.appendMarkdown(`${escapeMarkdown(localize('Runtime preview unavailable for this ItemStack id.'))}  \n`);
		}
		message.appendMarkdown(`\n[${escapeMarkdown(localize('Open ItemStack picker'))}](${pickerCommandUri})`);
		return message;
	}

	private findEditorStateContext(editor: vscode.TextEditor, position: vscode.Position): ItemStackContext | undefined {
		const states = this.editorState.get(editor) ?? [];
		return states.find((state) => {
			return state.context.valueRange.contains(position)
				|| state.context.valueRange.end.isEqual(position);
		})?.context;
	}

	private async resolveDecorationStates(contexts: ItemStackContext[]): Promise<ItemStackDecorationState[]> {
		const states = new Array<ItemStackDecorationState>(contexts.length);
		let nextIndex = 0;
		const workerCount = Math.min(ItemStackDecorationController.resolveConcurrency, contexts.length);
		const workers: Promise<void>[] = [];
		for (let workerIndex = 0; workerIndex < workerCount; workerIndex++) {
			workers.push((async () => {
				while (nextIndex < contexts.length) {
					const currentIndex = nextIndex;
					nextIndex++;
					states[currentIndex] = await this.resolveDecorationState(contexts[currentIndex]);
				}
			})());
		}
		await Promise.all(workers);
		return states;
	}

	private async resolveDecorationState(context: ItemStackContext): Promise<ItemStackDecorationState> {
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
			};
		} catch {
			return {
				context,
				preview: undefined
			};
		}
	}
}

function escapeMarkdown(value: string): string {
	return value.replace(/[\\`*_{}[\]()#+\-.!]/g, '\\$&');
}

function appendFormattedHoverLine(message: MarkdownString, value: string): void {
	message.appendMarkdown(`${renderMinecraftFormattingHtml(value)}<br/>`);
}

function createPickerCommandUri(position: vscode.Position): string {
	const argument = encodeURIComponent(JSON.stringify([{
		line: position.line,
		character: position.character
	}]));
	return `command:guide-vsc.openItemStackPicker?${argument}`;
}

function normalizePosition(value: unknown): vscode.Position | undefined {
	if (!value || typeof value !== 'object') {
		return undefined;
	}
	const candidate = value as { line?: unknown; character?: unknown };
	if (typeof candidate.line !== 'number' || typeof candidate.character !== 'number') {
		return undefined;
	}
	return new vscode.Position(candidate.line, candidate.character);
}
