import { Definition, Location, Position, Range } from 'vscode-languageserver/node';
import { GuideNhWorkspaceIndex } from '../index/workspaceIndex';

export function createGuideNhDefinition(text: string, offset: number, index: GuideNhWorkspaceIndex): Definition | undefined {
	const target = findPageTargetAtOffset(text, offset);
	if (!target) {
		return undefined;
	}
	const page = index.findPageByRelativePath(target);
	if (!page) {
		return undefined;
	}
	return Location.create(page.uri, Range.create(Position.create(0, 0), Position.create(0, 0)));
}

function findPageTargetAtOffset(text: string, offset: number): string | undefined {
	return findMarkdownLinkTarget(text, offset) ?? findNavigationParentTarget(text, offset) ?? findLinksToTarget(text, offset);
}

function findMarkdownLinkTarget(text: string, offset: number): string | undefined {
	return findTargetWithPattern(text, offset, /\[[^\]]+\]\(([^)]+\.md(?:#[^)]+)?)\)/g);
}

function findNavigationParentTarget(text: string, offset: number): string | undefined {
	return findTargetWithPattern(text, offset, /^\s{2,}parent:\s*([^\s#]+\.md(?:#[^\s]+)?)/gm);
}

function findLinksToTarget(text: string, offset: number): string | undefined {
	return findTargetWithPattern(text, offset, /\blinksTo\s*=\s*(?:"([^"]+)"|'([^']+)'|\{([^}]+)\}|([^\s"'=<>`]+))/g);
}

function findTargetWithPattern(text: string, offset: number, pattern: RegExp): string | undefined {
	let match: RegExpExecArray | null;
	while ((match = pattern.exec(text)) !== null) {
		const rawTarget = match.slice(1).find((value) => value !== undefined);
		if (!rawTarget) {
			continue;
		}
		const targetStart = match.index + match[0].indexOf(rawTarget);
		const targetEnd = targetStart + rawTarget.length;
		if (offset >= targetStart && offset <= targetEnd) {
			return normalizePageReference(rawTarget);
		}
	}
	return undefined;
}

function normalizePageReference(value: string): string | undefined {
	const withoutAnchor = value.trim().split('#')[0];
	if (!withoutAnchor || !withoutAnchor.endsWith('.md')) {
		return undefined;
	}
	const withoutNamespace = withoutAnchor.includes(':') ? withoutAnchor.slice(withoutAnchor.indexOf(':') + 1) : withoutAnchor;
	return withoutNamespace.replace(/^\.\//, '').replace(/^\//, '');
}
