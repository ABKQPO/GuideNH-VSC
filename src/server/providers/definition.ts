import { Definition, Location, Position, Range } from 'vscode-languageserver/node';
import { GuideNhResourceIndex } from '../index/resourceIndex';
import { GuideNhWorkspaceIndex } from '../index/workspaceIndex';
import { createGuideNhDocumentModel, findReferenceAtOffset, findTagContextAtOffset } from '../parser/documentModel';
import { findIndexedFrontmatterValueAtOffset } from '../parser/frontmatterIndexing';
import { resolveRuntimeAttributeSource } from '../runtime/runtimeAttributeSources';

export function createGuideNhDefinition(
	text: string,
	offset: number,
	index: GuideNhWorkspaceIndex,
	resourceIndex?: GuideNhResourceIndex,
	documentUri?: string,
	preferredLocale?: string
): Definition | undefined {
	const frontmatterDefinition = resolveIndexedFrontmatterValueDefinition(text, offset, index);
	if (frontmatterDefinition) {
		return frontmatterDefinition;
	}
	const model = createGuideNhDocumentModel(text, documentUri);
	const reference = findReferenceAtOffset(model, offset);
	if (!reference) {
		return resolveRuntimeAttributeDefinition(model, offset, index);
	}
	if (reference.kind === 'page') {
		const page = reference.normalizedTarget ? index.findPageByRelativePathForLocale(reference.normalizedTarget, preferredLocale) : undefined;
		if (!page) {
			return undefined;
		}
		return Location.create(page.uri, Range.create(Position.create(0, 0), Position.create(0, 0)));
	}
	const resource = reference.normalizedTarget && resourceIndex
		? resourceIndex.findResourceByRelativePath(reference.normalizedTarget)
		: undefined;
	if (!resource) {
		return undefined;
	}
	return Location.create(resource.uri, Range.create(Position.create(0, 0), Position.create(0, 0)));
}

function resolveIndexedFrontmatterValueDefinition(
	text: string,
	offset: number,
	index: GuideNhWorkspaceIndex
): Definition | undefined {
	const context = findIndexedFrontmatterValueAtOffset(text, offset);
	if (!context) {
		return undefined;
	}
	const target = context.path === 'item_id' || context.path === 'item_ids'
		? index.findItemReference(context.value)
		: context.path === 'ore_ids'
			? index.findOreReference(context.value)
			: undefined;
	if (!target) {
		return undefined;
	}
	return Location.create(target.uri, Range.create(Position.create(0, 0), Position.create(0, 0)));
}

function resolveRuntimeAttributeDefinition(
	model: ReturnType<typeof createGuideNhDocumentModel>,
	offset: number,
	index: GuideNhWorkspaceIndex
): Definition | undefined {
	const tagContext = findTagContextAtOffset(model, offset);
	const attributeName = tagContext?.attribute?.name;
	const attributeValue = tagContext?.attribute?.value;
	if (!tagContext || !attributeName || !attributeValue) {
		return undefined;
	}
	const source = resolveRuntimeAttributeSource(tagContext.tag.name, attributeName);
	if (!source) {
		return undefined;
	}
	const target = source.capability === 'items'
		? index.findItemReference(attributeValue)
		: source.capability === 'ores'
			? index.findOreReference(attributeValue)
			: undefined;
	if (!target) {
		return undefined;
	}
	return Location.create(target.uri, Range.create(Position.create(0, 0), Position.create(0, 0)));
}
