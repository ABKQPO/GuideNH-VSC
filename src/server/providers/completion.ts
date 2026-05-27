import { CompletionItem, CompletionItemKind, InsertTextFormat, Position, TextEdit } from 'vscode-languageserver/node';
import { GuideNhAttributeSchema, GuideNhFrontmatterKey, GuideNhSchemaBundle, GuideNhTagSchema } from '../../common/schema';
import { GuideNhResourceIndex } from '../index/resourceIndex';
import { GuideNhWorkspaceIndex } from '../index/workspaceIndex';
import { maskIgnoredMarkdownRanges } from '../parser/documentParser';
import { findAttributeSchema, findTagSchema, listTagSchemas, matchesTagName } from '../schema/schemaLookup';
import { findOpenTagAttributeValue, findOpenTagContext, normalizeResourceReference } from '../parser/documentModel';
import { extractFrontmatter, FrontmatterBlock } from '../parser/frontmatter';
import { SemanticCache } from '../runtime/semanticCache';
import {
	isStructureLibOrientationAttribute,
	resolveFrontmatterRuntimeCapability,
	resolveRuntimeCapability,
	resolveRuntimeAttributeSource
} from '../runtime/runtimeAttributeSources';

export const GuideNhCompletionTriggerCharacters = ['<', ' ', '"', '\'', '`', '=', '+', ':', '^'];

interface AttributeValueContext {
	tagName: string;
	attributeName: string;
	prefix: string;
}

interface AttributeNameContext {
	tagName: string;
	prefix: string;
}

interface FrontmatterValueContext {
	path: string[];
	prefix: string;
}

interface StaticAttributeValueSource {
	tagName: string;
	attributeName: string;
	values: string[];
}

export interface DynamicCompletionRequest {
	capability: string;
	prefix: string;
	filters: Record<string, string>;
}

export interface GuideNhCompletionResult {
	items: CompletionItem[];
	dynamicRequest?: DynamicCompletionRequest;
	runtimeReplacement?: CompletionReplacementRange;
}

export interface CompletionReplacementRange {
	text: string;
	start: number;
	end: number;
}

const StaticAttributeValueSources: StaticAttributeValueSource[] = [
	{
		tagName: 'ImportStructureLib',
		attributeName: 'facing',
		values: ['north', 'south', 'west', 'east', 'up', 'down']
	},
	{
		tagName: 'ImportStructureLib',
		attributeName: 'rotation',
		values: ['normal', 'clockwise', 'upside down', 'counter clockwise']
	},
	{
		tagName: 'ImportStructureLib',
		attributeName: 'flip',
		values: ['none', 'horizontal', 'vertical']
	}
];

const DynamicCompletionCapabilities = new Set([
	'items',
	'ores',
	'categories',
	'mods',
	'sounds',
	'keybinds',
	'commands',
	'recipes',
	'quests',
	'pages',
	'entities'
]);

export function createGuideNhCompletionResult(
	text: string,
	offset: number,
	schema: GuideNhSchemaBundle,
	parentTag: string | undefined,
	cache?: SemanticCache,
	index?: GuideNhWorkspaceIndex,
	resourceIndex?: GuideNhResourceIndex
): GuideNhCompletionResult {
	const maskedText = maskIgnoredMarkdownRanges(text);
	const frontmatter = extractFrontmatter(text);
	if (frontmatter && offset <= frontmatter.end) {
		const frontmatterValueContext = findFrontmatterValueContext(text.slice(frontmatter.start, offset));
		const runtimeReplacement = frontmatterValueContext
			? createCompletionReplacementRange(text, offset, frontmatterValueContext.prefix)
			: undefined;
		const dynamicRequest = resolveFrontmatterDynamicCompletionRequest(text, offset, frontmatter);
		const pageCompletions = createFrontmatterPageValueCompletions(text, offset, frontmatter, index, cache);
		if (pageCompletions.length > 0) {
			return { items: pageCompletions, dynamicRequest, runtimeReplacement };
		}
		const valueCompletions = createFrontmatterValueCompletions(
			text,
			offset,
			frontmatter,
			cache,
			index,
			runtimeReplacement
		);
		return {
			items: valueCompletions.length > 0 ? valueCompletions : createFrontmatterCompletions(text, offset, frontmatter, schema),
			dynamicRequest,
			runtimeReplacement
		};
	}

	const fencedBlockCompletions = createFencedBlockCompletions(text, offset, schema);
	if (fencedBlockCompletions.length > 0) {
		return { items: fencedBlockCompletions };
	}

	const inlineMarkerCompletions = createInlineMarkerCompletions(text, offset, schema);
	if (inlineMarkerCompletions.length > 0) {
		return { items: inlineMarkerCompletions };
	}

	const attributeValueContext = findAttributeValueContext(maskedText, offset);
	const dynamicRequest = attributeValueContext ? resolveDynamicCompletionRequest(text, offset, schema, attributeValueContext) : undefined;
	const runtimeReplacement = attributeValueContext
		? createCompletionReplacementRange(text, offset, attributeValueContext.prefix)
		: undefined;
	if (attributeValueContext) {
		const staticCompletions = shouldUseStaticAttributeCompletions(attributeValueContext, dynamicRequest)
			? createAttributeValueCompletions(attributeValueContext, schema)
			: [];
		if (staticCompletions.length > 0) {
			return { items: staticCompletions, dynamicRequest, runtimeReplacement };
		}
		const referenceCompletions = createAttributeReferenceValueCompletions(attributeValueContext, schema, index, resourceIndex, cache);
		if (referenceCompletions.length > 0) {
			return { items: referenceCompletions, dynamicRequest, runtimeReplacement };
		}
	}
	if (attributeValueContext && cache) {
		const runtimeCompletions = createRuntimeAttributeValueCompletions(
			attributeValueContext,
			schema,
			cache,
			index,
			runtimeReplacement
		);
		if (runtimeCompletions.length > 0) {
			return { items: runtimeCompletions, dynamicRequest, runtimeReplacement };
		}
	}
	if (attributeValueContext) {
		return {
			items: [],
			dynamicRequest,
			runtimeReplacement
		};
	}

	const attributeNameContext = findAttributeNameContext(maskedText, offset);
	if (attributeNameContext) {
		return {
			items: createAttributeNameCompletions(text, offset, schema, attributeNameContext)
		};
	}

	const openTag = findOpenTagContext(maskedText, offset);
	if (!openTag) {
		return { items: createPlainTagCompletions(maskedText, text, offset, schema, parentTag) };
	}
	if (openTag.name.length === 0) {
		const resolvedParentTag = parentTag ?? inferOpenParentTag(maskedText, offset);
		const allowed = resolveAllowedTagNames(schema, resolvedParentTag);
		const completions = [
			...createTagNameSnippetCompletions(schema, allowed),
			...createSnippetCompletions(schema, allowed)
		];
		return { items: withReplacementRange(completions, text, offset - 1, resolveTagCompletionReplaceEnd(text, offset)) };
	}
	const tagSchema = findTagSchema(schema, openTag.name);
	if (!tagSchema || !openTag.hasAttributeBoundary) {
		const resolvedParentTag = parentTag ?? inferOpenParentTag(maskedText, offset);
		const allowed = resolveAllowedTagNames(schema, resolvedParentTag);
		const completions = [
			...createTagNameSnippetCompletions(schema, allowed).filter((item) => item.label.toLowerCase().startsWith(openTag.name.toLowerCase())),
			...createSnippetCompletions(schema, allowed).filter((item) => item.label.toLowerCase().startsWith(openTag.name.toLowerCase()))
		];
		return {
			items: withReplacementRange(
				completions,
				text,
				offset - openTag.name.length - 1,
				resolveTagCompletionReplaceEnd(text, offset)
			)
		};
	}
	return {
		items: Object.entries(tagSchema.attributes).map(([name, attribute]) => ({
			label: name,
			kind: CompletionItemKind.Property,
			detail: attribute.type,
			documentation: attribute.description,
			insertText: createAttributeSnippet(name, attribute),
			insertTextFormat: InsertTextFormat.Snippet
		}))
	};
}

export function createGuideNhCompletions(
	text: string,
	offset: number,
	schema: GuideNhSchemaBundle,
	parentTag: string | undefined,
	cache?: SemanticCache,
	index?: GuideNhWorkspaceIndex,
	resourceIndex?: GuideNhResourceIndex
): CompletionItem[] {
	return createGuideNhCompletionResult(text, offset, schema, parentTag, cache, index, resourceIndex).items;
}

export function findGuideNhAttributeValueCompletionContext(text: string, offset: number): AttributeValueContext | undefined {
	return findAttributeValueContext(maskIgnoredMarkdownRanges(text), offset);
}

export function createRuntimeSemanticCompletionItems(
	capability: string,
	entries: Array<{ id: string; label?: string; detail?: string }>
): CompletionItem[] {
	return entries.map((entry) => createRuntimeCompletionItem(capability, entry));
}

function resolveDynamicCompletionRequest(
	text: string,
	offset: number,
	schema: GuideNhSchemaBundle,
	context: AttributeValueContext
): DynamicCompletionRequest | undefined {
	if (matchesTagName(context.tagName, 'ImportStructureLib') && context.attributeName === 'channel') {
		const controller = findOpenTagAttributeValue(text, offset, 'controller');
		if (!controller) {
			return undefined;
		}
		return {
			capability: 'structurelib',
			prefix: context.prefix,
			filters: {
				attribute: 'channel',
				controller
			}
		};
	}
	if (matchesTagName(context.tagName, 'ImportStructureLib') && isStructureLibOrientationAttribute(context.attributeName)) {
		const controller = findOpenTagAttributeValue(text, offset, 'controller');
		if (!controller) {
			return undefined;
		}
		const filters: Record<string, string> = {
			attribute: context.attributeName,
			controller
		};
		for (const attributeName of ['facing', 'rotation', 'flip']) {
			if (attributeName === context.attributeName) {
				continue;
			}
			const value = findOpenTagAttributeValue(text, offset, attributeName);
			if (value) {
				filters[attributeName] = value;
			}
		}
		return {
			capability: 'structurelib',
			prefix: context.prefix,
			filters
		};
	}
	const source = resolveRuntimeAttributeSource(context.tagName, context.attributeName);
	if (source && DynamicCompletionCapabilities.has(source.capability)) {
		return {
			capability: source.capability,
			prefix: context.prefix,
			filters: {}
		};
	}
	const attribute = findAttributeSchema(schema, context.tagName, context.attributeName);
	const capability = resolveRuntimeCapability(context.tagName, context.attributeName, attribute);
	if (capability && DynamicCompletionCapabilities.has(capability)) {
		return {
			capability,
			prefix: context.prefix,
			filters: {}
		};
	}
	return undefined;
}

function resolveFrontmatterDynamicCompletionRequest(
	text: string,
	offset: number,
	frontmatter: FrontmatterBlock
): DynamicCompletionRequest | undefined {
	const context = findFrontmatterValueContext(text.slice(frontmatter.start, offset));
	if (!context) {
		return undefined;
	}
	const capability = resolveFrontmatterRuntimeCapability(context.path.join('.'));
	if (!capability || !DynamicCompletionCapabilities.has(capability)) {
		return undefined;
	}
	return {
		capability,
		prefix: context.prefix,
		filters: {}
	};
}

function findAttributeValueContext(text: string, offset: number): AttributeValueContext | undefined {
	const before = text.slice(0, offset);
	const openTagMatch = before.match(/<([A-Za-z][A-Za-z0-9]*)\s*[^<>]*$/);
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

function findAttributeNameContext(text: string, offset: number): AttributeNameContext | undefined {
	const openTag = findOpenTagContext(text, offset);
	if (!openTag || openTag.name.length === 0 || !openTag.hasAttributeBoundary) {
		return undefined;
	}
	const before = text.slice(openTag.start, offset);
	if (/([A-Za-z_][\w.-]*)\s*=\s*(?:"[^"]*|'[^']*|\{[^}]*|[^\s"'=<>`]*)$/.test(before)) {
		return undefined;
	}
	const attributeMatch = before.match(/\s+([A-Za-z_][\w.-]*)$/);
	if (!attributeMatch) {
		return undefined;
	}
	return {
		tagName: openTag.name,
		prefix: attributeMatch[1]
	};
}

function createAttributeNameCompletions(
	text: string,
	offset: number,
	schema: GuideNhSchemaBundle,
	context: AttributeNameContext
): CompletionItem[] {
	const tagSchema = findTagSchema(schema, context.tagName);
	if (!tagSchema) {
		return [];
	}
	const start = offset - context.prefix.length;
	return Object.entries(tagSchema.attributes)
		.filter(([name]) => name.toLowerCase().startsWith(context.prefix.toLowerCase()))
		.map(([name, attribute]) => ({
			label: name,
			kind: CompletionItemKind.Property,
			detail: attribute.type,
			documentation: attribute.description,
			insertText: createAttributeSnippet(name, attribute),
			insertTextFormat: InsertTextFormat.Snippet,
			textEdit: TextEdit.replace({
				start: offsetToPosition(text, start),
				end: offsetToPosition(text, offset)
			}, createAttributeSnippet(name, attribute))
		}));
}

function createAttributeValueCompletions(context: AttributeValueContext, schema: GuideNhSchemaBundle): CompletionItem[] {
	const attribute = findAttributeSchema(schema, context.tagName, context.attributeName);
	if (!attribute) {
		return [];
	}
	return mergeCompletionItems([
		...resolveStaticAttributeValues(attribute),
		...resolveContextualStaticAttributeValues(context)
	].filter((value) => value.startsWith(context.prefix))
		.map((value) => ({
			label: value,
			kind: CompletionItemKind.Value,
			detail: `${context.tagName}.${context.attributeName}`,
			documentation: attribute.description
		})));
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

function resolveContextualStaticAttributeValues(context: AttributeValueContext): string[] {
	const source = StaticAttributeValueSources.find((candidate) => {
		return matchesTagName(candidate.tagName, context.tagName) && candidate.attributeName === context.attributeName;
	});
	return source?.values ?? [];
}

function createAttributeReferenceValueCompletions(
	context: AttributeValueContext,
	schema: GuideNhSchemaBundle,
	index: GuideNhWorkspaceIndex | undefined,
	resourceIndex: GuideNhResourceIndex | undefined,
	cache: SemanticCache | undefined
): CompletionItem[] {
	const attribute = findAttributeSchema(schema, context.tagName, context.attributeName);
	if (!attribute) {
		return [];
	}
	const capability = resolveRuntimeCapability(context.tagName, context.attributeName, attribute);
	if (capability === 'pages') {
		return mergeCompletionItems([
			...createPageValueCompletions(context.prefix, index),
			...createRuntimeValueCompletions('pages', context.prefix, cache)
		]);
	}
	if (attribute.type === 'resource') {
		return createResourceValueCompletions(context.prefix, resourceIndex);
	}
	if (matchesTagName(context.tagName, 'ImportStructureLib') && context.attributeName === 'piece') {
		return [];
	}
	if (matchesTagName(context.tagName, 'ImportStructureLib') && context.attributeName === 'channel') {
		return [];
	}
	return [];
}

function shouldUseStaticAttributeCompletions(
	context: AttributeValueContext,
	dynamicRequest: DynamicCompletionRequest | undefined
): boolean {
	if (!dynamicRequest) {
		return true;
	}
	return !matchesTagName(context.tagName, 'ImportStructureLib')
		|| !isStructureLibOrientationAttribute(context.attributeName);
}

function createRuntimeAttributeValueCompletions(
	context: AttributeValueContext,
	schema: GuideNhSchemaBundle,
	cache: SemanticCache,
	index: GuideNhWorkspaceIndex | undefined,
	replacementRange: CompletionReplacementRange | undefined
): CompletionItem[] {
	const attribute = findAttributeSchema(schema, context.tagName, context.attributeName);
	const capability = resolveRuntimeCapability(context.tagName, context.attributeName, attribute);
	if (!capability) {
		return [];
	}
	const runtimeItems = createRuntimeValueCompletions(capability, context.prefix, cache);
	if (capability !== 'pages') {
		return applyCompletionReplacementRange(runtimeItems, replacementRange);
	}
	return mergeCompletionItems([
		...createPageValueCompletions(context.prefix, index),
		...applyCompletionReplacementRange(runtimeItems, replacementRange)
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

function createResourceValueCompletions(prefix: string, resourceIndex: GuideNhResourceIndex | undefined): CompletionItem[] {
	if (!resourceIndex) {
		return [];
	}
	const normalizedPrefix = normalizeResourceReference(prefix) ?? prefix;
	return resourceIndex
		.queryResourcesByPrefix(normalizedPrefix)
		.map((resource) => ({
			label: resource.relativePath,
			kind: CompletionItemKind.File,
			detail: 'GuideNH resource',
			documentation: resource.uri
		}));
}

function createFrontmatterValueCompletions(
	text: string,
	offset: number,
	frontmatter: FrontmatterBlock,
	cache: SemanticCache | undefined,
	index: GuideNhWorkspaceIndex | undefined,
	replacementRange: CompletionReplacementRange | undefined
): CompletionItem[] {
	const context = findFrontmatterValueContext(text.slice(frontmatter.start, offset));
	if (!context) {
		return [];
	}
	const path = context.path.join('.');
	const capability = resolveFrontmatterRuntimeCapability(path);
	const indexDetail = resolveFrontmatterIndexDetail(path);
	if (!capability && !indexDetail) {
		return [];
	}
	return mergeCompletionItems([
		...createIndexedFrontmatterValueCompletions(path, indexDetail, context.prefix, index),
		...applyCompletionReplacementRange(
			createRuntimeFrontmatterValueCompletions(capability, context.prefix, cache),
			replacementRange
		)
	]);
}

function createIndexedFrontmatterValueCompletions(
	path: string,
	indexDetail: string | undefined,
	prefix: string,
	index: GuideNhWorkspaceIndex | undefined
): CompletionItem[] {
	if (!index || !indexDetail) {
		return [];
	}
	return index
		.queryFrontmatterValues(path, prefix)
		.map((value) => ({
			label: value,
			kind: CompletionItemKind.Value,
			detail: indexDetail
		}));
}

function createRuntimeFrontmatterValueCompletions(
	capability: string | undefined,
	prefix: string,
	cache: SemanticCache | undefined
): CompletionItem[] {
	if (!capability) {
		return [];
	}
	return createRuntimeValueCompletions(capability, prefix, cache);
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
		const itemMatchTerms = buildItemCompletionTerms(entry);
		return {
			label: entry.label ?? entry.id,
			kind: CompletionItemKind.Value,
			detail: detailParts.join(' - '),
			documentation: entry.id,
			insertText: entry.id,
			filterText: itemMatchTerms.join(' ')
		};
	}
	return {
		label: entry.id,
		kind: CompletionItemKind.Value,
		detail: entry.label,
		documentation: entry.detail
	};
}

function buildItemCompletionTerms(entry: { id: string; label?: string; detail?: string }): string[] {
	const values = [entry.id, entry.label, entry.detail].filter((value): value is string => typeof value === 'string' && value.length > 0);
	const pathId = entry.id.includes(':') ? entry.id.slice(entry.id.indexOf(':') + 1) : entry.id;
	const compactValues = values
		.map((value) => value.toLowerCase().replace(/[^a-z0-9]/g, ''))
		.filter((value) => value.length > 0);
	return Array.from(new Set([
		...values,
		pathId,
		...tokenizeCompletionValue(entry.id),
		...tokenizeCompletionValue(pathId),
		...tokenizeCompletionValue(entry.label),
		...tokenizeCompletionValue(entry.detail),
		...compactValues
	]));
}

function tokenizeCompletionValue(value: string | undefined): string[] {
	if (!value) {
		return [];
	}
	return value.split(/[^A-Za-z0-9]+/).filter((token) => token.length > 0);
}

function resolveFrontmatterIndexDetail(path: string): string | undefined {
	switch (path) {
		case 'item_ids':
			return 'Indexed item id';
		case 'ore_ids':
			return 'Indexed ore id';
		case 'quest_ids':
			return 'Indexed quest id';
		case 'categories':
			return 'Indexed category';
		case 'navigation.required_mods':
			return 'Indexed required mod';
		case 'navigation.parent':
			return 'Indexed page';
		case 'navigation.icon':
		case 'navigation.icons':
			return 'Indexed navigation icon';
		default:
			return undefined;
	}
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
	return listTagSchemas(schema)
		.filter((tag) => isTagAllowed(tag, allowed))
		.map((tag) => ({
			label: tag.name,
			kind: CompletionItemKind.Class,
			detail: tag.kind,
			filterText: '<' + tag.name,
			documentation: tag.description
		}));
}

function createTagNameSnippetCompletions(schema: GuideNhSchemaBundle, allowed: string[] | undefined): CompletionItem[] {
	return listTagSchemas(schema)
		.filter((tag) => isTagAllowed(tag, allowed))
		.map((tag) => ({
			label: tag.name,
			kind: CompletionItemKind.Class,
			detail: tag.kind,
			filterText: '<' + tag.name,
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
			filterText: '<' + snippet.prefix,
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

export function applyCompletionReplacementRange(
	items: CompletionItem[],
	replacementRange: CompletionReplacementRange | undefined
): CompletionItem[] {
	if (!replacementRange) {
		return items;
	}
	return items.map((item) => {
		const replacementText = item.insertText ?? item.label;
		return {
			...item,
			textEdit: TextEdit.replace({
				start: offsetToPosition(replacementRange.text, replacementRange.start),
				end: offsetToPosition(replacementRange.text, replacementRange.end)
			}, String(replacementText))
		};
	});
}

function createCompletionReplacementRange(
	text: string,
	offset: number,
	prefix: string
): CompletionReplacementRange {
	return {
		text,
		start: Math.max(0, offset - prefix.length),
		end: offset
	};
}

function resolveTagCompletionReplaceEnd(text: string, offset: number): number {
	return text[offset] === '>' ? offset + 1 : offset;
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
	const allowed = resolveAllowedTagNames(schema, resolvedParentTag);
	return [
		...createTagSnippetCompletions(schema, allowed, prefix),
		...createSnippetCompletions(schema, allowed).filter((item) => item.label.startsWith(prefix))
	];
}

function resolveAllowedTagNames(schema: GuideNhSchemaBundle, parentTagName: string | undefined): string[] | undefined {
	const parentTag = findTagSchema(schema, parentTagName);
	if (!parentTag || parentTag.children.length === 0) {
		return undefined;
	}
	return parentTag.children;
}

function findPlainTagPrefix(text: string, offset: number): string | undefined {
	const line = getCurrentLine(text.slice(0, offset));
	const match = line.match(/(?:^|\s)([A-Za-z][A-Za-z0-9]*)$/);
	if (!match) {
		return undefined;
	}
	return match[1];
}

export function resolveGuideNhCompletionOffset(text: string, requestedOffset: number): number {
	const normalizedOffset = clampOffset(text, requestedOffset);
	const quotedValueOffset = resolveAutoClosedAttributeValueOffset(text, normalizedOffset);
	if (quotedValueOffset !== undefined) {
		return quotedValueOffset;
	}
	const fallbackOffset = resolveAutoClosedTagOffset(text, normalizedOffset);
	return fallbackOffset ?? normalizedOffset;
}

function createTagSnippetCompletions(
	schema: GuideNhSchemaBundle,
	allowed: string[] | undefined,
	prefix: string
): CompletionItem[] {
	return listTagSchemas(schema)
		.filter((tag) => isTagAllowed(tag, allowed) && tag.name.toLowerCase().startsWith(prefix.toLowerCase()))
		.map((tag) => ({
			label: tag.name,
			kind: CompletionItemKind.Class,
			detail: tag.kind,
			filterText: '<' + tag.name,
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
	return allowed === undefined || allowed.some((candidate) => candidate.toLowerCase() === tag.name.toLowerCase());
}

function inferOpenParentTag(text: string, offset: number): string | undefined {
	const stack: string[] = [];
	const before = text.slice(0, offset);
	const tagPattern = /<\/?([A-Za-z][A-Za-z0-9]*)(?:\s[^<>]*?)?(\/?)>/g;
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
		if (matchesTagName(stack[index], tagName)) {
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

function resolveAutoClosedTagOffset(text: string, offset: number): number | undefined {
	if (offset <= 0 || offset > text.length) {
		return undefined;
	}
	if (text[offset - 1] !== '>') {
		return undefined;
	}
	const previous = text[offset - 2];
	if (previous !== '<' && !isAsciiAlphaNumeric(previous)) {
		return undefined;
	}
	const insideOffset = offset - 1;
	const openTag = findOpenTagContext(text, insideOffset);
	if (!openTag) {
		return undefined;
	}
	return insideOffset;
}

function resolveAutoClosedAttributeValueOffset(text: string, offset: number): number | undefined {
	if (offset <= 0) {
		return undefined;
	}
	const requestedOffset = clampOffset(text, offset);
	const minimumOffset = Math.max(0, requestedOffset - 4);
	for (let candidateOffset = requestedOffset; candidateOffset >= minimumOffset; candidateOffset--) {
		if (!hasOnlyAutoClosedAttributeSuffix(text, candidateOffset, requestedOffset)) {
			continue;
		}
		if (findAttributeValueContext(text, candidateOffset)) {
			return candidateOffset;
		}
	}
	return undefined;
}

function clampOffset(text: string, offset: number): number {
	if (offset < 0) {
		return 0;
	}
	if (offset > text.length) {
		return text.length;
	}
	return offset;
}

function isAsciiAlphaNumeric(value: string | undefined): boolean {
	return value !== undefined && /^[A-Za-z0-9]$/.test(value);
}

function hasOnlyAutoClosedAttributeSuffix(text: string, start: number, end: number): boolean {
	return /^["'\s/>]*$/.test(text.slice(start, end));
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
