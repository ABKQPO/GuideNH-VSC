import { Definition, Location, Position, Range } from 'vscode-languageserver/node';
import { GuideNhWorkspaceIndex } from '../index/workspaceIndex';

export function createGuideNhDefinition(target: string, index: GuideNhWorkspaceIndex): Definition | undefined {
	const page = index.findPageByRelativePath(target);
	if (!page) {
		return undefined;
	}
	return Location.create(page.uri, Range.create(Position.create(0, 0), Position.create(0, 0)));
}
