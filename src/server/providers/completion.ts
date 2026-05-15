import { CompletionItem, CompletionItemKind } from 'vscode-languageserver/node';
import { GuideNhSchemaBundle } from '../../common/schema';

function findOpenTagPrefix(text: string, offset: number): string | undefined {
	const before = text.slice(0, offset);
	const match = before.match(/<([A-Z][A-Za-z0-9]*)?\s*[^<>]*$/);
	return match?.[1] ?? '';
}

export function createGuideNhCompletions(
	text: string,
	offset: number,
	schema: GuideNhSchemaBundle,
	parentTag: string | undefined
): CompletionItem[] {
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
