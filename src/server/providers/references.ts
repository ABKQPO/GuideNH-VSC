import { Location, Position, Range } from 'vscode-languageserver/node';
import { GuideNhWorkspaceIndex } from '../index/workspaceIndex';

export function createGuideNhReferences(target: string, index: GuideNhWorkspaceIndex): Location[] {
	return index
		.findReferencesToPage(target)
		.map((page) => Location.create(page.uri, Range.create(Position.create(0, 0), Position.create(0, 0))));
}
