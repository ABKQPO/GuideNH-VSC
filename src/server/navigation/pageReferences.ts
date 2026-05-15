export interface PageReference {
	target: string;
	start: number;
	end: number;
}

export function findPageReferenceAtOffset(text: string, offset: number): PageReference | undefined {
	return findPageReferences(text).find((reference) => offset >= reference.start && offset <= reference.end);
}

export function findPageReferences(text: string): PageReference[] {
	return [
		...findReferencesWithPattern(text, /\[[^\]]+\]\(([^)]+\.md(?:#[^)]+)?)\)/g),
		...findReferencesWithPattern(text, /^\s{2,}parent:\s*([^\s#]+\.md(?:#[^\s]+)?)/gm),
		...findReferencesWithPattern(text, /\blinksTo\s*=\s*(?:"([^"]+)"|'([^']+)'|\{([^}]+)\}|([^\s"'=<>`]+))/g)
	];
}

export function normalizePageReference(value: string | undefined): string | undefined {
	const withoutAnchor = value?.trim().split('#')[0];
	if (!withoutAnchor || !withoutAnchor.endsWith('.md')) {
		return undefined;
	}
	const withoutNamespace = withoutAnchor.includes(':') ? withoutAnchor.slice(withoutAnchor.indexOf(':') + 1) : withoutAnchor;
	return withoutNamespace.replace(/^\.\//, '').replace(/^\//, '');
}

function findReferencesWithPattern(text: string, pattern: RegExp): PageReference[] {
	const references: PageReference[] = [];
	let match: RegExpExecArray | null;
	while ((match = pattern.exec(text)) !== null) {
		const rawTarget = match.slice(1).find((value) => value !== undefined);
		const target = normalizePageReference(rawTarget);
		if (!rawTarget || !target) {
			continue;
		}
		const start = match.index + match[0].indexOf(rawTarget);
		references.push({
			target,
			start,
			end: start + rawTarget.length
		});
	}
	return references;
}
