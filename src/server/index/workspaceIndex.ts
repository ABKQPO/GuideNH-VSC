import { findPageReferences } from '../navigation/pageReferences';
import { extractFrontmatter } from '../parser/frontmatter';

export interface GuideNhIndexedPage {
	uri: string;
	relativePath: string;
	itemIds: string[];
	frontmatterValues: Record<string, string[]>;
	links: string[];
}

export class GuideNhWorkspaceIndex {
	private readonly pages = new Map<string, GuideNhIndexedPage>();
	private readonly pageUriByRelativePath = new Map<string, string>();
	private readonly sourceUrisByLinkedPage = new Map<string, Set<string>>();
	private readonly valueCountsByFrontmatterPath = new Map<string, Map<string, number>>();
	private sortedPages: GuideNhIndexedPage[] = [];
	private sortedPagesDirty = true;
	private readonly sortedFrontmatterValues = new Map<string, string[]>();
	private readonly dirtyFrontmatterPaths = new Set<string>();

	updatePage(uri: string, text: string): void {
		this.removePage(uri);
		const relativePath = resolveGuideNhRelativePath(uri);
		const frontmatterValues = extractIndexedFrontmatterValues(text);
		const itemIds = frontmatterValues.item_ids ?? [];
		const links = extractPageLinks(text);
		this.pages.set(uri, { uri, relativePath, itemIds, frontmatterValues, links });
		this.pageUriByRelativePath.set(relativePath, uri);
		this.sortedPagesDirty = true;
		this.addFrontmatterValues(frontmatterValues);
		for (const link of links) {
			this.addPageReference(link, uri);
		}
	}

	removePage(uri: string): void {
		const page = this.pages.get(uri);
		if (!page) {
			return;
		}
		this.pages.delete(uri);
		this.pageUriByRelativePath.delete(page.relativePath);
		this.sortedPagesDirty = true;
		this.removeFrontmatterValues(page.frontmatterValues);
		for (const link of page.links) {
			this.removePageReference(link, uri);
		}
	}

	findPageByRelativePath(relativePath: string): GuideNhIndexedPage | undefined {
		const normalized = relativePath.replace(/^\.\//, '');
		const uri = this.pageUriByRelativePath.get(normalized);
		return uri ? this.pages.get(uri) : undefined;
	}

	findItemReference(itemId: string): GuideNhIndexedPage | undefined {
		return Array.from(this.pages.values()).find((page) => page.itemIds.includes(itemId));
	}

	listPages(): GuideNhIndexedPage[] {
		if (this.sortedPagesDirty) {
			this.sortedPages = Array.from(this.pages.values()).sort((left, right) => {
				return left.relativePath.localeCompare(right.relativePath);
			});
			this.sortedPagesDirty = false;
		}
		return this.sortedPages.slice();
	}

	listFrontmatterValues(path: string): string[] {
		if (this.dirtyFrontmatterPaths.has(path) || !this.sortedFrontmatterValues.has(path)) {
			this.sortedFrontmatterValues.set(path, Array.from(this.valueCountsByFrontmatterPath.get(path)?.keys() ?? []).sort((left, right) => {
				return left.localeCompare(right);
			}));
			this.dirtyFrontmatterPaths.delete(path);
		}
		return this.sortedFrontmatterValues.get(path)?.slice() ?? [];
	}

	findReferencesToPage(relativePath: string): GuideNhIndexedPage[] {
		const normalized = relativePath.replace(/^\.\//, '');
		return Array.from(this.sourceUrisByLinkedPage.get(normalized) ?? [])
			.map((uri) => this.pages.get(uri))
			.filter((page): page is GuideNhIndexedPage => page !== undefined);
	}

	private addPageReference(relativePath: string, sourceUri: string): void {
		const normalized = relativePath.replace(/^\.\//, '');
		const sourceUris = this.sourceUrisByLinkedPage.get(normalized) ?? new Set<string>();
		sourceUris.add(sourceUri);
		this.sourceUrisByLinkedPage.set(normalized, sourceUris);
	}

	private removePageReference(relativePath: string, sourceUri: string): void {
		const normalized = relativePath.replace(/^\.\//, '');
		const sourceUris = this.sourceUrisByLinkedPage.get(normalized);
		if (!sourceUris) {
			return;
		}
		sourceUris.delete(sourceUri);
		if (sourceUris.size === 0) {
			this.sourceUrisByLinkedPage.delete(normalized);
		}
	}

	private addFrontmatterValues(values: Record<string, string[]>): void {
		for (const [path, pathValues] of Object.entries(values)) {
			const counts = this.valueCountsByFrontmatterPath.get(path) ?? new Map<string, number>();
			for (const value of pathValues) {
				counts.set(value, (counts.get(value) ?? 0) + 1);
			}
			this.valueCountsByFrontmatterPath.set(path, counts);
			this.dirtyFrontmatterPaths.add(path);
		}
	}

	private removeFrontmatterValues(values: Record<string, string[]>): void {
		for (const [path, pathValues] of Object.entries(values)) {
			const counts = this.valueCountsByFrontmatterPath.get(path);
			if (!counts) {
				continue;
			}
			for (const value of pathValues) {
				const count = counts.get(value) ?? 0;
				if (count <= 1) {
					counts.delete(value);
				} else {
					counts.set(value, count - 1);
				}
			}
			if (counts.size === 0) {
				this.valueCountsByFrontmatterPath.delete(path);
			}
			this.dirtyFrontmatterPaths.add(path);
		}
	}
}

function extractPageLinks(text: string): string[] {
	return Array.from(new Set(findPageReferences(text).map((reference) => reference.target)));
}

function extractIndexedFrontmatterValues(text: string): Record<string, string[]> {
	const frontmatter = extractFrontmatter(text);
	if (!frontmatter) {
		return {};
	}
	const values: Record<string, string[]> = {};
	let currentPath: string | undefined;
	for (const line of frontmatter.text.split(/\r?\n/)) {
		const keyMatch = line.match(/^(\s*)([A-Za-z_][\w.-]*)\s*:\s*$/);
		if (keyMatch) {
			const path = resolveIndexedFrontmatterPath(keyMatch[1].length, keyMatch[2]);
			currentPath = path;
			continue;
		}
		const itemMatch = line.match(/^\s*-\s+(.+?)\s*$/);
		if (!itemMatch || !currentPath) {
			continue;
		}
		const normalized = normalizeIndexedFrontmatterValue(itemMatch[1]);
		if (!normalized) {
			continue;
		}
		const existing = values[currentPath] ?? [];
		existing.push(normalized);
		values[currentPath] = existing;
	}
	return values;
}

function resolveIndexedFrontmatterPath(indent: number, key: string): string {
	if (indent > 0 && key === 'required_mods') {
		return 'navigation.required_mods';
	}
	return key;
}

function normalizeIndexedFrontmatterValue(value: string): string {
	return value.replace(/^['"]|['"]$/g, '').trim();
}

function resolveGuideNhRelativePath(uri: string): string {
	const normalized = uri.replace(/\\/g, '/');
	const localeMatch = normalized.match(/\/guidenh\/_[a-z]{2}_[a-z]{2}\/(.+\.md)$/i);
	if (localeMatch) {
		return decodeURIComponent(localeMatch[1]);
	}
	const fileName = normalized.slice(normalized.lastIndexOf('/') + 1);
	return decodeURIComponent(fileName);
}
