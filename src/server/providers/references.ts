import { Location, Position, Range } from 'vscode-languageserver/node';
import { GuideNhWorkspaceIndex } from '../index/workspaceIndex';
import { createGuideNhDocumentModel, findReferenceAtOffset, findTagContextAtOffset } from '../parser/documentModel';
import { findIndexedFrontmatterValueAtOffset } from '../parser/frontmatterIndexing';
import { resolveRuntimeAttributeSource } from '../runtime/runtimeAttributeSources';
import { resolveGuideNhPageId } from '../index/guideNhPaths';

export function createGuideNhReferences(
	text: string,
	offset: number,
	fallbackTarget: string,
	index: GuideNhWorkspaceIndex,
	documentUri?: string
): Location[] {
	const frontmatterValueReferences = findIndexedFrontmatterValueReferences(text, offset, index);
	if (frontmatterValueReferences.length > 0) {
		return frontmatterValueReferences.map((page) => Location.create(page.uri, Range.create(Position.create(0, 0), Position.create(0, 0))));
	}
	const model = createGuideNhDocumentModel(text, documentUri);
	const fallbackPageId = documentUri ? resolveGuideNhPageId(documentUri) : fallbackTarget;
	const reference = findReferenceAtOffset(model, offset);
	const runtimeAttributeReferences = reference ? [] : findRuntimeAttributeReferences(model, offset, index);
	const locations = (reference
		? reference.kind === 'resource'
			? reference.normalizedTarget ? index.findReferencesToResource(reference.normalizedTarget) : []
			: index.findReferencesToPage(reference.normalizedTarget ?? fallbackPageId)
		: runtimeAttributeReferences.length > 0
			? runtimeAttributeReferences
			: index.findReferencesToPage(fallbackPageId))
		.map((page) => Location.create(page.uri, Range.create(Position.create(0, 0), Position.create(0, 0))));
	return deduplicateLocations(locations);
}

function findIndexedFrontmatterValueReferences(
	text: string,
	offset: number,
	index: GuideNhWorkspaceIndex
) {
	const context = findIndexedFrontmatterValueAtOffset(text, offset);
	if (!context) {
		return [];
	}
	if (context.path === 'item_id' || context.path === 'item_ids') {
		return index.findReferencesToItem(context.value);
	}
	if (context.path === 'ore_ids') {
		return index.findReferencesToOre(context.value);
	}
	return [];
}

function findRuntimeAttributeReferences(
	model: ReturnType<typeof createGuideNhDocumentModel>,
	offset: number,
	index: GuideNhWorkspaceIndex
) {
	const tagContext = findTagContextAtOffset(model, offset);
	const attributeName = tagContext?.attribute?.name;
	const attributeValue = tagContext?.attribute?.value;
	if (!tagContext || !attributeName || !attributeValue) {
		return [];
	}
	const source = resolveRuntimeAttributeSource(tagContext.tag.name, attributeName);
	if (!source) {
		return [];
	}
	if (source.capability === 'items') {
		return index.findReferencesToItem(attributeValue);
	}
	if (source.capability === 'ores') {
		return index.findReferencesToOre(attributeValue);
	}
	return [];
}

function deduplicateLocations(locations: Location[]): Location[] {
	const seen = new Set<string>();
	return locations.filter((location) => {
		if (seen.has(location.uri)) {
			return false;
		}
		seen.add(location.uri);
		return true;
	});
}
