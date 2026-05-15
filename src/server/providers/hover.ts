import { Hover, MarkupKind } from 'vscode-languageserver/node';
import { GuideNhFrontmatterKey, GuideNhSchemaBundle } from '../../common/schema';
import { extractFrontmatter } from '../parser/frontmatter';

interface TagContext {
	source: string;
	start: number;
	tagName: string;
}

interface FrontmatterKeyContext {
	path: string[];
	key: GuideNhFrontmatterKey;
}

export function createGuideNhHover(text: string, offset: number, schema: GuideNhSchemaBundle): Hover | undefined {
	const frontmatterHover = createFrontmatterHover(text, offset, schema);
	if (frontmatterHover) {
		return frontmatterHover;
	}
	const tagContext = findTagContext(text, offset);
	if (!tagContext) {
		return undefined;
	}
	const attributeHover = createAttributeHover(tagContext, offset, schema);
	if (attributeHover) {
		return attributeHover;
	}
	return createTagHover(tagContext, schema);
}

function createTagHover(context: TagContext, schema: GuideNhSchemaBundle): Hover | undefined {
	const tagSchema = schema.tags.tags[context.tagName];
	if (!tagSchema) {
		return undefined;
	}
	return createMarkdownHover(`**${tagSchema.name}**\n\n${tagSchema.description}`);
}

function createAttributeHover(context: TagContext, offset: number, schema: GuideNhSchemaBundle): Hover | undefined {
	const attributeName = findAttributeNameAtOffset(context, offset);
	if (!attributeName) {
		return undefined;
	}
	const attribute = schema.tags.tags[context.tagName]?.attributes[attributeName];
	if (!attribute) {
		return undefined;
	}
	return createMarkdownHover(`**${context.tagName}.${attributeName}**\n\n${attribute.type}\n\n${attribute.description ?? ''}`.trim());
}

function findTagContext(text: string, offset: number): TagContext | undefined {
	const before = text.slice(0, offset);
	const after = text.slice(offset);
	const start = before.lastIndexOf('<');
	const end = after.indexOf('>');
	if (start < 0 || end < 0) {
		return undefined;
	}
	const source = text.slice(start, offset + end + 1);
	const tagMatch = source.match(/^<([A-Z][A-Za-z0-9]*)/);
	if (!tagMatch) {
		return undefined;
	}
	return {
		source,
		start,
		tagName: tagMatch[1]
	};
}

function findAttributeNameAtOffset(context: TagContext, offset: number): string | undefined {
	const sourceOffset = offset - context.start;
	const pattern = /\s([A-Za-z_][\w.-]*)(?=\s*=|\s|\/?>)/g;
	let match: RegExpExecArray | null;
	while ((match = pattern.exec(context.source)) !== null) {
		const start = match.index + 1;
		const end = start + match[1].length;
		if (sourceOffset >= start && sourceOffset <= end) {
			return match[1];
		}
	}
	return undefined;
}

function createFrontmatterHover(text: string, offset: number, schema: GuideNhSchemaBundle): Hover | undefined {
	const frontmatter = extractFrontmatter(text);
	if (!frontmatter || offset > frontmatter.end) {
		return undefined;
	}
	const context = findFrontmatterKeyContext(frontmatter.text, offset, schema);
	if (!context) {
		return undefined;
	}
	return createMarkdownHover(`**${context.path.join('.')}**\n\n${context.key.type}\n\n${context.key.description}`);
}

function findFrontmatterKeyContext(frontmatter: string, offset: number, schema: GuideNhSchemaBundle): FrontmatterKeyContext | undefined {
	const parentByIndent = new Map<number, string>();
	let lineStart = 0;
	for (const line of frontmatter.split(/\r?\n/)) {
		const match = line.match(/^(\s*)([A-Za-z_][\w.-]*)\s*:/);
		if (match) {
			const indent = match[1].length;
			for (const knownIndent of Array.from(parentByIndent.keys())) {
				if (knownIndent >= indent) {
					parentByIndent.delete(knownIndent);
				}
			}
			const keyStart = lineStart + indent;
			const keyEnd = keyStart + match[2].length;
			const path = [
				...Array.from(parentByIndent.entries())
					.filter(([parentIndent]) => parentIndent < indent)
					.sort(([left], [right]) => left - right)
					.map(([, parent]) => parent),
				match[2]
			];
			if (offset >= keyStart && offset <= keyEnd) {
				const key = resolveFrontmatterKey(schema.frontmatter.keys, path);
				return key ? { path, key } : undefined;
			}
			parentByIndent.set(indent, match[2]);
		}
		lineStart += line.length + 1;
	}
	return undefined;
}

function resolveFrontmatterKey(keys: Record<string, GuideNhFrontmatterKey>, path: string[]): GuideNhFrontmatterKey | undefined {
	let currentKeys = keys;
	let currentKey: GuideNhFrontmatterKey | undefined;
	for (const segment of path) {
		currentKey = currentKeys[segment];
		if (!currentKey) {
			return undefined;
		}
		currentKeys = currentKey.children ?? {};
	}
	return currentKey;
}

function createMarkdownHover(value: string): Hover {
	return {
		contents: {
			kind: MarkupKind.Markdown,
			value
		}
	};
}
