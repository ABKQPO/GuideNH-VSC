import { Definition, Location, Position, Range } from 'vscode-languageserver/node';
import { GuideNhWorkspaceIndex } from '../index/workspaceIndex';
import { findPageReferenceAtOffset } from '../navigation/pageReferences';

export function createGuideNhDefinition(text: string, offset: number, index: GuideNhWorkspaceIndex): Definition | undefined {
	const reference = findPageReferenceAtOffset(text, offset);
	if (!reference) {
		return undefined;
	}
	const page = index.findPageByRelativePath(reference.target);
	if (!page) {
		return undefined;
	}
	return Location.create(page.uri, Range.create(Position.create(0, 0), Position.create(0, 0)));
}
