import { CodeAction, CodeActionKind, Diagnostic, Position, TextEdit } from 'vscode-languageserver/node';
import { GuideNhSchemaBundle } from '../../common/schema';
import { localizeServer } from '../localization';
import { GuideNhParsedTag, parseGuideNhDocument } from '../parser/documentParser';
import { findTagSchema, matchesTagName } from '../schema/schemaLookup';
import {
	GuideNhClosingTagMismatchDiagnosticCode,
	GuideNhLayoutIndentationDiagnosticCode,
	GuideNhUnclosedTagDiagnosticCode
} from './diagnostics';

export function createGuideNhCodeActions(
	uri: string,
	text: string,
	schema: GuideNhSchemaBundle,
	diagnostics: Diagnostic[]
): CodeAction[] {
	const tags = parseGuideNhDocument(text).tags;
	const unclosedTags = findUnclosedTags(tags, schema);
	const preferredClosingBoundaries = findPreferredClosingBoundaries(text, tags, schema);
	const missingClosuresByClosingStart = findMissingClosures(tags, schema);
	return diagnostics.flatMap((diagnostic) => [
		...createUnclosedTagCodeAction(uri, text, diagnostic, unclosedTags, preferredClosingBoundaries),
		...createClosingTagMismatchCodeAction(uri, text, diagnostic, missingClosuresByClosingStart),
		...createLayoutIndentationCodeAction(uri, text, diagnostic)
	]);
}

function createLayoutIndentationCodeAction(uri: string, text: string, diagnostic: Diagnostic): CodeAction[] {
	if (diagnostic.code !== GuideNhLayoutIndentationDiagnosticCode) {
		return [];
	}
	const lineStart = positionToOffset(text, diagnostic.range.start);
	const rawLineEnd = text.indexOf('\n', lineStart);
	const lineEnd = rawLineEnd < 0 ? text.length : rawLineEnd;
	const line = text.slice(lineStart, lineEnd).replace(/\r$/, '');
	const indentation = line.match(/^[ \t]*/)?.[0] ?? '';
	if (indentation.length === 0) {
		return [];
	}
	const parent = findFormattingParent(text, lineStart);
	if (!parent) {
		return [];
	}
	const parentIndent = getLineIndent(text, parent.start);
	const expectedIndent = parentIndent + detectIndentUnit(text);
	if (indentation === expectedIndent) {
		return [];
	}
	return [{
		title: localizeServer('codeAction.normalizeIndentation'),
		kind: CodeActionKind.QuickFix,
		diagnostics: [diagnostic],
		edit: {
			changes: {
				[uri]: [TextEdit.replace({
					start: offsetToPosition(text, lineStart),
					end: offsetToPosition(text, lineStart + indentation.length)
				}, expectedIndent)]
			}
		}
	}];
}

function findFormattingParent(text: string, offset: number): GuideNhParsedTag | undefined {
	const stack: GuideNhParsedTag[] = [];
	for (const tag of parseGuideNhDocument(text).tags) {
		if (tag.start >= offset) {
			break;
		}
		if (tag.closing) {
			popParentTag(stack, tag.name);
		} else if (!tag.selfClosing) {
			stack.push(tag);
		}
	}
	return stack[stack.length - 1];
}

function detectIndentUnit(text: string): string {
	let smallest = Number.POSITIVE_INFINITY;
	let hasTabs = false;
	for (const line of text.split(/\r?\n/)) {
		const indentation = line.match(/^[ \t]+(?=<[A-Za-z/])/)?.[0];
		if (!indentation) {
			continue;
		}
		if (indentation.includes('\t')) {
			hasTabs = true;
			continue;
		}
		smallest = Math.min(smallest, indentation.length);
	}
	return hasTabs ? '\t' : ' '.repeat(Number.isFinite(smallest) && smallest > 0 ? Math.min(smallest, 4) : 2);
}

function createUnclosedTagCodeAction(
	uri: string,
	text: string,
	diagnostic: Diagnostic,
	unclosedTags: GuideNhParsedTag[],
	preferredClosingBoundaries: Map<number, GuideNhParsedTag>
): CodeAction[] {
	if (diagnostic.code !== GuideNhUnclosedTagDiagnosticCode) {
		return [];
	}
	const start = positionToOffset(text, diagnostic.range.start);
	const tagIndex = unclosedTags.findIndex((tag) => tag.start === start);
	if (tagIndex < 0) {
		return [];
	}
	const closingTags = unclosedTags.slice(tagIndex).reverse();
	const insertion = createClosingTagInsertion(text, closingTags);
	const title = closingTags.length === 1
		? localizeServer('codeAction.addClosingTag', closingTags[0].name)
		: localizeServer('codeAction.closeNestedTags', closingTags[closingTags.length - 1].name);
	const actions: CodeAction[] = [];
	const preferredBoundary = preferredClosingBoundaries.get(unclosedTags[tagIndex].start);
	if (preferredBoundary) {
		const preferredTitle = closingTags.length === 1
			? localizeServer('codeAction.addClosingTagAfterTag', closingTags[0].name, preferredBoundary.name)
			: localizeServer('codeAction.closeNestedTagsAfterTag', closingTags[closingTags.length - 1].name, preferredBoundary.name);
		actions.push({
			title: preferredTitle,
			kind: CodeActionKind.QuickFix,
			diagnostics: [diagnostic],
			edit: {
				changes: {
					[uri]: [TextEdit.insert(offsetToPosition(text, preferredBoundary.end), createClosingTagInsertion(text, closingTags, preferredBoundary.end))]
				}
			}
		});
	}
	actions.push({
		title,
		kind: CodeActionKind.QuickFix,
		diagnostics: [diagnostic],
		edit: {
			changes: {
				[uri]: [TextEdit.insert(offsetToPosition(text, text.length), insertion)]
			}
		}
	});
	return actions;
}

function createClosingTagMismatchCodeAction(
	uri: string,
	text: string,
	diagnostic: Diagnostic,
	missingClosuresByClosingStart: Map<number, GuideNhParsedTag[]>
): CodeAction[] {
	if (diagnostic.code !== GuideNhClosingTagMismatchDiagnosticCode) {
		return [];
	}
	const closingTagStart = positionToOffset(text, diagnostic.range.start);
	const missingClosures = missingClosuresByClosingStart.get(closingTagStart);
	if (!missingClosures || missingClosures.length === 0) {
		return [];
	}
	const closingTagName = text.slice(closingTagStart).match(/^<\/([A-Za-z][A-Za-z0-9]*)/)?.[1];
	if (!closingTagName) {
		return [];
	}
	const lineBreak = text.includes('\r\n') ? '\r\n' : '\n';
	const indent = getLineIndent(text, closingTagStart);
	const insertion = missingClosures.map((tag) => `${indent}</${tag.name}>`).join(lineBreak) + lineBreak;
	return [{
		title: localizeServer('codeAction.insertMissingClosures', closingTagName),
		kind: CodeActionKind.QuickFix,
		diagnostics: [diagnostic],
		edit: {
			changes: {
				[uri]: [TextEdit.insert(offsetToPosition(text, closingTagStart), insertion)]
			}
		}
	}];
}

function findUnclosedTags(tags: GuideNhParsedTag[], schema: GuideNhSchemaBundle): GuideNhParsedTag[] {
	const parentStack: GuideNhParsedTag[] = [];
	for (const tag of tags) {
		if (tag.closing) {
			popParentTag(parentStack, tag.name);
			continue;
		}
		if (findTagSchema(schema, tag.name) && !tag.selfClosing) {
			parentStack.push(tag);
		}
	}
	return parentStack;
}

function findPreferredClosingBoundaries(
	text: string,
	tags: GuideNhParsedTag[],
	schema: GuideNhSchemaBundle
): Map<number, GuideNhParsedTag> {
	const boundaries = new Map<number, GuideNhParsedTag>();
	const unclosedTags = findUnclosedTags(tags, schema);
	for (const unclosedTag of unclosedTags) {
		const boundary = findPreferredClosingBoundary(text, tags, schema, unclosedTag);
		if (boundary) {
			boundaries.set(unclosedTag.start, boundary);
		}
	}
	return boundaries;
}

function findPreferredClosingBoundary(
	text: string,
	tags: GuideNhParsedTag[],
	schema: GuideNhSchemaBundle,
	unclosedTag: GuideNhParsedTag
): GuideNhParsedTag | undefined {
	const startIndex = tags.findIndex((tag) => tag.start === unclosedTag.start);
	if (startIndex < 0) {
		return undefined;
	}
	for (let index = startIndex + 1; index < tags.length; index++) {
		const tag = tags[index];
		if ((!tag.closing && !tag.selfClosing) || !findTagSchema(schema, tag.name)) {
			continue;
		}
		const nextTagStart = tags[index + 1]?.start ?? text.length;
		if (containsMarkdownContent(text, tag.end, nextTagStart)) {
			return tag;
		}
	}
	return undefined;
}

function containsMarkdownContent(text: string, start: number, end: number): boolean {
	return /\S/.test(text.slice(start, end));
}

function findMissingClosures(tags: GuideNhParsedTag[], schema: GuideNhSchemaBundle): Map<number, GuideNhParsedTag[]> {
	const missingClosuresByClosingStart = new Map<number, GuideNhParsedTag[]>();
	const parentStack: GuideNhParsedTag[] = [];
	for (const tag of tags) {
		if (tag.closing) {
			const matchingIndex = findMatchingTagIndex(parentStack, tag.name);
			if (matchingIndex >= 0 && matchingIndex < parentStack.length - 1) {
				missingClosuresByClosingStart.set(tag.start, parentStack.slice(matchingIndex + 1).reverse());
			}
			if (matchingIndex >= 0) {
				parentStack.splice(matchingIndex);
			}
			continue;
		}
		if (findTagSchema(schema, tag.name) && !tag.selfClosing) {
			parentStack.push(tag);
		}
	}
	return missingClosuresByClosingStart;
}

function popParentTag(parentStack: GuideNhParsedTag[], tagName: string): void {
	const index = findMatchingTagIndex(parentStack, tagName);
	if (index >= 0) {
		parentStack.splice(index);
	}
}

function findMatchingTagIndex(parentStack: GuideNhParsedTag[], tagName: string): number {
	for (let index = parentStack.length - 1; index >= 0; index--) {
		if (matchesTagName(parentStack[index].name, tagName)) {
			return index;
		}
	}
	return -1;
}

function createClosingTagInsertion(text: string, tags: GuideNhParsedTag[], offset = text.length): string {
	const lineBreak = text.includes('\r\n') ? '\r\n' : '\n';
	const prefix = offset === text.length && (text.endsWith('\n') || text.endsWith('\r')) ? '' : lineBreak;
	return prefix + tags.map((tag) => `${getLineIndent(text, tag.start)}</${tag.name}>`).join(lineBreak);
}

function getLineIndent(text: string, offset: number): string {
	const lineStart = Math.max(0, text.lastIndexOf('\n', offset - 1) + 1);
	return text.slice(lineStart, offset).match(/^\s*/)?.[0] ?? '';
}

function positionToOffset(text: string, position: Position): number {
	let offset = 0;
	for (let line = 0; line < position.line && offset < text.length; line++) {
		const nextLine = text.indexOf('\n', offset);
		offset = nextLine < 0 ? text.length : nextLine + 1;
	}
	return Math.min(text.length, offset + position.character);
}

function offsetToPosition(text: string, offset: number): Position {
	let line = 0;
	let lineStart = 0;
	for (let index = 0; index < offset; index++) {
		if (text.charCodeAt(index) === 10) {
			line++;
			lineStart = index + 1;
		}
	}
	return Position.create(line, offset - lineStart);
}
