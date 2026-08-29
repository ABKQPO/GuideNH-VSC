import { extractFrontmatter, FrontmatterBlock } from './frontmatter';

export interface GuideNhParsedTag {
	name: string;
	source: string;
	attributes: Record<string, string | true>;
	attributeRanges: Record<string, { start: number; end: number }>;
	attributeValueStyles: Record<string, GuideNhAttributeValueStyle>;
	start: number;
	end: number;
	selfClosing: boolean;
	closing: boolean;
}

export interface GuideNhParsedDocument {
	frontmatter?: FrontmatterBlock;
	tags: GuideNhParsedTag[];
}

export type GuideNhAttributeValueStyle = 'string' | 'expression' | 'bare';

interface MaskRange {
	start: number;
	end: number;
}

const IgnoredHtmlTagNames = new Set([
	'a', 'abbr', 'area', 'b', 'base', 'code', 'col', 'del', 'em', 'embed', 'hr', 'i', 'img', 'input', 'link', 'mark',
	'meta', 'param', 's', 'small', 'source', 'span', 'strong', 'sub', 'sup', 'track', 'u', 'wbr'
]);
const GuideNhVoidTagNames = new Set(['br']);

export function maskIgnoredMarkdownRanges(text: string): string {
	const ranges = [
		...collectRegexRanges(text, /\{\/\*[\s\S]*?\*\/\}/g),
		...collectFencedCodeRanges(text),
		...collectInlineCodeRanges(text)
	];
	if (ranges.length === 0) {
		return text;
	}
	return applyMaskRanges(text, ranges);
}

function collectRegexRanges(text: string, pattern: RegExp): MaskRange[] {
	const ranges: MaskRange[] = [];
	let match: RegExpExecArray | null;
	while ((match = pattern.exec(text)) !== null) {
		ranges.push({ start: match.index, end: match.index + match[0].length });
	}
	return ranges;
}

function collectFencedCodeRanges(text: string): MaskRange[] {
	const ranges: MaskRange[] = [];
	const fencePattern = /^([`~]{3,})[^\r\n]*(?:\r?\n[\s\S]*?^\1[ \t]*$|[\s\S]*$)/gm;
	let match: RegExpExecArray | null;
	while ((match = fencePattern.exec(text)) !== null) {
		ranges.push({ start: match.index, end: match.index + match[0].length });
	}
	return ranges;
}

function collectInlineCodeRanges(text: string): MaskRange[] {
	const ranges: MaskRange[] = [];
	let index = 0;
	while (index < text.length) {
		const tickStart = text.indexOf('`', index);
		if (tickStart < 0) {
			break;
		}
		let tickEnd = tickStart + 1;
		while (tickEnd < text.length && text[tickEnd] === '`') {
			tickEnd++;
		}
		const tickCount = tickEnd - tickStart;
		if (tickCount >= 3) {
			index = tickEnd;
			continue;
		}
		const closing = findInlineCodeClose(text, tickEnd, tickCount);
		if (closing < 0) {
			index = tickEnd;
			continue;
		}
		ranges.push({ start: tickStart, end: closing + tickCount });
		index = closing + tickCount;
	}
	return ranges;
}

function findInlineCodeClose(text: string, start: number, tickCount: number): number {
	const needle = '`'.repeat(tickCount);
	let index = start;
	while (index < text.length) {
		const found = text.indexOf(needle, index);
		if (found < 0) {
			return -1;
		}
		if (text.slice(found, found + tickCount + 1) !== `${needle}\``) {
			return found;
		}
		index = found + tickCount + 1;
	}
	return -1;
}

function applyMaskRanges(text: string, ranges: MaskRange[]): string {
	const chars = text.split('');
	const sorted = ranges
		.filter((range) => range.end > range.start)
		.sort((left, right) => left.start - right.start || left.end - right.end);
	let maskedEnd = 0;
	for (const range of sorted) {
		const start = Math.max(range.start, maskedEnd);
		const end = Math.min(range.end, text.length);
		for (let index = start; index < end; index++) {
			if (chars[index] !== '\r' && chars[index] !== '\n') {
				chars[index] = ' ';
			}
		}
		maskedEnd = Math.max(maskedEnd, end);
	}
	return chars.join('');
}

interface ParsedAttributes {
	attributes: Record<string, string | true>;
	ranges: Record<string, { start: number; end: number }>;
	valueStyles: Record<string, GuideNhAttributeValueStyle>;
}

function parseAttributes(source: string, sourceOffset: number): ParsedAttributes {
	const attributes: Record<string, string | true> = {};
	const ranges: Record<string, { start: number; end: number }> = {};
	const valueStyles: Record<string, GuideNhAttributeValueStyle> = {};
	const pattern = /([A-Za-z_][\w.:-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|\{([^}]*)\}|([^\s"'=<>`]+)))?/g;
	let match: RegExpExecArray | null;
	while ((match = pattern.exec(source)) !== null) {
		const name = match[1];
		const value = match[2] ?? match[3] ?? match[4] ?? match[5];
		attributes[name] = value ?? true;
		valueStyles[name] = resolveAttributeValueStyle(match);
		const valueIndex = findAttributeValueIndex(match);
		const rangeStart = sourceOffset + match.index + valueIndex;
		ranges[name] = {
			start: rangeStart,
			end: rangeStart + (value ?? name).length
		};
	}
	return { attributes, ranges, valueStyles };
}

export function parseGuideNhDocument(text: string): GuideNhParsedDocument {
	const masked = maskIgnoredMarkdownRanges(text);
	const frontmatter = extractFrontmatter(masked);
	const tags: GuideNhParsedTag[] = [];
	let searchOffset = 0;
	while (searchOffset < masked.length) {
		const tagStart = masked.indexOf('<', searchOffset);
		if (tagStart < 0) {
			break;
		}
		const nameMatch = masked.slice(tagStart).match(/^<\/?([A-Za-z][A-Za-z0-9]*)/);
		if (!nameMatch) {
			searchOffset = tagStart + 1;
			continue;
		}
		const tagEnd = findTagEnd(masked, tagStart + nameMatch[0].length);
		if (tagEnd < 0) {
			// A malformed tag must not consume the rest of the document.
			searchOffset = tagStart + nameMatch[0].length;
			continue;
		}
		const sourceEnd = tagEnd + 1;
		const tagSource = masked.slice(tagStart, sourceEnd);
		const name = nameMatch[1];
		if (IgnoredHtmlTagNames.has(name.toLowerCase())) {
			searchOffset = sourceEnd;
			continue;
		}
		const closing = tagSource.startsWith('</');
		const selfClosing = /\/\s*>$/.test(tagSource);
		const attributeEnd = selfClosing ? tagSource.length - 2 : tagSource.length - 1;
		const attributesSource = closing ? '' : tagSource.slice(nameMatch[0].length, attributeEnd);
		const parsedAttributes = closing
			? { attributes: {}, ranges: {}, valueStyles: {} }
			: parseAttributes(attributesSource, tagStart + nameMatch[0].length);
		tags.push({
			name,
			source: text.slice(tagStart, sourceEnd),
			attributes: parsedAttributes.attributes,
			attributeRanges: parsedAttributes.ranges,
			attributeValueStyles: parsedAttributes.valueStyles,
			start: tagStart,
			end: sourceEnd,
			selfClosing: selfClosing || GuideNhVoidTagNames.has(name.toLowerCase()),
			closing
		});
		searchOffset = sourceEnd;
	}
	return { frontmatter, tags };
}

function findTagEnd(text: string, start: number): number {
	let quote: '"' | "'" | undefined;
	for (let index = start; index < text.length; index++) {
		const char = text[index];
		if (quote) {
			if (char === quote) {
				quote = undefined;
			} else if (char === '\n' || char === '\r') {
				return -1;
			}
			continue;
		}
		if (char === '"' || char === "'") {
			quote = char;
		} else if (char === '>') {
			return index;
		} else if (char === '<') {
			return -1;
		}
	}
	return -1;
}

function resolveAttributeValueStyle(match: RegExpExecArray): GuideNhAttributeValueStyle {
	if (match[2] !== undefined || match[3] !== undefined) {
		return 'string';
	}
	if (match[4] !== undefined) {
		return 'expression';
	}
	return 'bare';
}

function findAttributeValueIndex(match: RegExpExecArray): number {
	const assignmentIndex = match[0].indexOf('=');
	if (assignmentIndex < 0) {
		return 0;
	}
	let valueIndex = assignmentIndex + 1;
	while (valueIndex < match[0].length && /\s/.test(match[0][valueIndex])) {
		valueIndex++;
	}
	if (match[0][valueIndex] === '"' || match[0][valueIndex] === "'" || match[0][valueIndex] === '{') {
		return valueIndex + 1;
	}
	return valueIndex;
}
