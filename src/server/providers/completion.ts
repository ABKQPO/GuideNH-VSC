import { CompletionItem, CompletionItemKind, InsertTextFormat, Position, TextEdit } from 'vscode-languageserver/node';
import { GuideNhAttributeSchema, GuideNhFrontmatterKey, GuideNhSchemaBundle, GuideNhTagSchema } from '../../common/schema';
import { GuideNhWorkspaceIndex } from '../index/workspaceIndex';
import { maskIgnoredMarkdownRanges } from '../parser/documentParser';
import { extractFrontmatter, FrontmatterBlock } from '../parser/frontmatter';
import { SemanticCache } from '../runtime/semanticCache';

export const GuideNhCompletionTriggerCharacters = ['<', ' ', '"', '\'', '`', '=', '+', ':', '^'];

interface OpenTagContext {
	name: string;
	hasAttributeBoundary: boolean;
}

function findOpenTagContext(text: string, offset: number): OpenTagContext | undefined {
	const before = text.slice(0, offset);
	const match = before.match(/<([A-Z][A-Za-z0-9]*)?\s*[^<>/]*$/);
	if (!match) {
		return undefined;
	}
	return {
		name: match[1] ?? '',
		hasAttributeBoundary: /^<[A-Z][A-Za-z0-9]*\s/.test(match[0])
	};
}

interface AttributeValueContext {
	tagName: string;
	attributeName: string;
	prefix: string;
}

interface FrontmatterValueContext {
	path: string[];
	prefix: string;
}

interface FrontmatterValueSource {
	path: string;
	capability?: string;
	indexDetail?: string;
}

interface RuntimeAttributeSource {
	tagName?: string;
	attributeName: string;
	capability: string;
}

const FrontmatterValueSources: FrontmatterValueSource[] = [
	{ path: 'item_ids', capability: 'items', indexDetail: 'Indexed item id' },
	{ path: 'ore_ids', capability: 'ores', indexDetail: 'Indexed ore id' },
	{ path: 'categories', capability: 'categories', indexDetail: 'Indexed category' },
	{ path: 'navigation.required_mods', capability: 'mods', indexDetail: 'Indexed required mod' }
];

const RuntimeAttributeSources: RuntimeAttributeSource[] = [
	{ tagName: 'ItemLink', attributeName: 'id', capability: 'items' },
	{ tagName: 'ItemLink', attributeName: 'ore', capability: 'ores' },
	{ tagName: 'ItemImage', attributeName: 'id', capability: 'items' },
	{ tagName: 'ItemImage', attributeName: 'ore', capability: 'ores' },
	{ tagName: 'BlockImage', attributeName: 'id', capability: 'items' },
	{ tagName: 'BlockImage', attributeName: 'ore', capability: 'ores' },
	{ tagName: 'Block', attributeName: 'id', capability: 'items' },
	{ tagName: 'Block', attributeName: 'ore', capability: 'ores' },
	{ tagName: 'PlaceBlock', attributeName: 'id', capability: 'items' },
	{ tagName: 'RemoveBlocks', attributeName: 'id', capability: 'items' },
	{ tagName: 'ReplaceBlock', attributeName: 'from', capability: 'items' },
	{ tagName: 'ReplaceBlock', attributeName: 'to', capability: 'items' },
	{ tagName: 'Recipe', attributeName: 'id', capability: 'recipes' },
	{ tagName: 'RecipeFor', attributeName: 'id', capability: 'recipes' },
	{ tagName: 'RecipeUsage', attributeName: 'id', capability: 'recipes' },
	{ tagName: 'RecipesFor', attributeName: 'id', capability: 'recipes' },
	{ tagName: 'QuestCard', attributeName: 'id', capability: 'quests' },
	{ tagName: 'QuestLink', attributeName: 'id', capability: 'quests' },
	{ tagName: 'KeyBind', attributeName: 'id', capability: 'keybinds' },
	{ tagName: 'KeyBind', attributeName: 'action', capability: 'keybinds' },
	{ tagName: 'CommandLink', attributeName: 'command', capability: 'commands' },
	{ tagName: 'PlaySound', attributeName: 'sound', capability: 'sounds' },
	{ tagName: 'SoundLink', attributeName: 'sound', capability: 'sounds' },
	{ tagName: 'SubPages', attributeName: 'id', capability: 'pages' }
];

const RuntimeAttributeSourceByKey = new Map<string, RuntimeAttributeSource>(
	RuntimeAttributeSources.map((source) => [createRuntimeAttributeSourceKey(source.tagName, source.attributeName), source])
);

export function createGuideNhCompletions(
	text: string,
	offset: number,
	schema: GuideNhSchemaBundle,
	parentTag: string | undefined,
	cache?: SemanticCache,
	index?: GuideNhWorkspaceIndex
): CompletionItem[] {
	const maskedText = maskIgnoredMarkdownRanges(text);
	const frontmatter = extractFrontmatter(text);
	if (frontmatter && offset <= frontmatter.end) {
		const pageCompletions = createFrontmatterPageValueCompletions(text, offset, frontmatter, index, cache);
		if (pageCompletions.length > 0) {
			return pageCompletions;
		}
		const valueCompletions = createFrontmatterValueCompletions(text, offset, frontmatter, cache, index);
		return valueCompletions.length > 0 ? valueCompletions : createFrontmatterCompletions(text, offset, frontmatter, schema);
	}

	const fencedBlockCompletions = createFencedBlockCompletions(text, offset, schema);
	if (fencedBlockCompletions.length > 0) {
		return fencedBlockCompletions;
	}

	const inlineMarkerCompletions = createInlineMarkerCompletions(text, offset, schema);
	if (inlineMarkerCompletions.length > 0) {
		return inlineMarkerCompletions;
	}

	const attributeValueContext = findAttributeValueContext(maskedText, offset);
	if (attributeValueContext) {
		const pageCompletions = createAttributePageValueCompletions(attributeValueContext, schema, index, cache);
		if (pageCompletions.length > 0) {
			return pageCompletions;
		}
		const staticCompletions = createAttributeValueCompletions(attributeValueContext, schema);
		if (staticCompletions.length > 0) {
			return staticCompletions;
		}
	}
	if (attributeValueContext && cache) {
		const runtimeCompletions = createRuntimeAttributeValueCompletions(attributeValueContext, cache, index);
		if (runtimeCompletions.length > 0) {
			return runtimeCompletions;
		}
	}
	if (attributeValueContext) {
		return [];
	}

	const openTag = findOpenTagContext(maskedText, offset);
	if (!openTag) {
		return createPlainTagCompletions(maskedText, text, offset, schema, parentTag);
	}
	if (openTag.name.length === 0) {
		const resolvedParentTag = parentTag ?? inferOpenParentTag(maskedText, offset);
		const allowed = resolvedParentTag ? schema.tags.tags[resolvedParentTag]?.children : undefined;
		const completions = [
			...createTagNameSnippetCompletions(schema, allowed),
			...createSnippetCompletions(schema, allowed)
		];
		return withReplacementRange(completions, text, offset - 1, offset);
	}
	const tagSchema = schema.tags.tags[openTag.name];
	if (!tagSchema || !openTag.hasAttributeBoundary) {
		const resolvedParentTag = parentTag ?? inferOpenParentTag(maskedText, offset);
		const allowed = resolvedParentTag ? schema.tags.tags[resolvedParentTag]?.children : undefined;
		const completions = [
			...createTagNameSnippetCompletions(schema, allowed).filter((item) => item.label.startsWith(openTag.name)),
			...createSnippetCompletions(schema, allowed).filter((item) => item.label.startsWith(openTag.name))
		];
		return withReplacementRange(completions, text, offset - openTag.name.length - 1, offset);
	}
	return Object.entries(tagSchema.attributes).map(([name, attribute]) => ({
		label: name,
		kind: CompletionItemKind.Property,
		detail: attribute.type,
		documentation: attribute.description,
		insertText: createAttributeSnippet(name, attribute),
		insertTextFormat: InsertTextFormat.Snippet
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

function createAttributePageValueCompletions(
	context: AttributeValueContext,
	schema: GuideNhSchemaBundle,
	index: GuideNhWorkspaceIndex | undefined,
	cache: SemanticCache | undefined
): CompletionItem[] {
	const attribute = schema.tags.tags[context.tagName]?.attributes[context.attributeName];
	if (attribute?.type !== 'page') {
		return [];
	}
	return mergeCompletionItems([
		...createPageValueCompletions(context.prefix, index),
		...createRuntimeValueCompletions('pages', context.prefix, cache)
	]);
}

function createRuntimeAttributeValueCompletions(
	context: AttributeValueContext,
	cache: SemanticCache,
	index: GuideNhWorkspaceIndex | undefined
): CompletionItem[] {
	const source = resolveRuntimeAttributeSource(context);
	if (!source) {
		return [];
	}
	const runtimeItems = createRuntimeValueCompletions(source.capability, context.prefix, cache);
	if (source.capability !== 'pages') {
		return runtimeItems;
	}
	return mergeCompletionItems([
		...createPageValueCompletions(context.prefix, index),
		...runtimeItems
	]);
}

function createFrontmatterPageValueCompletions(
	text: string,
	offset: number,
	frontmatter: FrontmatterBlock,
	index: GuideNhWorkspaceIndex | undefined,
	cache?: SemanticCache
): CompletionItem[] {
	const context = findFrontmatterValueContext(text.slice(frontmatter.start, offset));
	if (!context || context.path.join('.') !== 'navigation.parent') {
		return [];
	}
	return mergeCompletionItems([
		...createPageValueCompletions(context.prefix, index),
		...createRuntimeValueCompletions('pages', context.prefix, cache)
	]);
}

function findFrontmatterValueContext(before: string): FrontmatterValueContext | undefined {
	const line = getCurrentLine(before);
	const scalarValueMatch = line.match(/^(\s*)([A-Za-z_][\w.-]*)\s*:\s*([^\s]*)$/);
	if (scalarValueMatch) {
		const parentPath = findFrontmatterParentPath(before, scalarValueMatch[1].length);
		return {
			path: [...parentPath, scalarValueMatch[2]],
			prefix: scalarValueMatch[3]
		};
	}
	const listValueMatch = line.match(/^(\s*)-\s+([^\s]*)$/);
	if (!listValueMatch) {
		return undefined;
	}
	const parentPath = findFrontmatterParentPath(before, listValueMatch[1].length + 1);
	if (parentPath.length === 0) {
		return undefined;
	}
	return {
		path: parentPath,
		prefix: listValueMatch[2]
	};
}

function createPageValueCompletions(prefix: string, index: GuideNhWorkspaceIndex | undefined): CompletionItem[] {
	if (!index) {
		return [];
	}
	return index
		.queryPagesByPrefix(prefix)
		.map((page) => ({
			label: page.relativePath,
			kind: CompletionItemKind.File,
			detail: 'GuideNH page',
			documentation: page.uri
		}));
}

function createFrontmatterValueCompletions(
	text: string,
	offset: number,
	frontmatter: FrontmatterBlock,
	cache: SemanticCache | undefined,
	index: GuideNhWorkspaceIndex | undefined
): CompletionItem[] {
	const context = findFrontmatterValueContext(text.slice(frontmatter.start, offset));
	if (!context) {
		return [];
	}
	const path = context.path.join('.');
	const source = FrontmatterValueSources.find((candidate) => candidate.path === path);
	if (!source) {
		return [];
	}
	return mergeCompletionItems([
		...createIndexedFrontmatterValueCompletions(source, context.prefix, index),
		...createRuntimeFrontmatterValueCompletions(source, context.prefix, cache)
	]);
}

function createIndexedFrontmatterValueCompletions(
	source: FrontmatterValueSource,
	prefix: string,
	index: GuideNhWorkspaceIndex | undefined
): CompletionItem[] {
	if (!index) {
		return [];
	}
	return index
		.queryFrontmatterValues(source.path, prefix)
		.map((value) => ({
			label: value,
			kind: CompletionItemKind.Value,
			detail: source.indexDetail
		}));
}

function createRuntimeFrontmatterValueCompletions(
	source: FrontmatterValueSource,
	prefix: string,
	cache: SemanticCache | undefined
): CompletionItem[] {
	if (!source.capability) {
		return [];
	}
	return createRuntimeValueCompletions(source.capability, prefix, cache);
}

function createRuntimeValueCompletions(
	capability: string,
	prefix: string,
	cache: SemanticCache | undefined
): CompletionItem[] {
	if (!cache) {
		return [];
	}
	return cache.queryPrefix(capability, prefix).map((entry) => createRuntimeCompletionItem(capability, entry));
}

function createRuntimeCompletionItem(capability: string, entry: { id: string; label?: string; detail?: string }): CompletionItem {
	const detailParts = [entry.detail, entry.id].filter((value): value is string => typeof value === 'string' && value.length > 0);
	if (capability === 'items') {
		return {
			label: entry.label ?? entry.id,
			kind: CompletionItemKind.Value,
			detail: detailParts.join(' - '),
			documentation: entry.id,
			insertText: entry.id,
			filterText: [entry.id, entry.label, entry.detail].filter((value): value is string => typeof value === 'string' && value.length > 0).join(' ')
		};
	}
	return {
		label: entry.id,
		kind: CompletionItemKind.Value,
		detail: entry.label,
		documentation: entry.detail
	};
}

function mergeCompletionItems(items: CompletionItem[]): CompletionItem[] {
	const seen = new Set<string>();
	const merged: CompletionItem[] = [];
	for (const item of items) {
		if (seen.has(item.label)) {
			continue;
		}
		seen.add(item.label);
		merged.push(item);
	}
	return merged;
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

function createTagNameSnippetCompletions(schema: GuideNhSchemaBundle, allowed: string[] | undefined): CompletionItem[] {
	return Object.values(schema.tags.tags)
		.filter((tag) => isTagAllowed(tag, allowed))
		.map((tag) => ({
			label: tag.name,
			kind: CompletionItemKind.Class,
			detail: tag.kind,
			documentation: tag.description,
			insertText: createSelfContainedTagSnippet(tag),
			insertTextFormat: InsertTextFormat.Snippet
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

function withReplacementRange(items: CompletionItem[], text: string, start: number, end: number): CompletionItem[] {
	return items.map((item) => {
		if (item.insertText === undefined || item.insertTextFormat !== InsertTextFormat.Snippet) {
			return item;
		}
		return {
			...item,
			textEdit: TextEdit.replace({
				start: offsetToPosition(text, start),
				end: offsetToPosition(text, end)
			}, String(item.insertText))
		};
	});
}

function createPlainTagCompletions(
	maskedText: string,
	text: string,
	offset: number,
	schema: GuideNhSchemaBundle,
	parentTag: string | undefined
): CompletionItem[] {
	const prefix = findPlainTagPrefix(maskedText, offset);
	if (prefix === undefined) {
		return [];
	}
	const resolvedParentTag = parentTag ?? inferOpenParentTag(maskedText, offset);
	const allowed = resolvedParentTag ? schema.tags.tags[resolvedParentTag]?.children : undefined;
	return [
		...createTagSnippetCompletions(schema, allowed, prefix),
		...createSnippetCompletions(schema, allowed).filter((item) => item.label.startsWith(prefix))
	];
}

function findPlainTagPrefix(text: string, offset: number): string | undefined {
	const line = getCurrentLine(text.slice(0, offset));
	const match = line.match(/(?:^|\s)([A-Z][A-Za-z0-9]*)$/);
	if (!match) {
		return undefined;
	}
	return match[1];
}

function createTagSnippetCompletions(
	schema: GuideNhSchemaBundle,
	allowed: string[] | undefined,
	prefix: string
): CompletionItem[] {
	return Object.values(schema.tags.tags)
		.filter((tag) => isTagAllowed(tag, allowed) && tag.name.startsWith(prefix))
		.map((tag) => ({
			label: tag.name,
			kind: CompletionItemKind.Class,
			detail: tag.kind,
			documentation: tag.description,
			insertText: createTagSnippet(tag),
			insertTextFormat: InsertTextFormat.Snippet
		}));
}

function createTagSnippet(tag: GuideNhTagSchema): string {
	if (tag.kind === 'inline' || tag.children.length === 0) {
		return `<${tag.name} $0 />`;
	}
	return `<${tag.name}>\n  $0\n</${tag.name}>`;
}

function createSelfContainedTagSnippet(tag: GuideNhTagSchema): string {
	if (tag.kind === 'inline' || tag.children.length === 0) {
		return `<${tag.name} $0 />`;
	}
	return `<${tag.name}>$0</${tag.name}>`;
}

function createAttributeSnippet(name: string, attribute: GuideNhAttributeSchema): string {
	const placeholder = defaultAttributePlaceholder(attribute);
	if (attribute.valueStyle === 'bare') {
		return name;
	}
	if (attribute.valueStyle === 'expression' || (attribute.valueStyle === undefined && attribute.type === 'boolean')) {
		return `${name}={\${1:${placeholder}}}`;
	}
	return `${name}="\${1:${placeholder}}"`;
}

function defaultAttributePlaceholder(attribute: GuideNhAttributeSchema): string {
	if (attribute.type === 'boolean') {
		return 'true';
	}
	if (attribute.type === 'number') {
		return '0';
	}
	if (attribute.values && attribute.values.length > 0) {
		return attribute.values[0];
	}
	if (attribute.type === 'item') {
		return 'minecraft:stone';
	}
	if (attribute.type === 'ore') {
		return 'oreIron';
	}
	if (attribute.type === 'resource') {
		return './asset.json';
	}
	if (attribute.type === 'page') {
		return 'index.md';
	}
	if (attribute.type === 'color') {
		return '#ffffff';
	}
	return 'value';
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

function offsetToPosition(text: string, offset: number): Position {
	let line = 0;
	let character = 0;
	for (let index = 0; index < offset && index < text.length; index++) {
		const char = text[index];
		if (char === '\n') {
			line++;
			character = 0;
		} else if (char !== '\r') {
			character++;
		}
	}
	return { line, character };
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

function resolveRuntimeAttributeSource(context: AttributeValueContext): RuntimeAttributeSource | undefined {
	return RuntimeAttributeSourceByKey.get(createRuntimeAttributeSourceKey(context.tagName, context.attributeName))
		?? RuntimeAttributeSourceByKey.get(createRuntimeAttributeSourceKey(undefined, context.attributeName));
}

function createRuntimeAttributeSourceKey(tagName: string | undefined, attributeName: string): string {
	return `${tagName ?? '*'}:${attributeName}`;
}
