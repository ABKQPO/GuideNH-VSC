import { extractFrontmatter, FrontmatterBlock } from './frontmatter';

export interface GuideNhParsedTag {
	name: string;
	attributes: Record<string, string | true>;
	attributeRanges: Record<string, { start: number; end: number }>;
	start: number;
	end: number;
	selfClosing: boolean;
	closing: boolean;
}

export interface GuideNhParsedDocument {
	frontmatter?: FrontmatterBlock;
	tags: GuideNhParsedTag[];
}

function maskMdxComments(text: string): string {
	return text.replace(/\{\/\*[\s\S]*?\*\/\}/g, (value) => ' '.repeat(value.length));
}

interface ParsedAttributes {
	attributes: Record<string, string | true>;
	ranges: Record<string, { start: number; end: number }>;
}

function parseAttributes(source: string, sourceOffset: number): ParsedAttributes {
	const attributes: Record<string, string | true> = {};
	const ranges: Record<string, { start: number; end: number }> = {};
	const pattern = /([A-Za-z_][\w.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|\{([^}]*)\}|([^\s"'=<>`]+)))?/g;
	let match: RegExpExecArray | null;
	while ((match = pattern.exec(source)) !== null) {
		const name = match[1];
		const value = match[2] ?? match[3] ?? match[4] ?? match[5];
		attributes[name] = value ?? true;
		const valueIndex = findAttributeValueIndex(match);
		const rangeStart = sourceOffset + match.index + valueIndex;
		ranges[name] = {
			start: rangeStart,
			end: rangeStart + (value ?? name).length
		};
	}
	return { attributes, ranges };
}

export function parseGuideNhDocument(text: string): GuideNhParsedDocument {
	const masked = maskMdxComments(text);
	const frontmatter = extractFrontmatter(masked);
	const tags: GuideNhParsedTag[] = [];
	const tagPattern = /<\/?([A-Z][A-Za-z0-9]*)(\s[^<>]*?)?(\/?)>/g;
	let match: RegExpExecArray | null;
	while ((match = tagPattern.exec(masked)) !== null) {
		const closing = match[0].startsWith('</');
		const parsedAttributes = closing ? { attributes: {}, ranges: {} } : parseAttributes(match[2] ?? '', match.index + match[0].indexOf(match[2] ?? ''));
		tags.push({
			name: match[1],
			attributes: parsedAttributes.attributes,
			attributeRanges: parsedAttributes.ranges,
			start: match.index,
			end: match.index + match[0].length,
			selfClosing: match[3] === '/',
			closing
		});
	}
	return { frontmatter, tags };
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
