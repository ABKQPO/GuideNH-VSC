import { CompletionItem, CompletionItemKind } from 'vscode-languageserver/node';
import { GuideNhSchemaBundle } from '../../common/schema';
import { SemanticCache } from '../runtime/semanticCache';

function findOpenTagPrefix(text: string, offset: number): string | undefined {
	const before = text.slice(0, offset);
	const match = before.match(/<([A-Z][A-Za-z0-9]*)?\s*[^<>]*$/);
	return match?.[1] ?? '';
}

export function createGuideNhCompletions(
	text: string,
	offset: number,
	schema: GuideNhSchemaBundle,
	parentTag: string | undefined,
	cache?: SemanticCache
): CompletionItem[] {
	const attributeValueMatch = text.slice(0, offset).match(/([A-Za-z_][\w.-]*)=["']([^"']*)$/);
	if (attributeValueMatch && cache) {
		const capability = resolveRuntimeCapability(attributeValueMatch[1]);
		if (capability) {
			return cache.queryPrefix(capability, attributeValueMatch[2]).map((entry) => ({
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
		const allowed = parentTag ? schema.tags.tags[parentTag]?.children : undefined;
		return Object.values(schema.tags.tags)
			.filter((tag) => !allowed || allowed.includes(tag.name))
			.map((tag) => ({
				label: tag.name,
				kind: CompletionItemKind.Class,
				detail: tag.kind,
				documentation: tag.description
			}));
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

function resolveRuntimeCapability(attributeName: string): string | undefined {
	if (attributeName === 'id') {
		return 'items';
	}
	if (attributeName === 'ore') {
		return 'ores';
	}
	return undefined;
}
