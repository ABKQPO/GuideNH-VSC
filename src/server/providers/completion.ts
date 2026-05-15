import { CompletionItem, CompletionItemKind, InsertTextFormat } from 'vscode-languageserver/node';
import { GuideNhAttributeSchema, GuideNhFrontmatterKey, GuideNhSchemaBundle, GuideNhTagSchema } from '../../common/schema';
import { extractFrontmatter, FrontmatterBlock } from '../parser/frontmatter';
import { SemanticCache } from '../runtime/semanticCache';

export const GuideNhCompletionTriggerCharacters = ['<', ' ', '"', '\'', '`', '=', '+', ':', '^'];

function findOpenTagPrefix(text: string, offset: number): string | undefined {
	const before = text.slice(0, offset);
	const match = before.match(/<([A-Z][A-Za-z0-9]*)?\s*[^<>]*$/);
	return match?.[1] ?? '';
}

interface AttributeValueContext {
	tagName: string;
	attributeName: string;
	prefix: string;
}

export function createGuideNhCompletions(
	text: string,
	offset: number,
	schema: GuideNhSchemaBundle,
	parentTag: string | undefined,
	cache?: SemanticCache
): CompletionItem[] {
	const frontmatter = extractFrontmatter(text);
	if (frontmatter && offset <= frontmatter.end) {
		return createFrontmatterCompletions(text, offset, frontmatter, schema);
	}

	const fencedBlockCompletions = createFencedBlockCompletions(text, offset, schema);
	if (fencedBlockCompletions.length > 0) {
		return fencedBlockCompletions;
	}

	const inlineMarkerCompletions = createInlineMarkerCompletions(text, offset, schema);
	if (inlineMarkerCompletions.length > 0) {
		return inlineMarkerCompletions;
	}

	const attributeValueContext = findAttributeValueContext(text, offset);
	if (attributeValueContext) {
		const staticCompletions = createAttributeValueCompletions(attributeValueContext, schema);
		if (staticCompletions.length > 0) {
			return staticCompletions;
		}
	}
	if (attributeValueContext && cache) {
		const capability = resolveRuntimeCapability(attributeValueContext.attributeName);
		if (capability) {
			return cache.queryPrefix(capability, attributeValueContext.prefix).map((entry) => ({
				label: entry.id,
				kind: CompletionItemKind.Value,
				detail: entry.label,
				documentation: entry.detail
			}));
		}
	}

	const openTag = findOpenTagPrefix(text, offset);
	if (openTag === undefined) {
		return [];
	}
	if (openTag.length === 0) {
		const resolvedParentTag = parentTag ?? inferOpenParentTag(text, offset);
		const allowed = resolvedParentTag ? schema.tags.tags[resolvedParentTag]?.children : undefined;
		return [
			...createTagNameCompletions(schema, allowed),
			...createSnippetCompletions(schema, allowed)
		];
	}
	const tagSchema = schema.tags.tags[openTag];
	if (!tagSchema) {
		return [];
	}
	return Object.entries(tagSchema.attributes).map(([name, attribute]) => ({
		label: name,
		kind: CompletionItemKind.Property,
		detail: attribute.type,
		documentation: attribute.description
	}));
}

function findAttributeValueContext(text: string, offset: number): AttributeValueContext | undefined {
	const before = text.slice(0, offset);
	const openTagMatch = before.match(/<([A-Z][A-Za-z0-9]*)\s*[^<>]*$/);
	if (!openTagMatch) {
		return undefined;
	}
	const attributeMatch = openTagMatch[0].match(/([A-Za-z_][\w.-]*)\s*=\s*(?:"([^"]*)|'([^']*)|\{([^}]*)|([^\s"'=<>`]*))$/);
	if (!attributeMatch) {
		return undefined;
	}
	return {
		tagName: openTagMatch[1],
		attributeName: attributeMatch[1],
		prefix: attributeMatch[2] ?? attributeMatch[3] ?? attributeMatch[4] ?? attributeMatch[5] ?? ''
	};
}

function createAttributeValueCompletions(context: AttributeValueContext, schema: GuideNhSchemaBundle): CompletionItem[] {
	const attribute = schema.tags.tags[context.tagName]?.attributes[context.attributeName];
	if (!attribute) {
		return [];
	}
	return resolveStaticAttributeValues(attribute)
		.filter((value) => value.startsWith(context.prefix))
		.map((value) => ({
			label: value,
			kind: CompletionItemKind.Value,
			detail: `${context.tagName}.${context.attributeName}`,
			documentation: attribute.description
		}));
}

function resolveStaticAttributeValues(attribute: GuideNhAttributeSchema): string[] {
	if (attribute.type === 'boolean') {
		return ['true', 'false'];
	}
	if (attribute.type === 'enum') {
		return attribute.values ?? [];
	}
	return [];
}

function createTagNameCompletions(schema: GuideNhSchemaBundle, allowed: string[] | undefined): CompletionItem[] {
	return Object.values(schema.tags.tags)
		.filter((tag) => isTagAllowed(tag, allowed))
		.map((tag) => ({
			label: tag.name,
			kind: CompletionItemKind.Class,
			detail: tag.kind,
			documentation: tag.description
		}));
}

function createSnippetCompletions(schema: GuideNhSchemaBundle, allowed: string[] | undefined): CompletionItem[] {
	return Object.values(schema.snippets.snippets)
		.filter((snippet) => allowed === undefined || allowed.includes(snippet.prefix))
		.map((snippet) => ({
			label: snippet.prefix,
			kind: CompletionItemKind.Snippet,
			detail: 'GuideNH snippet',
			documentation: snippet.description,
			insertText: snippet.body.join('\n'),
			insertTextFormat: InsertTextFormat.Snippet
		}));
}

function isTagAllowed(tag: GuideNhTagSchema, allowed: string[] | undefined): boolean {
	return allowed === undefined || allowed.includes(tag.name);
}

function inferOpenParentTag(text: string, offset: number): string | undefined {
	const stack: string[] = [];
	const before = text.slice(0, offset);
	const tagPattern = /<\/?([A-Z][A-Za-z0-9]*)(?:\s[^<>]*?)?(\/?)>/g;
	let match: RegExpExecArray | null;
	while ((match = tagPattern.exec(before)) !== null) {
		const source = match[0];
		const tagName = match[1];
		if (source.startsWith('</')) {
			popTag(stack, tagName);
		} else if (match[2] !== '/') {
			stack.push(tagName);
		}
	}
	return stack[stack.length - 1];
}

function popTag(stack: string[], tagName: string): void {
	for (let index = stack.length - 1; index >= 0; index--) {
		if (stack[index] === tagName) {
			stack.splice(index);
			return;
		}
	}
}

function createFrontmatterCompletions(
	text: string,
	offset: number,
	frontmatter: FrontmatterBlock,
	schema: GuideNhSchemaBundle
): CompletionItem[] {
	const before = text.slice(frontmatter.start, offset);
	const line = getCurrentLine(before);
	if (isFrontmatterBoundaryLine(line)) {
		return [];
	}
	const keys = resolveFrontmatterKeys(before, schema);
	return Object.entries(keys).map(([name, key]) => createFrontmatterKeyCompletion(name, key));
}

function createFrontmatterKeyCompletion(name: string, key: GuideNhFrontmatterKey): CompletionItem {
	return {
		label: name,
		kind: CompletionItemKind.Property,
		detail: key.type,
		documentation: key.description
	};
}

function resolveFrontmatterKeys(before: string, schema: GuideNhSchemaBundle): Record<string, GuideNhFrontmatterKey> {
	const currentIndent = getLineIndent(getCurrentLine(before));
	const parentPath = findFrontmatterParentPath(before, currentIndent);
	let keys = schema.frontmatter.keys;
	for (const parent of parentPath) {
		keys = keys[parent]?.children ?? {};
	}
	return keys;
}

function findFrontmatterParentPath(before: string, currentIndent: number): string[] {
	const parentByIndent = new Map<number, string>();
	for (const line of before.split(/\r?\n/).slice(1, -1)) {
		const match = line.match(/^(\s*)([A-Za-z_][\w.-]*)\s*:\s*$/);
		if (!match) {
			continue;
		}
		const indent = match[1].length;
		for (const knownIndent of Array.from(parentByIndent.keys())) {
			if (knownIndent >= indent) {
				parentByIndent.delete(knownIndent);
			}
		}
		parentByIndent.set(indent, match[2]);
	}
	return Array.from(parentByIndent.entries())
		.filter(([indent]) => indent < currentIndent)
		.sort(([left], [right]) => left - right)
		.map(([, key]) => key);
}

function getCurrentLine(value: string): string {
	const lineStart = Math.max(value.lastIndexOf('\n'), value.lastIndexOf('\r')) + 1;
	return value.slice(lineStart);
}

function getLineIndent(line: string): number {
	return line.match(/^\s*/)?.[0].length ?? 0;
}

function isFrontmatterBoundaryLine(line: string): boolean {
	return line.trim() === '---';
}

function createFencedBlockCompletions(text: string, offset: number, schema: GuideNhSchemaBundle): CompletionItem[] {
	const line = getCurrentLine(text.slice(0, offset));
	if (!/^```\w*$/.test(line)) {
		return [];
	}
	return Object.entries(schema.markdownExtensions.fencedCodeBlocks).map(([name, block]) => ({
		label: name,
		kind: CompletionItemKind.Value,
		detail: 'GuideNH fenced block',
		documentation: block.description
	}));
}

function createInlineMarkerCompletions(text: string, offset: number, schema: GuideNhSchemaBundle): CompletionItem[] {
	const line = getCurrentLine(text.slice(0, offset));
	const markerPrefix = line.match(/(?:^|\s)([=+:^]{1,2})$/)?.[1];
	if (!markerPrefix) {
		return [];
	}
	return Object.entries(schema.markdownExtensions.inlineMarkers)
		.filter(([, marker]) => marker.open.startsWith(markerPrefix))
		.map(([name, marker]) => ({
			label: name,
			kind: CompletionItemKind.Snippet,
			detail: marker.open,
			documentation: marker.description,
			insertText: `${marker.open}\${1:text}${marker.close}`,
			insertTextFormat: InsertTextFormat.Snippet
		}));
}

function resolveRuntimeCapability(attributeName: string): string | undefined {
	if (attributeName === 'id') {
		return 'items';
	}
	if (attributeName === 'ore') {
		return 'ores';
	}
	return undefined;
}
