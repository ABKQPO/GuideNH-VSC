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

	updatePage(uri: string, text: string): void {
		this.removePage(uri);
		const relativePath = resolveGuideNhRelativePath(uri);
		const frontmatterValues = extractIndexedFrontmatterValues(text);
		const itemIds = frontmatterValues.item_ids ?? [];
		const links = extractPageLinks(text);
		this.pages.set(uri, { uri, relativePath, itemIds, frontmatterValues, links });
		this.pageUriByRelativePath.set(relativePath, uri);
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
		return Array.from(this.pages.values()).sort((left, right) => left.relativePath.localeCompare(right.relativePath));
	}

	listFrontmatterValues(path: string): string[] {
		const values = new Set<string>();
		for (const page of this.pages.values()) {
			for (const value of page.frontmatterValues[path] ?? []) {
				values.add(value);
			}
		}
		return Array.from(values).sort((left, right) => left.localeCompare(right));
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
