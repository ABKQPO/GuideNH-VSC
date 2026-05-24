import { extractFrontmatter } from './frontmatter';

export interface GuideNhIndexedFrontmatterValueContext {
	path: string;
	value: string;
	start: number;
	end: number;
}

export function extractIndexedFrontmatterValues(text: string): Record<string, string[]> {
	const frontmatter = extractFrontmatter(text);
	if (!frontmatter) {
		return {};
	}
	const values: Record<string, string[]> = {};
	let currentPath: string | undefined;
	for (const line of frontmatter.text.split(/\r?\n/)) {
		const keyMatch = line.match(/^(\s*)([A-Za-z_][\w.-]*)\s*:\s*$/);
		if (keyMatch) {
			currentPath = resolveIndexedFrontmatterPath(keyMatch[1].length, keyMatch[2]);
			continue;
		}
		const itemMatch = line.match(/^\s*-\s+(.+?)\s*$/);
		if (!itemMatch || !currentPath) {
			continue;
		}
		const normalized = normalizeIndexedFrontmatterValue(currentPath, itemMatch[1]);
		if (!normalized) {
			continue;
		}
		const existing = values[currentPath] ?? [];
		existing.push(normalized);
		values[currentPath] = existing;
	}
	return values;
}

export function findIndexedFrontmatterValueAtOffset(text: string, offset: number): GuideNhIndexedFrontmatterValueContext | undefined {
	const frontmatter = extractFrontmatter(text);
	if (!frontmatter || offset > frontmatter.end) {
		return undefined;
	}
	let currentPath: string | undefined;
	let lineStart = 0;
	for (const line of frontmatter.text.split(/\r?\n/)) {
		const keyMatch = line.match(/^(\s*)([A-Za-z_][\w.-]*)\s*:\s*$/);
		if (keyMatch) {
			currentPath = resolveIndexedFrontmatterPath(keyMatch[1].length, keyMatch[2]);
			lineStart += line.length + 1;
			continue;
		}
		const itemMatch = line.match(/^(\s*-\s+)(.+?)(\s*)$/);
		if (!itemMatch || !currentPath) {
			lineStart += line.length + 1;
			continue;
		}
		const rawValue = itemMatch[2];
		const normalizedValue = normalizeIndexedFrontmatterValue(currentPath, rawValue);
		const valueStart = lineStart + itemMatch[1].length;
		const valueEnd = valueStart + rawValue.length;
		if (normalizedValue && offset >= valueStart && offset <= valueEnd) {
			return {
				path: currentPath,
				value: normalizedValue,
				start: valueStart,
				end: valueEnd
			};
		}
		lineStart += line.length + 1;
	}
	return undefined;
}

function resolveIndexedFrontmatterPath(indent: number, key: string): string {
	if (indent > 0 && key === 'required_mods') {
		return 'navigation.required_mods';
	}
	return key;
}

function normalizeIndexedFrontmatterValue(path: string, value: string): string {
	const normalized = value.replace(/^['"]|['"]$/g, '').trim();
	if (!normalized) {
		return '';
	}
	if (path !== 'categories') {
		return normalized;
	}
	const separatorIndex = normalized.indexOf('|');
	return (separatorIndex >= 0 ? normalized.slice(0, separatorIndex) : normalized).trim();
}
