import { GuideNhParsedDocument, GuideNhParsedTag, parseGuideNhDocument } from './documentParser';
import { extractFrontmatter, FrontmatterBlock } from './frontmatter';
import { resolveGuideNhPageReference, resolveGuideNhResourceReference } from '../index/guideNhPaths';

export interface GuideNhTagBoundary {
	tag: GuideNhParsedTag;
	start: number;
	end: number;
	nameStart: number;
	nameEnd: number;
}

export interface GuideNhAttributeContext {
	tag: GuideNhParsedTag;
	tagBoundary: GuideNhTagBoundary;
	name: string;
	nameStart: number;
	nameEnd: number;
	value?: string;
	valueStart?: number;
	valueEnd?: number;
	valueStyle?: string;
}

export interface GuideNhTagContext {
	tag: GuideNhParsedTag;
	boundary: GuideNhTagBoundary;
	attribute?: GuideNhAttributeContext;
}

export interface GuideNhOpenTagContext {
	start: number;
	end: number;
	name: string;
	nameStart: number;
	nameEnd: number;
	hasAttributeBoundary: boolean;
}

export interface GuideNhTextReference {
	kind: 'page' | 'resource';
	target: string;
	normalizedTarget?: string;
	anchor?: string;
	start: number;
	end: number;
	interactionStart?: number;
	interactionEnd?: number;
	source: 'markdown' | 'frontmatter' | 'attribute';
	attributeName?: string;
	tagName?: string;
}

export interface GuideNhDocumentModel {
	uri?: string;
	text: string;
	parsed: GuideNhParsedDocument;
	frontmatter?: FrontmatterBlock;
	tagBoundaries: GuideNhTagBoundary[];
	references: GuideNhTextReference[];
}

const GuideNhTagStartPattern = /<\/?([A-Za-z][A-Za-z0-9]*)/;
const GuideNhOpenTagPattern = /<([A-Za-z][A-Za-z0-9]*)?\s*[^<>/]*$/;
const GuideNhAttributePattern = /([A-Za-z_][\w.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|\{([^}]*)\}|([^\s"'=<>`]+)))?/g;

export function createGuideNhDocumentModel(text: string, uri?: string): GuideNhDocumentModel {
	const parsed = parseGuideNhDocument(text);
	const tagBoundaries = parsed.tags.map((tag) => createTagBoundary(text, tag));
	return {
		uri,
		text,
		parsed,
		frontmatter: extractFrontmatter(text),
		tagBoundaries,
		references: findDocumentReferences(text, parsed.tags, uri)
	};
}

export function findTagContextAtOffset(model: GuideNhDocumentModel, offset: number): GuideNhTagContext | undefined {
	for (const boundary of model.tagBoundaries) {
		if (offset < boundary.start || offset > boundary.end) {
			continue;
		}
		return {
			tag: boundary.tag,
			boundary,
			attribute: findAttributeContext(boundary, offset)
		};
	}
	return undefined;
}

export function findReferenceAtOffset(model: GuideNhDocumentModel, offset: number, kinds?: Array<'page' | 'resource'>): GuideNhTextReference | undefined {
	return model.references.find((reference) => {
		const interactionStart = reference.interactionStart ?? reference.start;
		const interactionEnd = reference.interactionEnd ?? reference.end;
		if (offset < interactionStart || offset > interactionEnd) {
			return false;
		}
		return !kinds || kinds.includes(reference.kind);
	});
}

export function findOpenTagContext(text: string, offset: number): GuideNhOpenTagContext | undefined {
	const before = text.slice(0, offset);
	const openTagStart = before.lastIndexOf('<');
	if (openTagStart < 0) {
		return undefined;
	}
	const openTagText = before.slice(openTagStart);
	const match = openTagText.match(GuideNhOpenTagPattern);
	if (!match) {
		return undefined;
	}
	const name = match[1] ?? '';
	const nameStart = openTagStart + 1;
	return {
		start: openTagStart,
		end: offset,
		name,
		nameStart,
		nameEnd: nameStart + name.length,
		hasAttributeBoundary: /^[<][A-Za-z][A-Za-z0-9]*\s/.test(match[0])
	};
}

export function findOpenTagAttributeValue(text: string, offset: number, attributeName: string): string | undefined {
	const openTagSource = findOpenTagSource(text, offset);
	if (!openTagSource) {
		return undefined;
	}
	const attributePattern = new RegExp(`${escapeRegExp(attributeName)}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`);
	const match = openTagSource.match(attributePattern);
	return match ? match[1] ?? match[2] : undefined;
}

export function findOpenTagSource(text: string, offset: number): string | undefined {
	const start = text.lastIndexOf('<', offset);
	if (start < 0) {
		return undefined;
	}
	const beforeStart = text.slice(start, offset);
	if (!/^<[A-Za-z][A-Za-z0-9]*[\s\S]*$/.test(beforeStart)) {
		return undefined;
	}
	const endIndex = text.indexOf('>', offset);
	const end = endIndex >= 0 ? endIndex : text.length;
	const source = text.slice(start, end);
	return /<([A-Za-z][A-Za-z0-9]*)\b/.test(source) ? source : undefined;
}

function createTagBoundary(text: string, tag: GuideNhParsedTag): GuideNhTagBoundary {
	const source = tag.source;
	const match = source.match(GuideNhTagStartPattern);
	const nameStart = tag.start + (match ? match.index ?? 0 : 1) + (source.startsWith('</') ? 2 : 1);
	return {
		tag,
		start: tag.start,
		end: tag.end,
		nameStart,
		nameEnd: nameStart + tag.name.length
	};
}

function findAttributeContext(boundary: GuideNhTagBoundary, offset: number): GuideNhAttributeContext | undefined {
	if (boundary.tag.closing) {
		return undefined;
	}
	const tagMarkup = boundary.tag.source;
	const sourceOffset = boundary.nameEnd - boundary.start;
	const attributeMarkup = tagMarkup.slice(sourceOffset);
	const tagStart = boundary.start;
	GuideNhAttributePattern.lastIndex = 0;
	let match: RegExpExecArray | null;
	while ((match = GuideNhAttributePattern.exec(attributeMarkup)) !== null) {
		const name = match[1];
		const nameStart = tagStart + sourceOffset + match.index;
		const nameEnd = nameStart + name.length;
		const value = match[2] ?? match[3] ?? match[4] ?? match[5];
		const valueStart = value === undefined ? undefined : nameStart + findAttributeValueIndex(match);
		const valueEnd = valueStart === undefined ? undefined : valueStart + value.length;
		const insideName = offset >= nameStart && offset <= nameEnd;
		const insideValue = valueStart !== undefined && valueEnd !== undefined && offset >= valueStart && offset <= valueEnd;
		if (!insideName && !insideValue) {
			continue;
		}
		return {
			tag: boundary.tag,
			tagBoundary: boundary,
			name,
			nameStart,
			nameEnd,
			value,
			valueStart,
			valueEnd,
			valueStyle: boundary.tag.attributeValueStyles[name]
		};
	}
	for (const [name, range] of Object.entries(boundary.tag.attributeRanges)) {
		if (offset >= range.start && offset <= range.end) {
			return {
				tag: boundary.tag,
				tagBoundary: boundary,
				name,
				nameStart: range.start,
				nameEnd: range.start + name.length,
				value: typeof boundary.tag.attributes[name] === 'string' ? String(boundary.tag.attributes[name]) : undefined,
				valueStart: range.start,
				valueEnd: range.end,
				valueStyle: boundary.tag.attributeValueStyles[name]
			};
		}
	}
	return undefined;
}

function findDocumentReferences(text: string, tags: GuideNhParsedTag[], documentUri?: string): GuideNhTextReference[] {
	return [
		...findMarkdownReferences(text, documentUri),
		...findFrontmatterPageReferences(text, documentUri),
		...findAttributeReferences(text, tags, documentUri)
	];
}

function findMarkdownReferences(text: string, documentUri?: string): GuideNhTextReference[] {
	const references: GuideNhTextReference[] = [];
	const pattern = /!?\[[^\]\r\n]*\]\(\s*([^()\s]+)\s*\)/g;
	let match: RegExpExecArray | null;
	while ((match = pattern.exec(text)) !== null) {
		const rawTarget = match[1];
		const target = unwrapLegacyMarkdownDestination(rawTarget);
		const kind = target.replace(/#.*/, '').endsWith('.md')
			? 'page'
			: looksLikeMarkdownResource(target) ? 'resource' : undefined;
		if (!kind) {
			continue;
		}
		const normalizedTarget = kind === 'page'
			? normalizePageReference(rawTarget, documentUri)
			: normalizeResourceReference(rawTarget, documentUri);
		if (!normalizedTarget) {
			continue;
		}
		const start = match.index + match[0].indexOf(rawTarget);
		references.push({
			kind,
			target,
			normalizedTarget,
			anchor: kind === 'page' ? extractReferenceAnchor(target) : undefined,
			start,
			end: start + rawTarget.length,
			interactionStart: match.index,
			interactionEnd: match.index + match[0].length,
			source: 'markdown'
		});
	}
	return references;
}

function unwrapLegacyMarkdownDestination(value: string): string {
	const trimmed = value.trim();
	return trimmed.startsWith('*') && trimmed.endsWith('*') && trimmed.length > 2
		? trimmed.slice(1, -1).trim()
		: trimmed;
}

function looksLikeMarkdownResource(value: string): boolean {
	return /\.(?:snbt|json|png|jpe?g|gif|webp|svg)(?:#.*)?$/i.test(value);
}

function findFrontmatterPageReferences(text: string, documentUri?: string): GuideNhTextReference[] {
	return findReferencesWithPattern(text, /^\s{2,}parent:\s*([^\s#]+\.md(?:#[^\s]+)?)/gm, 'page', 'frontmatter', documentUri);
}

function findAttributeReferences(text: string, tags: GuideNhParsedTag[], documentUri?: string): GuideNhTextReference[] {
	const references: GuideNhTextReference[] = [];
	for (const tag of tags) {
		if (tag.closing) {
			continue;
		}
		for (const [attributeName, rawValue] of Object.entries(tag.attributes)) {
			if (typeof rawValue !== 'string') {
				continue;
			}
			const range = tag.attributeRanges[attributeName];
			if (!range) {
				continue;
			}
			if (attributeName === 'linksTo' || looksLikePageReference(rawValue)) {
				references.push({
					kind: 'page',
					target: rawValue,
					normalizedTarget: normalizePageReference(rawValue, documentUri),
					anchor: extractReferenceAnchor(rawValue),
					start: range.start,
					end: range.end,
					source: 'attribute',
					attributeName,
					tagName: tag.name
				});
				continue;
			}
			if (looksLikeResourceReference(attributeName, rawValue)) {
				references.push({
					kind: 'resource',
					target: rawValue,
					normalizedTarget: normalizeResourceReference(rawValue, documentUri),
					start: range.start,
					end: range.end,
					source: 'attribute',
					attributeName,
					tagName: tag.name
				});
			}
		}
	}
	return references;
}

function extractReferenceAnchor(value: string): string | undefined {
	const hash = value.indexOf('#');
	if (hash < 0) {
		return undefined;
	}
	const anchor = value.slice(hash + 1).trim();
	return anchor.length > 0 ? decodeURIComponent(anchor) : undefined;
}

function findReferencesWithPattern(
	text: string,
	pattern: RegExp,
	kind: 'page' | 'resource',
	source: GuideNhTextReference['source'],
	documentUri?: string
): GuideNhTextReference[] {
	const references: GuideNhTextReference[] = [];
	let match: RegExpExecArray | null;
	while ((match = pattern.exec(text)) !== null) {
		const rawTarget = match.slice(1).find((value) => value !== undefined);
		if (!rawTarget) {
			continue;
		}
		const normalizedTarget = kind === 'page'
			? normalizePageReference(rawTarget, documentUri)
			: normalizeResourceReference(rawTarget, documentUri);
		if (!normalizedTarget) {
			continue;
		}
		const start = match.index + match[0].indexOf(rawTarget);
		references.push({
			kind,
			target: rawTarget,
			normalizedTarget,
			anchor: kind === 'page' ? extractReferenceAnchor(rawTarget) : undefined,
			start,
			end: start + rawTarget.length,
			interactionStart: source === 'markdown' ? match.index : start,
			interactionEnd: source === 'markdown' ? match.index + match[0].length : start + rawTarget.length,
			source
		});
	}
	return references;
}

export function normalizePageReference(value: string | undefined, documentUri?: string): string | undefined {
	return resolveGuideNhPageReference(value, documentUri);
}

export function normalizeResourceReference(value: string | undefined, documentUri?: string): string | undefined {
	return resolveGuideNhResourceReference(value, documentUri);
}

function looksLikePageReference(value: string): boolean {
	return normalizePageReference(value) !== undefined;
}

function looksLikeResourceReference(attributeName: string, value: string): boolean {
	if (!['src', 'iconImage'].includes(attributeName)) {
		return false;
	}
	return normalizeResourceReference(value) !== undefined;
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

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
