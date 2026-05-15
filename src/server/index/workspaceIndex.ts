import { findPageReferences } from '../navigation/pageReferences';

export interface GuideNhIndexedPage {
	uri: string;
	relativePath: string;
	itemIds: string[];
	links: string[];
}

export class GuideNhWorkspaceIndex {
	private readonly pages = new Map<string, GuideNhIndexedPage>();
	private readonly pageUriByRelativePath = new Map<string, string>();
	private readonly sourceUrisByLinkedPage = new Map<string, Set<string>>();

	updatePage(uri: string, text: string): void {
		this.removePage(uri);
		const relativePath = resolveGuideNhRelativePath(uri);
		const itemIds = Array.from(text.matchAll(/^\s*-\s+([A-Za-z0-9_.-]+:[A-Za-z0-9_./*-]+)/gm)).map((match) => match[1]);
		const links = extractPageLinks(text);
		this.pages.set(uri, { uri, relativePath, itemIds, links });
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

function resolveGuideNhRelativePath(uri: string): string {
	const normalized = uri.replace(/\\/g, '/');
	const localeMatch = normalized.match(/\/guidenh\/_[a-z]{2}_[a-z]{2}\/(.+\.md)$/i);
	if (localeMatch) {
		return decodeURIComponent(localeMatch[1]);
	}
	const fileName = normalized.slice(normalized.lastIndexOf('/') + 1);
	return decodeURIComponent(fileName);
}
