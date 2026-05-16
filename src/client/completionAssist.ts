import * as vscode from 'vscode';
import { isGuideNhDocumentSelector } from './config';

export interface GuideNhCompletionAssistContext {
	languageId: string;
	uriScheme: string;
	fileName: string;
	linePrefix: string;
	changeText: string;
	rangeLength: number;
	selectionEmpty: boolean;
}

const GuideNhOpenTagPrefixPattern = /<([A-Z][A-Za-z0-9]*)?$/;
const GuideNhCompletionAssistTextPattern = /^[A-Za-z0-9]$/;

export function registerGuideNhCompletionAssist(context: vscode.ExtensionContext): void {
	context.subscriptions.push(vscode.workspace.onDidChangeTextDocument((event) => {
		const editor = vscode.window.activeTextEditor;
		if (!editor || editor.document.uri.toString() !== event.document.uri.toString()) {
			return;
		}
		const selection = editor.selection;
		const linePrefix = editor.document.lineAt(selection.active.line).text.slice(0, selection.active.character);
		const change = event.contentChanges[0];
		if (!change) {
			return;
		}
		if (!shouldTriggerGuideNhSuggest({
			languageId: event.document.languageId,
			uriScheme: event.document.uri.scheme,
			fileName: event.document.uri.fsPath,
			linePrefix,
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
			const activeLinePrefix = activeEditor.document.lineAt(activeSelection.active.line).text.slice(0, activeSelection.active.character);
			if (!GuideNhOpenTagPrefixPattern.test(activeLinePrefix)) {
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
	return GuideNhOpenTagPrefixPattern.test(context.linePrefix);
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
