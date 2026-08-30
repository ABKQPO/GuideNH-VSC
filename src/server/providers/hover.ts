import { Hover, MarkupKind } from 'vscode-languageserver/node';
import { GuideNhResourceIndex } from '../index/resourceIndex';
import { GuideNhWorkspaceIndex } from '../index/workspaceIndex';
import { GuideNhFrontmatterKey, GuideNhSchemaBundle } from '../../common/schema';
import { createGuideNhDocumentModel, findReferenceAtOffset, findTagContextAtOffset } from '../parser/documentModel';
import { extractFrontmatter } from '../parser/frontmatter';
import { findIndexedFrontmatterValueAtOffset } from '../parser/frontmatterIndexing';
import { SemanticCache } from '../runtime/semanticCache';
import { DynamicHoverRequest, resolveDynamicHoverRequest } from '../runtime/runtimeHover';
import {
	resolveFrontmatterRuntimeCapability,
	resolveRuntimeCapability,
	resolveRuntimeAttributeSource
} from '../runtime/runtimeAttributeSources';
import { findAttributeSchema, findTagSchema, matchesTagName } from '../schema/schemaLookup';
import { resolveGuideNhPreferredLocale } from '../index/guideNhPaths';

interface FrontmatterKeyContext {
	path: string[];
	key: GuideNhFrontmatterKey;
}

export interface GuideNhHoverResult {
	hover?: Hover;
	dynamicRequest?: DynamicHoverRequest;
}

export function createGuideNhHover(
	text: string,
	offset: number,
	schema: GuideNhSchemaBundle,
	index?: GuideNhWorkspaceIndex,
	resourceIndex?: GuideNhResourceIndex,
	cache?: SemanticCache,
	documentUri?: string,
	preferredLocale?: string
): GuideNhHoverResult {
	const frontmatterValueHover = createIndexedFrontmatterValueHover(text, offset, index);
	if (frontmatterValueHover) {
		return { hover: frontmatterValueHover };
	}
	const frontmatterHover = createFrontmatterHover(text, offset, schema);
	if (frontmatterHover) {
		return { hover: frontmatterHover };
	}
	const model = createGuideNhDocumentModel(text, documentUri);
	const pageLocale = resolveGuideNhPreferredLocale(documentUri, preferredLocale);
	const referenceHover = createReferenceHover(model, offset, index, resourceIndex, pageLocale);
	if (referenceHover) {
		return { hover: referenceHover };
	}
	const tagContext = findTagContextAtOffset(model, offset);
	if (!tagContext) {
		return {};
	}
	const runtimeAttributeHover = createRuntimeAttributeHover(
		tagContext.tag.name,
		tagContext.attribute?.name,
		tagContext.attribute?.value,
		findAttributeSchema(schema, tagContext.tag.name, tagContext.attribute?.name),
		index,
		cache
	);
	if (runtimeAttributeHover) {
		return { hover: runtimeAttributeHover };
	}
	const dynamicRequest = resolveDynamicHoverRequest(
		text,
		offset,
		tagContext.tag.name,
		tagContext.attribute?.name,
		tagContext.attribute?.value,
		findAttributeSchema(schema, tagContext.tag.name, tagContext.attribute?.name)
	);
	if (dynamicRequest) {
		return { dynamicRequest };
	}
	const attributeHover = createAttributeHover(tagContext.tag.name, tagContext.attribute?.name, schema);
	if (attributeHover) {
		return { hover: attributeHover };
	}
	return { hover: createTagHover(tagContext.tag.name, schema) };
}

function createTagHover(tagName: string, schema: GuideNhSchemaBundle): Hover | undefined {
	const tagSchema = findTagSchema(schema, tagName);
	if (!tagSchema) {
		return undefined;
	}
	return createMarkdownHover(`**${tagSchema.name}**\n\n${tagSchema.description}`);
}

function createAttributeHover(tagName: string, attributeName: string | undefined, schema: GuideNhSchemaBundle): Hover | undefined {
	if (!attributeName) {
		return undefined;
	}
	const tagSchema = findTagSchema(schema, tagName);
	const attribute = findAttributeSchema(schema, tagName, attributeName);
	if (!attribute) {
		return undefined;
	}
	return createMarkdownHover(`**${tagSchema?.name ?? tagName}.${attributeName}**\n\n${attribute.type}\n\n${attribute.description ?? ''}`.trim());
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

function createIndexedFrontmatterValueHover(
	text: string,
	offset: number,
	index: GuideNhWorkspaceIndex | undefined
): Hover | undefined {
	const context = findIndexedFrontmatterValueAtOffset(text, offset);
	if (!context) {
		return undefined;
	}
	const page = context.path === 'item_id' || context.path === 'item_ids'
		? index?.findItemReference(context.value)
		: context.path === 'ore_ids'
			? index?.findOreReference(context.value)
			: undefined;
	const kind = context.path === 'item_id' || context.path === 'item_ids'
		? 'GuideNH item id'
		: context.path === 'ore_ids'
			? 'GuideNH ore id'
			: context.path === 'quest_ids'
				? 'GuideNH quest id'
				: undefined;
	if (!kind) {
		return undefined;
	}
	const lines = [
		`**${kind}**`,
		'',
		`\`${context.value}\``
	];
	if (page) {
		lines.push('', `Defined in ${page.relativePath}`);
	}
	return createMarkdownHover(lines.join('\n'));
}

function createReferenceHover(
	model: ReturnType<typeof createGuideNhDocumentModel>,
	offset: number,
	index?: GuideNhWorkspaceIndex,
	resourceIndex?: GuideNhResourceIndex,
	preferredLocale?: string
): Hover | undefined {
	const reference = findReferenceAtOffset(model, offset);
	if (!reference || !reference.normalizedTarget) {
		return undefined;
	}
	if (reference.kind === 'page') {
		const page = index?.findPageByRelativePathForLocale(reference.normalizedTarget, preferredLocale);
		const status = page ? 'Resolved page' : 'Unresolved page';
		const location = page?.uri ?? reference.normalizedTarget;
		return createMarkdownHover(`**GuideNH page reference**\n\n${status}\n\n\`${reference.normalizedTarget}\`\n\n${location}`);
	}
	if (matchesTagName(reference.tagName, 'ImportStructureLib') && reference.attributeName === 'controller') {
		return createMarkdownHover(`**GuideNH structure controller**\n\n\`${reference.target}\`\n\nResolved by runtime semantic data.`);
	}
	if (matchesTagName(reference.tagName, 'ImportStructureLib') && reference.attributeName === 'piece') {
		return createMarkdownHover('**GuideNH structure piece**\n\nUsed by runtime import, but no standalone semantic candidates are exposed.');
	}
	const resource = resourceIndex?.findResourceByRelativePath(reference.normalizedTarget);
	const status = resource ? 'Resolved resource' : 'Unresolved resource';
	const location = resource?.uri ?? reference.normalizedTarget;
	return createMarkdownHover(`**GuideNH resource reference**\n\n${status}\n\n\`${reference.normalizedTarget}\`\n\n${location}`);
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

function createRuntimeAttributeHover(
	tagName: string,
	attributeName: string | undefined,
	attributeValue: string | undefined,
	attribute: ReturnType<typeof findAttributeSchema>,
	index: GuideNhWorkspaceIndex | undefined,
	cache: SemanticCache | undefined
): Hover | undefined {
	if (!attributeName || !attributeValue) {
		return undefined;
	}
	if (matchesTagName(tagName, 'ImportStructureLib') && attributeName === 'piece') {
		return createMarkdownHover(`**GuideNH structure piece**\n\n\`${attributeValue}\`\n\nUsed by runtime import, but no standalone semantic candidates are exposed.`);
	}
	const source = resolveRuntimeAttributeSource(tagName, attributeName);
	const capability = source?.capability ?? resolveRuntimeCapability(tagName, attributeName, attribute);
	if (!capability) {
		return undefined;
	}
	const entry = cache?.findEntry(capability, attributeValue);
	if (!entry) {
		return createLocalSemanticAttributeHover(tagName, attributeName, attributeValue, capability, index);
	}
	const title = `**${tagName}.${attributeName}**`;
	const lines = [
		title,
		'',
		`\`${entry.id}\``
	];
	if (entry.label) {
		lines.push('', entry.label);
	}
	if (entry.detail && entry.detail !== entry.id) {
		lines.push('', entry.detail);
	}
	return createMarkdownHover(lines.join('\n'));
}

function createLocalSemanticAttributeHover(
	tagName: string,
	attributeName: string,
	attributeValue: string,
	capability: string,
	index: GuideNhWorkspaceIndex | undefined
): Hover | undefined {
	if (!index) {
		return undefined;
	}
	const page = capability === 'items'
		? index.findItemReference(attributeValue)
		: capability === 'ores'
			? index.findOreReference(attributeValue)
			: undefined;
	if (!page) {
		return undefined;
	}
	const title = `**${tagName}.${attributeName}**`;
	const semanticKind = capability === 'items'
		? 'GuideNH item id'
		: capability === 'ores'
			? 'GuideNH ore id'
			: undefined;
	if (!semanticKind) {
		return undefined;
	}
	return createMarkdownHover([
		title,
		'',
		`\`${attributeValue}\``,
		'',
		semanticKind,
		'',
		`Defined in ${page.relativePath}`
	].join('\n'));
}

export function resolveFrontmatterRuntimeHoverCapability(path: string): string | undefined {
	return resolveFrontmatterRuntimeCapability(path);
}

function createMarkdownHover(value: string): Hover {
	return {
		contents: {
			kind: MarkupKind.Markdown,
			value
		}
	};
}
