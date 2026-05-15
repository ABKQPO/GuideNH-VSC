import { Hover, MarkupKind } from 'vscode-languageserver/node';
import { GuideNhSchemaBundle } from '../../common/schema';

export function createGuideNhHover(text: string, offset: number, schema: GuideNhSchemaBundle): Hover | undefined {
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
	const tagSchema = schema.tags.tags[tagMatch[1]];
	if (!tagSchema) {
		return undefined;
	}
	return {
		contents: {
			kind: MarkupKind.Markdown,
			value: `**${tagSchema.name}**\n\n${tagSchema.description}`
		}
	};
}
