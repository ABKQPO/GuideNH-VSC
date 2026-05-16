import * as vscode from 'vscode';
import { isGuideNhDocumentSelector } from './config';

export interface GuideNhCompletionAssistContext {
	languageId: string;
	uriScheme: string;
	fileName: string;
	textBeforeCursor: string;
	changeText: string;
	rangeLength: number;
	selectionEmpty: boolean;
}

const GuideNhCompletionAssistWindowSize = 4096;
const GuideNhCompletionAssistTextPattern = /^[A-Za-z0-9._:/-]$/;

export function registerGuideNhCompletionAssist(context: vscode.ExtensionContext): void {
	context.subscriptions.push(vscode.workspace.onDidChangeTextDocument((event) => {
		const editor = vscode.window.activeTextEditor;
		if (!editor || editor.document.uri.toString() !== event.document.uri.toString()) {
			return;
		}
		const selection = editor.selection;
		const change = event.contentChanges[0];
		if (!change) {
			return;
		}
		const textBeforeCursor = readGuideNhCompletionAssistPrefix(editor.document, selection.active);
		if (!shouldTriggerGuideNhSuggest({
			languageId: event.document.languageId,
			uriScheme: event.document.uri.scheme,
			fileName: event.document.uri.fsPath,
			textBeforeCursor,
			changeText: change.text,
			rangeLength: change.rangeLength,
			selectionEmpty: selection.isEmpty
		})) {
			return;
		}
		setTimeout(() => {
			const activeEditor = vscode.window.activeTextEditor;
			if (!activeEditor || activeEditor.document.uri.toString() !== event.document.uri.toString()) {
				return;
			}
			const activeSelection = activeEditor.selection;
			if (!activeSelection.isEmpty) {
				return;
			}
			const activeTextBeforeCursor = readGuideNhCompletionAssistPrefix(activeEditor.document, activeSelection.active);
			if (!isGuideNhSuggestContext(activeTextBeforeCursor)) {
				return;
			}
			void vscode.commands.executeCommand('editor.action.triggerSuggest');
		}, 0);
	}));
}

export function shouldTriggerGuideNhSuggest(context: GuideNhCompletionAssistContext): boolean {
	if (!context.selectionEmpty) {
		return false;
	}
	if (!isGuideNhCompletionAssistDocument(context)) {
		return false;
	}
	if (!isGuideNhCompletionAssistChange(context.changeText, context.rangeLength)) {
		return false;
	}
	return isGuideNhSuggestContext(context.textBeforeCursor);
}

function isGuideNhCompletionAssistDocument(context: GuideNhCompletionAssistContext): boolean {
	if (context.languageId === 'guidenh-md') {
		return true;
	}
	if (context.languageId !== 'markdown' || context.uriScheme !== 'file') {
		return false;
	}
	return isGuideNhDocumentSelector(context.fileName);
}

function isGuideNhCompletionAssistChange(text: string, rangeLength: number): boolean {
	if (text.length === 0) {
		return rangeLength === 1;
	}
	if (text === '<' || text === '<>') {
		return true;
	}
	return text.length === 1 && GuideNhCompletionAssistTextPattern.test(text);
}

function readGuideNhCompletionAssistPrefix(document: vscode.TextDocument, position: vscode.Position): string {
	const offset = document.offsetAt(position);
	const start = Math.max(0, offset - GuideNhCompletionAssistWindowSize);
	return document.getText(new vscode.Range(document.positionAt(start), position));
}

function isGuideNhSuggestContext(textBeforeCursor: string): boolean {
	const openTag = findGuideNhOpenTagPrefix(textBeforeCursor);
	if (!openTag) {
		return false;
	}
	return /^<$/.test(openTag)
		|| /<[A-Za-z][A-Za-z0-9]*$/.test(openTag)
		|| /<[A-Za-z][A-Za-z0-9]*\s+[A-Za-z_][\w.-]*$/.test(openTag)
		|| /<[A-Za-z][A-Za-z0-9]*[\s\S]*\s[A-Za-z_][\w.-]*\s*=\s*(?:"[^"]*|'[^']*|\{[^}]*|[^\s"'=<>`]*)$/.test(openTag);
}

function findGuideNhOpenTagPrefix(textBeforeCursor: string): string | undefined {
	const openTagStart = textBeforeCursor.lastIndexOf('<');
	if (openTagStart < 0) {
		return undefined;
	}
	const openTag = textBeforeCursor.slice(openTagStart);
	if (openTag.startsWith('</') || openTag.includes('>')) {
		return undefined;
	}
	return openTag;
}
