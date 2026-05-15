export interface GuideNhIndexedPage {
	uri: string;
	relativePath: string;
	itemIds: string[];
	links: string[];
}

export class GuideNhWorkspaceIndex {
	private readonly pages = new Map<string, GuideNhIndexedPage>();

	updatePage(uri: string, text: string): void {
		const relativePath = uri.slice(uri.lastIndexOf('/') + 1);
		const itemIds = Array.from(text.matchAll(/^\s*-\s+([A-Za-z0-9_.-]+:[A-Za-z0-9_./*-]+)/gm)).map((match) => match[1]);
		const links = Array.from(text.matchAll(/\[[^\]]+\]\(([^)]+\.md(?:#[^)]+)?)\)/g)).map((match) => match[1].split('#')[0]);
		this.pages.set(uri, { uri, relativePath, itemIds, links });
	}

	removePage(uri: string): void {
		this.pages.delete(uri);
	}

	findPageByRelativePath(relativePath: string): GuideNhIndexedPage | undefined {
		const normalized = relativePath.replace(/^\.\//, '');
		return Array.from(this.pages.values()).find((page) => page.relativePath === normalized);
	}

	findItemReference(itemId: string): GuideNhIndexedPage | undefined {
		return Array.from(this.pages.values()).find((page) => page.itemIds.includes(itemId));
	}

	findReferencesToPage(relativePath: string): GuideNhIndexedPage[] {
		const normalized = relativePath.replace(/^\.\//, '');
		return Array.from(this.pages.values()).filter((page) => page.links.includes(normalized));
	}
}
