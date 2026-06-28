import * as assert from 'assert';
import * as vscode from 'vscode';
import {
	escapeJsonForHtmlScriptTag,
	ItemStackPickerPanel
} from '../client/itemStack/itemStackPickerPanel';
import {
	PreviewResolvePayload,
	PreviewResolveResultPayload,
	PreviewSearchPayload,
	PreviewSearchResultPayload
} from '../common/protocol';

suite('GuideNH item stack picker panel', () => {
	test('escapes serialized state for html script tags', () => {
		const escaped = escapeJsonForHtmlScriptTag('{"value":"</script><img src=x onerror=1>"}');
		assert.strictEqual(escaped.includes('</script>'), false);
		assert.strictEqual(escaped.includes('<img'), false);
		assert.ok(escaped.includes('\\u003C/script\\u003E'));
	});

	test('renders separate apply and drag affordances in the picker webview', async () => {
		const panel = new ItemStackPickerPanel({
			search: async (): Promise<PreviewSearchResultPayload> => ({
				capability: 'items',
				version: 1,
				entries: [createSearchEntry('minecraft:stone')],
				nextCursor: null
			}),
			resolve: async (payload: PreviewResolvePayload): Promise<PreviewResolveResultPayload> => ({
				capability: payload.capability,
				previewKey: payload.id,
				id: payload.id,
				displayName: payload.id,
				detail: payload.id,
				meta: 0,
				count: 1,
				nbt: '',
				tooltipLines: [payload.id],
				iconPngBase64: 'AAAA',
				pixelWidth: 16,
				pixelHeight: 16
			})
		} as never);

		const webview = {
			html: '',
			postMessage: async () => true,
			onDidReceiveMessage: () => ({ dispose: () => undefined })
		};
		const createdPanel = {
			webview,
			onDidDispose: (_listener: () => void, _thisArg?: unknown, targetDisposables?: Array<{ dispose: () => void }>) => {
				targetDisposables?.push({ dispose: () => undefined });
				return { dispose: () => undefined };
			},
			reveal: () => undefined,
			dispose: () => undefined
		};
		const originalCreateWebviewPanel = vscode.window.createWebviewPanel;
		(vscode.window as unknown as { createWebviewPanel: typeof vscode.window.createWebviewPanel }).createWebviewPanel = () => createdPanel as unknown as vscode.WebviewPanel;

		try {
			await panel.show(createContext('minecraft:stone'), createEditor('file:///picker.md'));
			assert.ok(webview.html.includes('id="applyDrag"'));
			assert.ok(webview.html.includes('Click to apply, or drag the handle into the editor.'));
		} finally {
			(vscode.window as unknown as { createWebviewPanel: typeof vscode.window.createWebviewPanel }).createWebviewPanel = originalCreateWebviewPanel;
			panel.dispose();
		}
	});

	test('renders drag state notifications for picker drag interactions', async () => {
		const panel = new ItemStackPickerPanel({
			search: async (): Promise<PreviewSearchResultPayload> => ({
				capability: 'items',
				version: 1,
				entries: [createSearchEntry('minecraft:stone')],
				nextCursor: null
			}),
			resolve: async (payload: PreviewResolvePayload): Promise<PreviewResolveResultPayload> => ({
				capability: payload.capability,
				previewKey: payload.id,
				id: payload.id,
				displayName: payload.id,
				detail: payload.id,
				meta: 0,
				count: 1,
				nbt: '',
				tooltipLines: [payload.id],
				iconPngBase64: 'AAAA',
				pixelWidth: 16,
				pixelHeight: 16
			})
		} as never);

		const webview = {
			html: '',
			postMessage: async () => true,
			onDidReceiveMessage: () => ({ dispose: () => undefined })
		};
		const createdPanel = {
			webview,
			onDidDispose: (_listener: () => void, _thisArg?: unknown, targetDisposables?: Array<{ dispose: () => void }>) => {
				targetDisposables?.push({ dispose: () => undefined });
				return { dispose: () => undefined };
			},
			reveal: () => undefined,
			dispose: () => undefined
		};
		const originalCreateWebviewPanel = vscode.window.createWebviewPanel;
		(vscode.window as unknown as { createWebviewPanel: typeof vscode.window.createWebviewPanel }).createWebviewPanel = () => createdPanel as unknown as vscode.WebviewPanel;

		try {
			await panel.show(createContext('minecraft:stone'), createEditor('file:///picker.md'));
			assert.ok(webview.html.includes("type: 'dragState', active: true"));
			assert.ok(webview.html.includes("type: 'dragState', active: false"));
		} finally {
			(vscode.window as unknown as { createWebviewPanel: typeof vscode.window.createWebviewPanel }).createWebviewPanel = originalCreateWebviewPanel;
			panel.dispose();
		}
	});

	test('ignores stale async load results when a newer show call wins', async () => {
		let resolveFirstSearch: ((value: PreviewSearchResultPayload) => void) | undefined;
		let resolveSecondSearch: ((value: PreviewSearchResultPayload) => void) | undefined;
		const panel = new ItemStackPickerPanel({
			search: (payload: PreviewSearchPayload) => {
				if (payload.prefix === 'first') {
					return new Promise<PreviewSearchResultPayload>((resolve) => {
						resolveFirstSearch = resolve;
					});
				}
				return new Promise<PreviewSearchResultPayload>((resolve) => {
					resolveSecondSearch = resolve;
				});
			},
			resolve: async (payload: PreviewResolvePayload): Promise<PreviewResolveResultPayload> => {
				return {
					capability: payload.capability,
					previewKey: payload.id,
					id: payload.id,
					displayName: payload.id,
					detail: payload.id,
					meta: 0,
					count: 1,
					nbt: '',
					tooltipLines: [payload.id],
					iconPngBase64: 'AAAA',
					pixelWidth: 16,
					pixelHeight: 16
				};
			}
		} as never);

		const postedStates: unknown[] = [];
		const webview = {
			html: '',
			postMessage: async (payload: unknown) => {
				postedStates.push(payload);
				return true;
			},
			onDidReceiveMessage: () => ({ dispose: () => undefined })
		};
		const disposables: Array<{ dispose: () => void }> = [];
		const createdPanel = {
			webview,
			onDidDispose: (_listener: () => void, _thisArg?: unknown, targetDisposables?: Array<{ dispose: () => void }>) => {
				targetDisposables?.push({ dispose: () => undefined });
				return { dispose: () => undefined };
			},
			reveal: () => undefined,
			dispose: () => undefined
		};
		const originalCreateWebviewPanel = vscode.window.createWebviewPanel;
		const originalShowErrorMessage = vscode.window.showErrorMessage;
		(vscode.window as unknown as { createWebviewPanel: typeof vscode.window.createWebviewPanel }).createWebviewPanel = () => createdPanel as unknown as vscode.WebviewPanel;
		(vscode.window as unknown as { showErrorMessage: typeof vscode.window.showErrorMessage }).showErrorMessage = async () => undefined;

		try {
			const editor = createEditor('file:///picker.md');
			const firstContext = createContext('first');
			const secondContext = createContext('second');
			await panel.show(firstContext, editor);
			await panel.show(secondContext, editor);
			resolveSecondSearch?.({
				capability: 'items',
				version: 1,
				entries: [createSearchEntry('second:item')],
				nextCursor: null
			});
			await tick();
			resolveFirstSearch?.({
				capability: 'items',
				version: 1,
				entries: [createSearchEntry('first:item')],
				nextCursor: null
			});
			await tick();

			const states = postedStates
				.map((payload) => (payload as { state?: { query?: string; selectedId?: string } }).state)
				.filter((state): state is { query: string; selectedId: string } => Boolean(state?.query && state?.selectedId));
			assert.ok(states.some((state) => state.query === 'second' && state.selectedId === 'second:item'));
			assert.strictEqual(states.some((state) => state.query === 'first' && state.selectedId === 'first:item'), false);
		} finally {
			(vscode.window as unknown as { createWebviewPanel: typeof vscode.window.createWebviewPanel }).createWebviewPanel = originalCreateWebviewPanel;
			(vscode.window as unknown as { showErrorMessage: typeof vscode.window.showErrorMessage }).showErrorMessage = originalShowErrorMessage;
			panel.dispose();
		}
	});

	test('renders composition-aware search scheduling hooks', async () => {
		const panel = createPanelForHtmlTests();
		const webview = createWebviewHarness();
		const restore = stubWebviewPanel(webview);

		try {
			await panel.show(createContext('minecraft:stone'), createEditor('file:///picker.md'));
			assert.ok(webview.html.includes("searchInput.addEventListener('compositionstart'"));
			assert.ok(webview.html.includes("searchInput.addEventListener('compositionend'"));
			assert.ok(webview.html.includes("searchInput.addEventListener('keydown'"));
		} finally {
			restore();
			panel.dispose();
		}
	});

	test('renders immediate search dispatch on Enter', async () => {
		const panel = createPanelForHtmlTests();
		const webview = createWebviewHarness();
		const restore = stubWebviewPanel(webview);

		try {
			await panel.show(createContext('minecraft:stone'), createEditor('file:///picker.md'));
			assert.ok(webview.html.includes("if (event.key === 'Enter')"));
			assert.ok(webview.html.includes("vscode.postMessage({ type: 'search', query: searchInput.value });"));
		} finally {
			restore();
			panel.dispose();
		}
	});

	test('uses same-binding relocation instead of nearest-context fallback during apply', async () => {
		const panel = createPanelForHtmlTests();
		const shifted = '<ReplaceBlock from="  minecraft:stone" to="minecraft:dirt" />';
		const document = await vscode.workspace.openTextDocument({ language: 'markdown', content: shifted });
		let appliedRange: vscode.Range | undefined;
		let appliedValue: string | undefined;
		const editor = createEditableEditor(document, (range, value) => {
			appliedRange = range;
			appliedValue = value;
		});
		const originalVisibleTextEditors = vscode.window.visibleTextEditors;
		const originalOpenTextDocument = vscode.workspace.openTextDocument;
		const originalShowTextDocument = vscode.window.showTextDocument;
		Object.defineProperty(vscode.window, 'visibleTextEditors', {
			configurable: true,
			get: () => [editor]
		});
		(vscode.workspace as unknown as { openTextDocument: typeof vscode.workspace.openTextDocument }).openTextDocument = async () => document;
		(vscode.window as unknown as { showTextDocument: typeof vscode.window.showTextDocument }).showTextDocument = async () => editor;
		const context = {
			tagName: 'ReplaceBlock',
			attributeName: 'from',
			value: 'minecraft:stone',
			tagRange: new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, shifted.length)),
			valueRange: new vscode.Range(new vscode.Position(0, 20), new vscode.Position(0, 35)),
			line: 0
		};

		try {
			await panel.show(context, editor);
			await (panel as unknown as { applySelection: (id: string) => Promise<void> }).applySelection('gregtech:machine');
			assert.strictEqual(appliedValue, 'gregtech:machine');
			assert.ok(appliedRange);
			assert.strictEqual(document.getText(appliedRange!).includes('minecraft:dirt'), false);
		} finally {
			Object.defineProperty(vscode.window, 'visibleTextEditors', {
				configurable: true,
				get: () => originalVisibleTextEditors
			});
			(vscode.workspace as unknown as { openTextDocument: typeof vscode.workspace.openTextDocument }).openTextDocument = originalOpenTextDocument;
			(vscode.window as unknown as { showTextDocument: typeof vscode.window.showTextDocument }).showTextDocument = originalShowTextDocument;
			panel.dispose();
		}
	});
});

function createSearchEntry(id: string) {
	return {
		id,
		label: id,
		detail: id,
		previewKey: id
	};
}

function createContext(value: string) {
	const start = new vscode.Position(0, 0);
	const end = new vscode.Position(0, value.length);
	return {
		tagName: 'ItemStack',
		attributeName: 'id',
		value,
		tagRange: new vscode.Range(start, end),
		valueRange: new vscode.Range(start, end),
		line: 0
	};
}

function createPanelForHtmlTests() {
	return new ItemStackPickerPanel({
		search: async (): Promise<PreviewSearchResultPayload> => ({
			capability: 'items',
			version: 1,
			entries: [createSearchEntry('minecraft:stone')],
			nextCursor: null
		}),
		resolve: async (payload: PreviewResolvePayload): Promise<PreviewResolveResultPayload> => ({
			capability: payload.capability,
			previewKey: payload.id,
			id: payload.id,
			displayName: payload.id,
			detail: payload.id,
			meta: 0,
			count: 1,
			nbt: '',
			tooltipLines: [payload.id],
			iconPngBase64: 'AAAA',
			pixelWidth: 16,
			pixelHeight: 16
		})
	} as never);
}

function createEditor(uri: string) {
	const document = {
		uri: vscode.Uri.parse(uri),
		getText: () => '',
		lineAt: () => ({ range: new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 0)) }),
		languageId: 'markdown'
	};
	return {
		document,
		selection: new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 0)),
		revealRange: () => undefined,
		edit: async () => true
	} as unknown as vscode.TextEditor;
}

function createEditableEditor(
	document: vscode.TextDocument,
	onReplace: (range: vscode.Range, value: string) => void
) {
	return {
		document,
		selection: new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 0)),
		visibleRanges: [new vscode.Range(new vscode.Position(0, 0), document.lineAt(document.lineCount - 1).range.end)],
		revealRange: () => undefined,
		setDecorations: () => undefined,
		edit: async (callback: (editBuilder: vscode.TextEditorEdit) => void) => {
			callback({
				replace: (range: vscode.Range, value: string) => {
					onReplace(range, value);
				}
			} as vscode.TextEditorEdit);
			return true;
		}
	} as unknown as vscode.TextEditor;
}

function createWebviewHarness() {
	return {
		html: '',
		postMessage: async () => true,
		onDidReceiveMessage: () => ({ dispose: () => undefined })
	};
}

function stubWebviewPanel(webview: ReturnType<typeof createWebviewHarness>) {
	const createdPanel = {
		webview,
		onDidDispose: (_listener: () => void, _thisArg?: unknown, targetDisposables?: Array<{ dispose: () => void }>) => {
			targetDisposables?.push({ dispose: () => undefined });
			return { dispose: () => undefined };
		},
		reveal: () => undefined,
		dispose: () => undefined
	};
	const originalCreateWebviewPanel = vscode.window.createWebviewPanel;
	(vscode.window as unknown as { createWebviewPanel: typeof vscode.window.createWebviewPanel }).createWebviewPanel = () => createdPanel as unknown as vscode.WebviewPanel;
	return () => {
		(vscode.window as unknown as { createWebviewPanel: typeof vscode.window.createWebviewPanel }).createWebviewPanel = originalCreateWebviewPanel;
	};
}

async function tick(): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, 0));
}
