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
		const scalarMatch = line.match(/^(\s*)(item_id|required_mod)\s*:\s*(.+?)\s*$/);
		const scalarPath = scalarMatch ? resolveIndexedFrontmatterScalarPath(scalarMatch[1].length, scalarMatch[2]) : undefined;
		if (scalarMatch && scalarPath) {
			const normalized = normalizeIndexedFrontmatterValue(scalarMatch[2], scalarMatch[3]);
			if (normalized) {
				const existing = values[scalarPath] ?? [];
				existing.push(normalized);
				values[scalarPath] = existing;
			}
			currentPath = undefined;
			continue;
		}
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
		const scalarMatch = line.match(/^(\s*)(item_id|required_mod)\s*:\s*(.+?)\s*$/);
		const scalarPath = scalarMatch ? resolveIndexedFrontmatterScalarPath(scalarMatch[1].length, scalarMatch[2]) : undefined;
		if (scalarMatch && scalarPath) {
			const rawValue = scalarMatch[3];
			const valueStart = lineStart + scalarMatch[0].indexOf(rawValue);
			const valueEnd = valueStart + rawValue.length;
			const normalizedValue = normalizeIndexedFrontmatterValue(scalarMatch[2], rawValue);
			if (normalizedValue && offset >= valueStart && offset <= valueEnd) {
				return {
					path: scalarPath,
					value: normalizedValue,
					start: valueStart,
					end: valueEnd
				};
			}
			lineStart += line.length + 1;
			continue;
		}
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

const NestedNavigationListPaths = new Map<string, string>([
	['required_mods', 'navigation.required_mods'],
	['excluded_mods', 'navigation.excluded_mods'],
	['icons', 'navigation.icons'],
	['icon_textures', 'navigation.icon_textures']
]);

const NestedNavigationScalarPaths = new Map<string, string>([
	['required_mod', 'navigation.required_mod'],
	['excluded_mod', 'navigation.excluded_mod']
]);

function resolveIndexedFrontmatterPath(indent: number, key: string): string {
	if (indent > 0) {
		return NestedNavigationListPaths.get(key) ?? key;
	}
	return key;
}

function resolveIndexedFrontmatterScalarPath(indent: number, key: string): string | undefined {
	if (indent === 0 && key === 'item_id') {
		return key;
	}
	return indent > 0 ? NestedNavigationScalarPaths.get(key) : undefined;
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
