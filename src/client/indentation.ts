import * as vscode from 'vscode';
import { isGuideNhDocumentSelector } from './config';

export function registerGuideNhIndentation(context: vscode.ExtensionContext): void {
	context.subscriptions.push(
		vscode.languages.registerOnTypeFormattingEditProvider(
			[
				{ language: 'guidenh-md' },
				{ language: 'markdown', scheme: 'file' }
			],
			{
				provideOnTypeFormattingEdits(document, position, ch, options) {
					if (!isGuideNhDocument(document)) {
						return [];
					}
					if (ch === '\n') {
						return createNewlineIndentationEdit(document, position, options);
					}
					if (ch === '>') {
						return createClosingTagAlignmentEdit(document, position);
					}
					return [];
				}
			},
			'\n',
			'>'
		)
	);
}

function isGuideNhDocument(document: vscode.TextDocument): boolean {
	return document.languageId === 'guidenh-md'
		|| (document.languageId === 'markdown' && document.uri.scheme === 'file' && isGuideNhDocumentSelector(document.uri.fsPath));
}

function createNewlineIndentationEdit(
	document: vscode.TextDocument,
	position: vscode.Position,
	options: vscode.FormattingOptions
): vscode.TextEdit[] {
	const currentLine = document.lineAt(position.line).text;
	const existingIndent = currentLine.slice(0, position.character).match(/^[ \t]*/)?.[0] ?? '';
	const previousLine = position.line > 0 ? document.lineAt(position.line - 1).text : '';
	const lineBreakOffset = document.offsetAt(new vscode.Position(position.line, 0));
	const openTags = findOpenTagsBefore(document.getText(), lineBreakOffset);
	let targetIndent = getLeadingWhitespace(previousLine);
	if (endsWithNonSelfClosingTag(previousLine)) {
		targetIndent = getLeadingWhitespace(previousLine) + createIndentUnit(options);
	} else if (openTags.length > 0 && previousLine.trim().length > 0) {
		const parentIndent = getLeadingWhitespace(document.lineAt(document.positionAt(openTags[openTags.length - 1].start).line).text);
		if (targetIndent.length < parentIndent.length + createIndentUnit(options).length) {
			targetIndent = parentIndent + createIndentUnit(options);
		}
	}
	if (targetIndent === existingIndent) {
		return [];
	}
	return [vscode.TextEdit.replace(
		new vscode.Range(position.line, 0, position.line, existingIndent.length),
		targetIndent
	)];
}

function createClosingTagAlignmentEdit(document: vscode.TextDocument, position: vscode.Position): vscode.TextEdit[] {
	const line = document.lineAt(position.line).text;
	const closing = line.match(/^(\s*)<\/([A-Za-z][A-Za-z0-9]*)>\s*$/);
	if (!closing) {
		return [];
	}
	const lineStart = document.offsetAt(new vscode.Position(position.line, 0));
	const openTags = findOpenTagsBefore(document.getText(), lineStart);
	const match = [...openTags].reverse().find((tag) => tag.name === closing[2]);
	if (!match) {
		return [];
	}
	const openingLine = document.lineAt(document.positionAt(match.start).line).text;
	const targetIndent = getLeadingWhitespace(openingLine);
	if (closing[1] === targetIndent) {
		return [];
	}
	return [vscode.TextEdit.replace(
		new vscode.Range(position.line, 0, position.line, closing[1].length),
		targetIndent
	)];
}

interface OpenTag {
	name: string;
	start: number;
}

function findOpenTagsBefore(text: string, offset: number): OpenTag[] {
	const stack: OpenTag[] = [];
	const tagPattern = /<\/?([A-Za-z][A-Za-z0-9]*)(?:\s[^<>]*?)?\/?\>/g;
	let match: RegExpExecArray | null;
	while ((match = tagPattern.exec(text)) !== null && match.index < offset) {
		const source = match[0];
		if (source.startsWith('</')) {
			const index = [...stack].reverse().findIndex((tag) => tag.name === match![1]);
			if (index >= 0) {
				stack.splice(stack.length - 1 - index, 1);
			}
		} else if (!/\/\s*>$/.test(source)) {
			stack.push({ name: match[1], start: match.index });
		}
	}
	return stack;
}

function endsWithNonSelfClosingTag(line: string): boolean {
	return /<([A-Za-z][A-Za-z0-9]*)(?:\s[^<>]*?)?>\s*$/.test(line)
		&& !/<\/[A-Za-z][A-Za-z0-9]*>\s*$/.test(line)
		&& !/\/\s*>\s*$/.test(line);
}

function createIndentUnit(options: vscode.FormattingOptions): string {
	return options.insertSpaces ? ' '.repeat(Math.max(1, options.tabSize)) : '\t';
}

function getLeadingWhitespace(line: string): string {
	return line.match(/^[ \t]*/)?.[0] ?? '';
}
