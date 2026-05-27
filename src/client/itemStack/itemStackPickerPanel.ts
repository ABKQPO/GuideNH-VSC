import * as vscode from 'vscode';
import { PreviewResolvePayload, PreviewResolveResultPayload, PreviewSearchEntry } from '../../common/protocol';
import { localize } from '../localization';
import { createPreviewDataUri, escapeHtml } from './itemStackDecorationAssets';
import { findNearestItemStackContextInEditor, ItemStackContext } from './itemStackContextResolver';
import { GuideNhItemStackDropMime } from './itemStackDropPayload';
import { ItemStackPreviewClient } from './itemStackPreviewClient';
import { renderMinecraftFormattingHtml, serializeMinecraftTooltipLines, stripMinecraftFormatting } from './itemStackTextFormatting';

interface PickerState {
	documentUri: string;
	query: string;
	selectedId: string;
	selectedPreview?: PreviewResolveResultPayload;
	entries: PreviewSearchEntry[];
	context: ItemStackContext;
	entryPreviewDataUris: Record<string, string>;
	isLoading: boolean;
	errorMessage?: string;
}

interface PickerPanelMessage {
	type: 'ready' | 'search' | 'select' | 'apply' | 'refresh' | 'dragState';
	active?: boolean;
	query?: string;
	id?: string;
}

export class ItemStackPickerPanel implements vscode.Disposable {
	private panel: vscode.WebviewPanel | undefined;
	private currentState: PickerState | undefined;
	private readonly disposables: vscode.Disposable[] = [];
	private currentEditor: vscode.TextEditor | undefined;
	private stateRequestVersion = 0;
	private readonly dragHighlightDecorationType: vscode.TextEditorDecorationType;

	public constructor(
		private readonly previewClient: ItemStackPreviewClient
	) {
		this.dragHighlightDecorationType = vscode.window.createTextEditorDecorationType({
			rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
			backgroundColor: 'rgba(109, 168, 79, 0.18)',
			borderRadius: '4px',
			outline: '1px solid rgba(142, 217, 107, 0.85)'
		});
		this.disposables.push(this.dragHighlightDecorationType);
	}

	public async show(
		context: ItemStackContext,
		editor: vscode.TextEditor
	): Promise<void> {
		this.currentEditor = editor;
		const loadingState = createLoadingState(editor.document.uri.toString(), context);
		if (!this.panel) {
			this.panel = vscode.window.createWebviewPanel(
				'guide-vsc.itemStackPicker',
				localize('GuideNH ItemStack Picker'),
				vscode.ViewColumn.Beside,
				{
					enableScripts: true,
					retainContextWhenHidden: true
				}
			);
			this.panel.onDidDispose(() => {
				this.clearDragHighlight();
				this.panel = undefined;
				this.currentState = undefined;
			}, undefined, this.disposables);
			this.panel.webview.onDidReceiveMessage((message: PickerPanelMessage) => {
				void this.handleMessage(message).catch(async (error) => {
					await vscode.window.showErrorMessage(
						error instanceof Error
							? error.message
							: localize('GuideNH ItemStack picker apply failed.')
					);
				});
			}, undefined, this.disposables);
			this.currentState = loadingState;
			this.panel.webview.html = this.renderHtml(this.panel.webview, loadingState);
		}
		this.currentState = loadingState;
		if (this.panel) {
			await this.postState();
		}
		this.panel.reveal(vscode.ViewColumn.Beside, true);
		void this.loadState(context, editor);
	}

	public dispose(): void {
		this.clearDragHighlight();
		while (this.disposables.length > 0) {
			this.disposables.pop()?.dispose();
		}
		this.panel?.dispose();
	}

	private async handleMessage(message: PickerPanelMessage): Promise<void> {
		if (!this.panel || !this.currentState) {
			return;
		}
		switch (message.type) {
			case 'ready':
				await this.postState();
				return;
			case 'search':
				await this.updateSearch(typeof message.query === 'string' ? message.query : this.currentState.query);
				return;
			case 'select':
				if (typeof message.id === 'string' && message.id.length > 0) {
					await this.updateSelectedPreview(message.id);
				}
				return;
			case 'apply':
				if (typeof message.id === 'string' && message.id.length > 0) {
					await this.applySelection(message.id);
				}
				return;
			case 'refresh':
				await this.refreshCurrentState();
				return;
			case 'dragState':
				await this.updateDragHighlight(message.active === true);
				return;
			default:
				return;
		}
	}

	private async loadState(context: ItemStackContext, editor: vscode.TextEditor): Promise<void> {
		const requestVersion = ++this.stateRequestVersion;
		const documentUri = editor.document.uri.toString();
		const initialQuery = context.value.trim();
		try {
			const searchResult = await this.previewClient.search({
				capability: 'items',
				cursor: '',
				limit: 40,
				prefix: initialQuery,
				filters: {
					source: 'picker'
				}
			});
			const selectedId = pickInitialSelection(context.value, searchResult.entries);
			const selectedPreview = selectedId
				? await this.resolvePreview(selectedId)
				: undefined;
			const entryPreviewDataUris = await this.resolveEntryPreviewDataUris(searchResult.entries);
			if (!this.currentState || this.currentState.documentUri !== documentUri || requestVersion !== this.stateRequestVersion) {
				return;
			}
			this.currentState = {
				documentUri,
				query: initialQuery,
				selectedId,
				selectedPreview,
				entries: searchResult.entries,
				context,
				entryPreviewDataUris,
				isLoading: false,
				errorMessage: undefined
			};
		} catch (error) {
			if (!this.currentState || this.currentState.documentUri !== documentUri || requestVersion !== this.stateRequestVersion) {
				return;
			}
			this.currentState = {
				...createLoadingState(documentUri, context),
				isLoading: false,
				errorMessage: error instanceof Error
					? error.message
					: localize('GuideNH ItemStack picker could not load runtime items.')
			};
		}
		await this.postState();
	}

	private async updateSearch(query: string): Promise<void> {
		if (!this.currentState) {
			return;
		}
		try {
			const searchResult = await this.previewClient.search({
				capability: 'items',
				cursor: '',
				limit: 40,
				prefix: query,
				filters: {
					source: 'picker'
				}
			});
			const selectedId = pickInitialSelection(this.currentState.selectedId || query, searchResult.entries);
			const selectedPreview = selectedId
				? await this.resolvePreview(selectedId)
				: undefined;
			const entryPreviewDataUris = await this.resolveEntryPreviewDataUris(searchResult.entries);
			this.currentState = {
				...this.currentState,
				query,
				selectedId,
				selectedPreview,
				entries: searchResult.entries,
				entryPreviewDataUris,
				isLoading: false,
				errorMessage: undefined
			};
		} catch (error) {
			this.currentState = {
				...this.currentState,
				query,
				isLoading: false,
				errorMessage: error instanceof Error
					? error.message
					: localize('GuideNH ItemStack picker could not load runtime items.')
			};
		}
		await this.postState();
	}

	private async updateSelectedPreview(id: string): Promise<void> {
		if (!this.currentState) {
			return;
		}
		try {
			this.currentState = {
				...this.currentState,
				selectedId: id,
				selectedPreview: await this.resolvePreview(id),
				errorMessage: undefined
			};
		} catch (error) {
			this.currentState = {
				...this.currentState,
				selectedId: id,
				selectedPreview: undefined,
				errorMessage: error instanceof Error
					? error.message
					: localize('GuideNH ItemStack picker could not load runtime items.')
			};
		}
		await this.postState();
	}

	private async applySelection(id: string): Promise<void> {
		if (!this.currentState) {
			return;
		}
		const editor = await this.resolveTargetEditor();
		if (!editor) {
			await vscode.window.showErrorMessage(localize('Reopen the GuideNH document before applying an ItemStack id.'));
			return;
		}
		const targetRange = this.resolveApplyRange(editor);
		const didApply = await editor.edit((editBuilder) => {
			editBuilder.replace(targetRange, id);
		});
		if (!didApply) {
			await vscode.window.showErrorMessage(localize('GuideNH ItemStack picker could not apply the selected id.'));
			return;
		}
		const end = targetRange.start.translate(0, id.length);
		editor.selection = new vscode.Selection(end, end);
		editor.revealRange(new vscode.Range(targetRange.start, end));
		this.currentEditor = editor;
		this.currentState = {
			...this.currentState,
			context: {
				...this.currentState.context,
				value: id,
				valueRange: new vscode.Range(targetRange.start, end)
			},
			selectedId: id,
			selectedPreview: await this.resolvePreview(id),
			errorMessage: undefined
		};
		await this.postState();
	}

	private async refreshCurrentState(): Promise<void> {
		if (!this.currentState || !this.currentEditor) {
			return;
		}
		this.currentState = {
			...this.currentState,
			isLoading: true,
			errorMessage: undefined
		};
		await this.postState();
		await this.loadState(this.currentState.context, this.currentEditor);
	}

	private async updateDragHighlight(active: boolean): Promise<void> {
		if (!active) {
			this.clearDragHighlight();
			return;
		}
		if (!this.currentState) {
			return;
		}
		const editor = this.findVisibleTargetEditor();
		if (!editor) {
			return;
		}
		editor.setDecorations(this.dragHighlightDecorationType, [{
			range: this.resolveApplyRange(editor)
		}]);
	}

	private resolveApplyRange(editor: vscode.TextEditor): vscode.Range {
		if (!this.currentState) {
			return new vscode.Range(editor.selection.active, editor.selection.active);
		}
		const currentValue = editor.document.getText(this.currentState.context.valueRange);
		if (currentValue === this.currentState.context.value) {
			return this.currentState.context.valueRange;
		}
		const nearestContext = findNearestItemStackContextInEditor(editor);
		if (nearestContext) {
			return nearestContext.valueRange;
		}
		const selection = editor.selection;
		if (!selection.isEmpty) {
			return new vscode.Range(selection.start, selection.end);
		}
		const cursor = selection.active;
		return new vscode.Range(cursor, cursor);
	}

	private async resolveTargetEditor(): Promise<vscode.TextEditor | undefined> {
		if (!this.currentState) {
			return undefined;
		}
		const visibleEditor = this.findVisibleTargetEditor();
		if (visibleEditor) {
			return visibleEditor;
		}
		const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(this.currentState.documentUri));
		return vscode.window.showTextDocument(document, {
			preview: false,
			preserveFocus: false
		});
	}

	private findVisibleTargetEditor(): vscode.TextEditor | undefined {
		if (!this.currentState) {
			return undefined;
		}
		return vscode.window.visibleTextEditors.find((editor) => {
			return editor.document.uri.toString() === this.currentState?.documentUri;
		});
	}

	private clearDragHighlight(): void {
		for (const editor of vscode.window.visibleTextEditors) {
			editor.setDecorations(this.dragHighlightDecorationType, []);
		}
	}

	private async resolvePreview(id: string): Promise<PreviewResolveResultPayload> {
		const payload: PreviewResolvePayload = {
			capability: 'items',
			id,
			count: 1,
			renderVariant: 'picker',
			filters: {
				source: 'picker'
			}
		};
		return this.previewClient.resolve(payload);
	}

	private async resolveEntryPreviewDataUris(entries: PreviewSearchEntry[]): Promise<Record<string, string>> {
		const resolvedEntries = await Promise.all(entries.slice(0, 12).map(async (entry) => {
			try {
				const preview = await this.resolvePreview(entry.id);
				return [entry.id, createPreviewDataUri(preview)] as const;
			} catch {
				return [entry.id, ''] as const;
			}
		}));
		return Object.fromEntries(resolvedEntries);
	}

	private async postState(): Promise<void> {
		if (!this.panel || !this.currentState) {
			return;
		}
		await this.panel.webview.postMessage({
			type: 'state',
			state: serializeState(this.currentState)
		});
	}

	private renderHtml(_webview: vscode.Webview, state: PickerState): string {
		const nonce = String(Date.now());
		const initialState = escapeJsonForHtmlScriptTag(JSON.stringify(serializeState(state)));
		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>${escapeHtml(localize('GuideNH ItemStack Picker'))}</title>
	<style>
		:root {
			color-scheme: dark;
			--bg: #16191d;
			--panel: #1f2429;
			--panel-2: #252b31;
			--border: #3d4751;
			--text: #eef4ec;
			--muted: #96a29a;
			--accent: #6da84f;
			--accent-2: #8ed96b;
			--badge: #2d3b2d;
			--badge-border: #56734b;
			--mark: #d7f3a7;
			--mark-bg: rgba(153, 214, 85, 0.18);
		}
		body {
			margin: 0;
			background: linear-gradient(180deg, #1a1f24 0%, #14181c 100%);
			color: var(--text);
			font-family: Consolas, "Cascadia Code", monospace;
		}
		.layout {
			display: grid;
			grid-template-columns: minmax(260px, 380px) 1fr;
			min-height: 100vh;
		}
		.sidebar, .preview {
			padding: 16px;
		}
		.sidebar {
			border-right: 1px solid var(--border);
			background: rgba(16, 19, 22, 0.82);
		}
		.search {
			width: 100%;
			box-sizing: border-box;
			padding: 10px 12px;
			border-radius: 10px;
			border: 1px solid var(--border);
			background: var(--panel);
			color: var(--text);
			margin-bottom: 12px;
		}
		.list {
			display: flex;
			flex-direction: column;
			gap: 6px;
			max-height: calc(100vh - 110px);
			overflow: auto;
		}
		.entry {
			display: grid;
			grid-template-columns: 22px minmax(0, 1fr) auto auto;
			gap: 10px;
			align-items: center;
			padding: 8px 10px;
			border-radius: 10px;
			border: 1px solid transparent;
			background: var(--panel);
			cursor: pointer;
		}
		.entry:hover, .entry[data-selected="true"] {
			border-color: var(--accent);
			background: var(--panel-2);
		}
		.entry-icon {
			width: 18px;
			height: 18px;
			image-rendering: pixelated;
		}
		.entry-name {
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}
		.entry mark {
			color: var(--mark);
			background: var(--mark-bg);
			padding: 0 2px;
			border-radius: 3px;
		}
		.entry-id {
			color: var(--muted);
			font-size: 12px;
		}
		.entry-kind {
			font-size: 11px;
			color: #dff2b8;
			background: var(--badge);
			border: 1px solid var(--badge-border);
			border-radius: 999px;
			padding: 2px 7px;
			text-transform: uppercase;
			letter-spacing: 0.04em;
		}
		.preview-card {
			border: 1px solid var(--border);
			border-radius: 16px;
			background: linear-gradient(180deg, rgba(32, 38, 44, 0.95) 0%, rgba(20, 24, 28, 0.98) 100%);
			padding: 18px;
			box-shadow: 0 18px 40px rgba(0, 0, 0, 0.24);
		}
		.preview-header {
			display: flex;
			align-items: center;
			gap: 14px;
			margin-bottom: 14px;
		}
		.preview-icon {
			width: 42px;
			height: 42px;
			image-rendering: pixelated;
			background: rgba(255, 255, 255, 0.06);
			border-radius: 10px;
			padding: 6px;
		}
		.preview-name {
			font-size: 18px;
			font-weight: 700;
		}
		.preview-detail {
			color: var(--muted);
			font-size: 12px;
			margin-top: 3px;
		}
		.tooltip {
			border: 1px solid #281a53;
			background: linear-gradient(180deg, rgba(17, 3, 46, 0.94) 0%, rgba(8, 4, 24, 0.96) 100%);
			border-radius: 10px;
			padding: 12px;
			box-shadow: 0 10px 28px rgba(0, 0, 0, 0.26);
			margin-bottom: 14px;
		}
		.tooltip-line {
			line-height: 1.4;
			font-size: 13px;
			white-space: pre-wrap;
		}
		.meta {
			display: grid;
			gap: 8px;
			font-size: 12px;
			color: var(--muted);
		}
		.meta code {
			display: block;
			margin-top: 4px;
			padding: 8px 10px;
			background: rgba(0, 0, 0, 0.25);
			border-radius: 10px;
			color: var(--text);
			white-space: pre-wrap;
			word-break: break-word;
		}
		.apply {
			margin-top: 16px;
			display: flex;
			align-items: stretch;
			gap: 10px;
		}
		.apply-button {
			flex: 1 1 auto;
			padding: 10px 14px;
			border: 1px solid var(--accent);
			border-radius: 999px;
			background: linear-gradient(180deg, #5f983f 0%, #4f7c35 100%);
			color: #0d160d;
			font-weight: 700;
			cursor: pointer;
		}
		.apply-button:hover {
			filter: brightness(1.04);
		}
		.apply-button:active {
			transform: translateY(1px);
		}
		.apply-drag {
			flex: 0 0 auto;
			min-width: 46px;
			padding: 10px 12px;
			border: 1px solid var(--border);
			border-radius: 999px;
			background: linear-gradient(180deg, rgba(56, 66, 76, 0.98) 0%, rgba(35, 41, 47, 0.98) 100%);
			color: var(--text);
			font-weight: 700;
			cursor: grab;
		}
		.apply-drag:hover {
			border-color: var(--accent);
			color: var(--accent-2);
		}
		.apply-drag:active,
		.apply-drag[data-dragging="true"] {
			cursor: grabbing;
			border-color: var(--accent);
			background: linear-gradient(180deg, rgba(80, 102, 58, 0.98) 0%, rgba(56, 77, 38, 0.98) 100%);
		}
		.apply-hint {
			margin-top: 8px;
			color: var(--muted);
			font-size: 12px;
		}
		.empty {
			color: var(--muted);
			padding: 18px 0;
		}
		@media (max-width: 860px) {
			.layout {
				grid-template-columns: 1fr;
			}
			.sidebar {
				border-right: 0;
				border-bottom: 1px solid var(--border);
			}
		}
	</style>
</head>
<body>
	<div class="layout">
		<section class="sidebar">
			<input id="search" class="search" type="text" placeholder="${escapeHtml(localize('Search ItemStack ids or names'))}" />
			<div id="list" class="list"></div>
		</section>
		<section class="preview">
			<div id="preview"></div>
		</section>
	</div>
	<script type="application/json" id="initial-state">${initialState}</script>
	<script nonce="${nonce}">
		const vscode = acquireVsCodeApi();
		const initialState = JSON.parse(document.getElementById('initial-state')?.textContent || '{}');
		const searchInput = document.getElementById('search');
		const list = document.getElementById('list');
		const preview = document.getElementById('preview');
		let currentState = initialState;
		let debounceTimer;

		function setDragData(event, id, source) {
			if (!event.dataTransfer) {
				return;
			}
			event.dataTransfer.setData('text/plain', id);
			event.dataTransfer.setData('${GuideNhItemStackDropMime}', createDropPayload(id, source));
			event.dataTransfer.effectAllowed = 'copy';
		}

		function createDropPayload(id, source) {
			return JSON.stringify({ id, source });
		}

		function render(state) {
			currentState = state;
			searchInput.value = state.query;
			list.innerHTML = state.isLoading && state.entries.length === 0
				? '<div class="empty">${escapeHtml(localize('Loading runtime items...'))}</div>'
				: state.entries.length === 0
					? '<div class="empty">${escapeHtml(localize('No runtime items matched this query.'))}</div>'
					: state.entries.map((entry) => {
					const selected = entry.id === state.selectedId;
					const image = entry.previewDataUri ? '<img class="entry-icon" src="' + entry.previewDataUri + '" alt="">' : '<div class="entry-icon"></div>';
					const rawId = entry.id;
					const name = highlight(entry.label || rawId, state.query);
					const idHtml = highlight(rawId, state.query);
					const kind = entry.matchKind ? '<span class="entry-kind">' + escapeHtml(describeMatchKind(entry.matchKind)) + '</span>' : '';
					return '<button class="entry" draggable="true" data-id="' + escapeHtml(rawId) + '" data-selected="' + selected + '">' + image
						+ '<span class="entry-name">' + name + '</span>'
						+ '<span class="entry-id">' + idHtml + '</span>'
						+ kind
						+ '</button>';
				}).join('');
			const selectedPreview = state.selectedPreview;
			if (!selectedPreview) {
				const statusMessage = state.errorMessage
					? '<div class="empty">${escapeHtml(localize('Runtime preview is temporarily unavailable.'))}<br/><br/>' + escapeHtml(state.errorMessage) + '</div><button class="apply" id="refresh">${escapeHtml(localize('Retry runtime load'))}</button>'
					: state.isLoading
						? '<div class="empty">${escapeHtml(localize('Loading runtime preview...'))}</div>'
						: '<div class="empty">${escapeHtml(localize('Select a runtime item to inspect its preview.'))}</div>';
				preview.innerHTML = '<div class="preview-card">' + statusMessage + '</div>';
				document.getElementById('refresh')?.addEventListener('click', () => {
					vscode.postMessage({ type: 'refresh' });
				});
				return;
			}
			const tooltip = (selectedPreview.tooltipLinesHtml || []).map((line) => '<div class="tooltip-line">' + line + '</div>').join('');
			const nbtBlock = selectedPreview.nbt ? '<div><strong>NBT</strong><code>' + escapeHtml(selectedPreview.nbtPlain) + '</code></div>' : '';
			preview.innerHTML = '<div class="preview-card">'
				+ '<div class="preview-header">'
				+ '<img class="preview-icon" src="' + selectedPreview.previewDataUri + '" alt="">'
				+ '<div draggable="true" id="previewDrag" data-id="' + escapeHtml(selectedPreview.idPlain) + '"><div class="preview-name">' + selectedPreview.displayNameHtml + '</div>'
				+ '<div class="preview-detail">' + selectedPreview.detailHtml + '</div></div>'
				+ '</div>'
				+ '<div class="tooltip">' + tooltip + '</div>'
				+ '<div class="meta">'
				+ '<div><strong>ID</strong><code>' + escapeHtml(selectedPreview.idPlain) + '</code></div>'
				+ '<div><strong>Meta</strong><code>' + escapeHtml(String(selectedPreview.meta ?? 0)) + '</code></div>'
				+ '<div><strong>Count</strong><code>' + escapeHtml(String(selectedPreview.count ?? 1)) + '</code></div>'
				+ nbtBlock
				+ '</div>'
				+ '<div class="apply">'
				+ '<button class="apply-button" id="apply">${escapeHtml(localize('Apply ItemStack Id'))}</button>'
				+ '<button class="apply-drag" id="applyDrag" draggable="true" title="${escapeHtml(localize('Drag this ItemStack id into the editor'))}" aria-label="${escapeHtml(localize('Drag this ItemStack id into the editor'))}">::</button>'
				+ '</div>'
				+ '<div class="apply-hint">${escapeHtml(localize('Click to apply, or drag the handle into the editor.'))}</div>'
				+ '</div>';
			document.getElementById('apply')?.addEventListener('click', () => {
				vscode.postMessage({ type: 'apply', id: selectedPreview.id });
			});
			document.getElementById('applyDrag')?.addEventListener('dragstart', (event) => {
				event.target?.setAttribute?.('data-dragging', 'true');
				vscode.postMessage({ type: 'dragState', active: true });
				setDragData(event, selectedPreview.idPlain, 'picker-apply');
			});
			document.getElementById('applyDrag')?.addEventListener('dragend', (event) => {
				event.target?.setAttribute?.('data-dragging', 'false');
				vscode.postMessage({ type: 'dragState', active: false });
			});
			document.getElementById('previewDrag')?.addEventListener('dragstart', (event) => {
				vscode.postMessage({ type: 'dragState', active: true });
				setDragData(event, selectedPreview.idPlain, 'picker-preview');
			});
			document.getElementById('previewDrag')?.addEventListener('dragend', () => {
				vscode.postMessage({ type: 'dragState', active: false });
			});
		}

		searchInput.addEventListener('input', () => {
			clearTimeout(debounceTimer);
			debounceTimer = setTimeout(() => {
				vscode.postMessage({ type: 'search', query: searchInput.value });
			}, 140);
		});

		list.addEventListener('click', (event) => {
			const target = event.target.closest('.entry');
			if (!target) {
				return;
			}
			vscode.postMessage({ type: 'select', id: target.getAttribute('data-id') });
		});
		list.addEventListener('dragstart', (event) => {
			const target = event.target.closest('.entry');
			if (!target) {
				return;
			}
			vscode.postMessage({ type: 'dragState', active: true });
			setDragData(event, target.getAttribute('data-id'), 'picker-entry');
		});
		list.addEventListener('dragend', () => {
			vscode.postMessage({ type: 'dragState', active: false });
		});

		window.addEventListener('message', (event) => {
			if (event.data?.type === 'state') {
				render(event.data.state);
			}
		});

		function highlight(value, query) {
			const safeValue = escapeHtml(value || '');
			if (!query) {
				return safeValue;
			}
			const lowerValue = (value || '').toLowerCase();
			const lowerQuery = query.toLowerCase();
			const index = lowerValue.indexOf(lowerQuery);
			if (index < 0) {
				return safeValue;
			}
			const end = index + query.length;
			return escapeHtml(value.slice(0, index))
				+ '<mark>' + escapeHtml(value.slice(index, end)) + '</mark>'
				+ escapeHtml(value.slice(end));
		}

		function escapeHtml(value) {
			return String(value ?? '')
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;')
				.replace(/"/g, '&quot;')
				.replace(/'/g, '&#39;');
		}

		function describeMatchKind(kind) {
			switch (kind) {
				case 'namespace-prefix': return 'namespace';
				case 'id-prefix': return 'id';
				case 'path-prefix': return 'path';
				case 'path-token': return 'token';
				case 'path-acronym': return 'acronym';
				case 'label-prefix': return 'name';
				case 'label-token': return 'name token';
				case 'label-acronym': return 'name acronym';
				case 'id-compact': return 'id compact';
				case 'label-compact': return 'name compact';
				default: return kind.replace(/-/g, ' ');
			}
		}

		render(initialState);
		vscode.postMessage({ type: 'ready' });
	</script>
</body>
</html>`;
	}
}

function serializeState(state: PickerState) {
	const serializedTooltipLines = state.selectedPreview
		? serializeMinecraftTooltipLines(state.selectedPreview.tooltipLines)
		: [];
	return {
		query: state.query,
		selectedId: state.selectedId,
		isLoading: state.isLoading,
		errorMessage: state.errorMessage ?? '',
		entries: state.entries.map((entry) => ({
			...entry,
			previewDataUri: state.entryPreviewDataUris[entry.id] ?? ''
		})),
		selectedPreview: state.selectedPreview
			? {
				...state.selectedPreview,
				previewDataUri: createPreviewDataUri(state.selectedPreview),
				displayNameHtml: renderMinecraftFormattingHtml(state.selectedPreview.displayName || state.selectedPreview.id),
				detailHtml: renderMinecraftFormattingHtml(state.selectedPreview.detail || state.selectedPreview.id),
				idPlain: stripMinecraftFormatting(state.selectedPreview.id),
				nbtPlain: stripMinecraftFormatting(state.selectedPreview.nbt),
				tooltipLinesHtml: serializedTooltipLines.map((line) => line.html)
			}
			: undefined
	};
}

function createLoadingState(documentUri: string, context: ItemStackContext): PickerState {
	return {
		documentUri,
		query: context.value.trim(),
		selectedId: context.value.trim(),
		selectedPreview: undefined,
		entries: [],
		context,
		entryPreviewDataUris: {},
		isLoading: true,
		errorMessage: undefined
	};
}

export function escapeJsonForHtmlScriptTag(value: string): string {
	return value
		.replace(/</g, '\\u003C')
		.replace(/>/g, '\\u003E')
		.replace(/&/g, '\\u0026')
		.replace(/\u2028/g, '\\u2028')
		.replace(/\u2029/g, '\\u2029');
}

function pickInitialSelection(value: string, entries: PreviewSearchEntry[]): string {
	const exact = entries.find((entry) => entry.id === value);
	if (exact) {
		return exact.id;
	}
	return entries[0]?.id ?? value;
}
