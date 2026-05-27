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

function createEditor(uri: string) {
	const document = {
		uri: vscode.Uri.parse(uri),
		getText: () => '',
		languageId: 'markdown'
	};
	return {
		document,
		selection: new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 0)),
		revealRange: () => undefined,
		edit: async () => true
	} as unknown as vscode.TextEditor;
}

async function tick(): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, 0));
}
