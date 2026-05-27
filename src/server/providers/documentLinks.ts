import { DocumentLink, Position, Range } from 'vscode-languageserver/node';
import { GuideNhWorkspaceIndex } from '../index/workspaceIndex';
import { createGuideNhDocumentModel } from '../parser/documentModel';

export function createGuideNhDocumentLinks(
	text: string,
	documentUri: string,
	index: GuideNhWorkspaceIndex,
	preferredLocale?: string
): DocumentLink[] {
	const model = createGuideNhDocumentModel(text, documentUri);
	return model.references
		.filter((reference) => reference.kind === 'page' && reference.normalizedTarget)
		.map((reference) => {
			const page = index.findPageByRelativePathForLocale(String(reference.normalizedTarget), preferredLocale);
			if (!page) {
				return undefined;
			}
			return DocumentLink.create(
				Range.create(
					offsetToPosition(text, reference.interactionStart ?? reference.start),
					offsetToPosition(text, reference.interactionEnd ?? reference.end)
				),
				page.uri
			);
		})
		.filter((link): link is DocumentLink => link !== undefined);
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
