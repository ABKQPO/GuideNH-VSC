import { Definition, Location, Position, Range } from 'vscode-languageserver/node';
import { GuideNhWorkspaceIndex } from '../index/workspaceIndex';

export function createGuideNhDefinition(text: string, offset: number, index: GuideNhWorkspaceIndex): Definition | undefined {
	const target = findMarkdownLinkTarget(text, offset);
	if (!target) {
		return undefined;
	}
	const page = index.findPageByRelativePath(target);
	if (!page) {
		return undefined;
	}
	return Location.create(page.uri, Range.create(Position.create(0, 0), Position.create(0, 0)));
}

function findMarkdownLinkTarget(text: string, offset: number): string | undefined {
	const pattern = /\[[^\]]+\]\(([^)]+\.md)(?:#[^)]+)?\)/g;
	let match: RegExpExecArray | null;
	while ((match = pattern.exec(text)) !== null) {
		const targetStart = match.index + match[0].indexOf(match[1]);
		const targetEnd = targetStart + match[1].length;
		if (offset >= targetStart && offset <= targetEnd) {
			return match[1];
		}
	}
	return undefined;
}
