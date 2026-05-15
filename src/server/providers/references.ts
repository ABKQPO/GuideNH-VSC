import { Location, Position, Range } from 'vscode-languageserver/node';
import { GuideNhWorkspaceIndex } from '../index/workspaceIndex';
import { findPageReferenceAtOffset } from '../navigation/pageReferences';

export function createGuideNhReferences(text: string, offset: number, fallbackTarget: string, index: GuideNhWorkspaceIndex): Location[] {
	const target = findPageReferenceAtOffset(text, offset)?.target ?? fallbackTarget;
	return index
		.findReferencesToPage(target)
		.map((page) => Location.create(page.uri, Range.create(Position.create(0, 0), Position.create(0, 0))));
}
