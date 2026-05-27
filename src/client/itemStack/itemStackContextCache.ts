import * as vscode from 'vscode';
import {
	findVisibleItemStackContexts,
	isGuideNhPreviewDocument,
	ItemStackContext
} from './itemStackContextResolver';

interface ItemStackContextCacheState {
	documentUri: string;
	documentVersion: number;
	visibleRangeKey?: string;
	visibleContexts?: readonly ItemStackContext[];
	nearbyContextsByLine: Map<number, readonly ItemStackContext[]>;
}

export class ItemStackContextCache {
	private static readonly nearbyLinePadding = 8;
	private readonly editorState = new WeakMap<vscode.TextEditor, ItemStackContextCacheState>();

	public getVisibleContexts(editor: vscode.TextEditor): readonly ItemStackContext[] {
		if (!isGuideNhPreviewDocument(editor.document)) {
			return [];
		}
		const state = this.getEditorState(editor);
		const visibleRangeKey = this.createVisibleRangeKey(editor.visibleRanges);
		if (state.visibleRangeKey === visibleRangeKey && state.visibleContexts) {
			return state.visibleContexts;
		}
		const contexts = findVisibleItemStackContexts(editor.document, editor.visibleRanges);
		state.visibleRangeKey = visibleRangeKey;
		state.visibleContexts = contexts;
		return contexts;
	}

	public findContextAt(
		editor: vscode.TextEditor,
		position: vscode.Position = editor.selection.active
	): ItemStackContext | undefined {
		return this.getNearbyContexts(editor, position.line).find((context) => context.valueRange.contains(position));
	}

	public findNearestContext(
		editor: vscode.TextEditor,
		position: vscode.Position = editor.selection.active
	): ItemStackContext | undefined {
		const contexts = this.getNearbyContexts(editor, position.line);
		return contexts.find((context) => context.valueRange.contains(position))
			?? contexts.find((context) => context.valueRange.end.isEqual(position));
	}

	private getNearbyContexts(editor: vscode.TextEditor, line: number): readonly ItemStackContext[] {
		if (!isGuideNhPreviewDocument(editor.document)) {
			return [];
		}
		const state = this.getEditorState(editor);
		const cached = state.nearbyContextsByLine.get(line);
		if (cached) {
			return cached;
		}
		const scanRange = createNearbyLineRange(
			editor.document,
			line,
			ItemStackContextCache.nearbyLinePadding
		);
		const contexts = findVisibleItemStackContexts(editor.document, [scanRange]);
		state.nearbyContextsByLine.set(line, contexts);
		return contexts;
	}

	private getEditorState(editor: vscode.TextEditor): ItemStackContextCacheState {
		const documentUri = editor.document.uri.toString();
		const documentVersion = editor.document.version;
		const currentState = this.editorState.get(editor);
		if (
			currentState
			&& currentState.documentUri === documentUri
			&& currentState.documentVersion === documentVersion
		) {
			return currentState;
		}
		const nextState: ItemStackContextCacheState = {
			documentUri,
			documentVersion,
			nearbyContextsByLine: new Map<number, readonly ItemStackContext[]>()
		};
		this.editorState.set(editor, nextState);
		return nextState;
	}

	private createVisibleRangeKey(ranges: readonly vscode.Range[]): string {
		return ranges.map((range) => {
			return [
				range.start.line,
				range.start.character,
				range.end.line,
				range.end.character
			].join(':');
		}).join('|');
	}
}

function createNearbyLineRange(
	document: vscode.TextDocument,
	line: number,
	linePadding: number
): vscode.Range {
	const startLine = Math.max(0, line - linePadding);
	const endLine = Math.min(document.lineCount - 1, line + linePadding);
	return new vscode.Range(
		new vscode.Position(startLine, 0),
		document.lineAt(endLine).range.end
	);
}
