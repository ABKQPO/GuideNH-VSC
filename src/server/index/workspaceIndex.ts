import * as path from 'path';
import { createGuideNhDocumentModel, GuideNhDocumentModel } from '../parser/documentModel';
import { extractIndexedFrontmatterValues } from '../parser/frontmatterIndexing';
import { resolveRuntimeAttributeSource } from '../runtime/runtimeAttributeSources';
import { normalizeGuideNhLocale, normalizeGuideNhReferencePath, resolveGuideNhDocumentLocation } from './guideNhPaths';

export interface GuideNhIndexedPage {
	uri: string;
	relativePath: string;
	pageId: string;
	namespace?: string;
	locale?: string;
	itemIds: string[];
	oreIds: string[];
	frontmatterValues: Record<string, string[]>;
	links: string[];
	resourceLinks: string[];
	itemLinks: string[];
	oreLinks: string[];
	anchors: string[];
}

export interface GuideNhPageReference {
	page: GuideNhIndexedPage;
	value: string;
}

export class GuideNhWorkspaceIndex {
	private readonly pages = new Map<string, GuideNhIndexedPage>();
	private readonly pageUrisByRelativePath = new Map<string, Set<string>>();
	private readonly pageUrisByPrefixAlias = new Map<string, Set<string>>();
	private readonly pageUrisByItemId = new Map<string, Set<string>>();
	private readonly pageUrisByOreId = new Map<string, Set<string>>();
	private readonly sourceUrisByLinkedPage = new Map<string, Set<string>>();
	private readonly sourceUrisByLinkedResource = new Map<string, Set<string>>();
	private readonly sourceUrisByLinkedItem = new Map<string, Set<string>>();
	private readonly sourceUrisByLinkedOre = new Map<string, Set<string>>();
	private readonly valueCountsByFrontmatterPath = new Map<string, Map<string, number>>();
	private readonly namespaceCounts = new Map<string, number>();
	private sortedPages: GuideNhIndexedPage[] = [];
	private sortedPageKeys: string[] = [];
	private sortedPagesDirty = true;
	private readonly sortedFrontmatterValues = new Map<string, string[]>();
	private readonly dirtyFrontmatterPaths = new Set<string>();
	private sortedNamespaces: string[] = [];
	private namespacesDirty = true;

	updatePage(uri: string, text: string): void {
		this.removePage(uri);
		const location = resolveGuideNhDocumentLocation(uri);
		const frontmatterValues = extractIndexedFrontmatterValues(text);
		const model = createGuideNhDocumentModel(text, uri);
		const anchors = extractMarkdownAnchors(text);
		const itemIds = [
			...(frontmatterValues.item_id ?? []),
			...(frontmatterValues.item_ids ?? [])
		];
		const oreIds = frontmatterValues.ore_ids ?? [];
		const links = extractPageLinks(model);
		const resourceLinks = extractResourceLinks(model);
		const itemLinks = extractSemanticLinks(model, 'items');
		const oreLinks = extractSemanticLinks(model, 'ores');
		this.pages.set(uri, {
			uri,
			relativePath: location.relativePath,
			pageId: location.pageId,
			namespace: location.namespace,
			locale: location.locale,
			itemIds,
			oreIds,
			frontmatterValues,
			links,
			resourceLinks,
			itemLinks,
			oreLinks,
			anchors
		});
		this.addNamespace(location.namespace);
		const pageUris = this.pageUrisByRelativePath.get(location.relativePath) ?? new Set<string>();
		pageUris.add(uri);
		this.pageUrisByRelativePath.set(location.relativePath, pageUris);
		for (const alias of [location.relativePath, location.pageId]) {
			const aliases = this.pageUrisByPrefixAlias.get(alias) ?? new Set<string>();
			aliases.add(uri);
			this.pageUrisByPrefixAlias.set(alias, aliases);
		}
		this.addItemReferences(itemIds, uri);
		this.addOreReferences(oreIds, uri);
		this.sortedPagesDirty = true;
		this.addFrontmatterValues(frontmatterValues);
		for (const link of links) {
			this.addPageReference(link, uri);
		}
		for (const resourceLink of resourceLinks) {
			this.addResourceReference(resourceLink, uri);
		}
		for (const itemLink of itemLinks) {
			this.addItemLink(itemLink, uri);
		}
		for (const oreLink of oreLinks) {
			this.addOreLink(oreLink, uri);
		}
	}

	removePage(uri: string): void {
		const page = this.pages.get(uri);
		if (!page) {
			return;
		}
		this.pages.delete(uri);
		this.removeNamespace(page.namespace);
		const pageUris = this.pageUrisByRelativePath.get(page.relativePath);
		if (pageUris) {
			pageUris.delete(uri);
			if (pageUris.size === 0) {
				this.pageUrisByRelativePath.delete(page.relativePath);
			}
		}
		for (const alias of [page.relativePath, page.pageId]) {
			const aliases = this.pageUrisByPrefixAlias.get(alias);
			if (!aliases) {
				continue;
			}
			aliases.delete(uri);
			if (aliases.size === 0) {
				this.pageUrisByPrefixAlias.delete(alias);
			}
		}
		this.removeItemReferences(page.itemIds, uri);
		this.removeOreReferences(page.oreIds, uri);
		this.sortedPagesDirty = true;
		this.removeFrontmatterValues(page.frontmatterValues);
		for (const link of page.links) {
			this.removePageReference(link, uri);
		}
		for (const resourceLink of page.resourceLinks) {
			this.removeResourceReference(resourceLink, uri);
		}
		for (const itemLink of page.itemLinks) {
			this.removeItemLink(itemLink, uri);
		}
		for (const oreLink of page.oreLinks) {
			this.removeOreLink(oreLink, uri);
		}
	}

	removePagesNotIn(uris: ReadonlySet<string>): void {
		for (const uri of Array.from(this.pages.keys())) {
			if (!uris.has(uri)) {
				this.removePage(uri);
			}
		}
	}

	findPageByRelativePath(relativePath: string): GuideNhIndexedPage | undefined {
		return this.findPageByRelativePathForLocale(relativePath);
	}

	findPageByRelativePathForLocale(relativePath: string, preferredLocale?: string): GuideNhIndexedPage | undefined {
		const normalized = normalizeGuideNhReferencePath(relativePath);
		const directUris = this.pageUrisByPrefixAlias.get(normalized);
		if (directUris && directUris.size > 0) {
			return this.selectPreferredPage(Array.from(directUris), preferredLocale);
		}
		const relativeUris = this.pageUrisByRelativePath.get(normalized);
		if (!relativeUris || relativeUris.size === 0) {
			return undefined;
		}
		return this.selectPreferredPage(Array.from(relativeUris), preferredLocale);
	}

	findItemReference(itemId: string): GuideNhIndexedPage | undefined {
		const uri = this.pageUrisByItemId.get(itemId)?.values().next().value;
		return uri ? this.pages.get(uri) : undefined;
	}

	findOreReference(oreId: string): GuideNhIndexedPage | undefined {
		const uri = this.pageUrisByOreId.get(oreId)?.values().next().value;
		return uri ? this.pages.get(uri) : undefined;
	}

	findPageAnchor(relativePath: string, anchor: string, preferredLocale?: string): GuideNhIndexedPage | undefined {
		const page = this.findPageByRelativePathForLocale(relativePath, preferredLocale);
		if (!page || !page.anchors.includes(normalizeAnchor(anchor))) {
			return undefined;
		}
		return page;
	}

	listPages(): GuideNhIndexedPage[] {
		this.refreshSortedPages();
		return this.sortedPages.slice();
	}

	queryPagesByPrefix(prefix: string, limit = 200): GuideNhIndexedPage[] {
		if (limit <= 0) {
			return [];
		}
		const normalizedPrefix = normalizePagePrefix(prefix);
		if (normalizedPrefix.includes(':')) {
			return this.queryPagesByAliasPrefix(normalizedPrefix, limit);
		}
		this.refreshSortedPages();
		const start = lowerBound(this.sortedPageKeys, normalizedPrefix);
		const matches: GuideNhIndexedPage[] = [];
		for (let index = start; index < this.sortedPages.length && matches.length < limit; index++) {
			const page = this.sortedPages[index];
			if (!page.relativePath.startsWith(normalizedPrefix)) {
				break;
			}
			matches.push(page);
		}
		return matches;
	}

	queryPageReferencesByPrefix(prefix: string, documentUri?: string, limit = 200): GuideNhPageReference[] {
		if (limit <= 0) {
			return [];
		}
		const location = documentUri ? resolveGuideNhDocumentLocation(documentUri) : undefined;
		if (!location?.namespace || prefix.includes(':')) {
			return this.queryPagesByPrefix(prefix, limit).map((page) => ({
				page,
				value: prefix.includes(':') ? page.pageId : page.relativePath
			}));
		}
		const normalizedPrefix = prefix.toLowerCase();
		const references = new Map<string, GuideNhPageReference>();
		for (const page of this.listPages()) {
			if (page.uri === documentUri || page.namespace?.toLowerCase() !== location.namespace.toLowerCase()) {
				continue;
			}
			const value = createRelativePageReference(location.directoryPath, page.relativePath, prefix);
			if (!value.toLowerCase().startsWith(normalizedPrefix)) {
				continue;
			}
			const existing = references.get(value);
			if (!existing || isPreferredPageReference(page, existing.page, location.locale)) {
				references.set(value, { page, value });
			}
		}
		return Array.from(references.values())
			.sort((left, right) => left.value.localeCompare(right.value))
			.slice(0, limit);
	}

	queryModIdsByPrefix(prefix: string, limit = 200): string[] {
		if (limit <= 0) {
			return [];
		}
		this.refreshSortedNamespaces();
		const normalizedPrefix = prefix.toLowerCase();
		const start = lowerBound(this.sortedNamespaces, normalizedPrefix);
		const matches: string[] = [];
		for (let index = start; index < this.sortedNamespaces.length && matches.length < limit; index++) {
			const namespace = this.sortedNamespaces[index];
			if (!namespace.startsWith(normalizedPrefix)) {
				break;
			}
			matches.push(namespace);
		}
		return matches;
	}

	listFrontmatterValues(path: string): string[] {
		this.refreshSortedFrontmatterValues(path);
		return this.sortedFrontmatterValues.get(path)?.slice() ?? [];
	}

	queryFrontmatterValues(path: string, prefix: string, limit = 200): string[] {
		if (limit <= 0) {
			return [];
		}
		this.refreshSortedFrontmatterValues(path);
		const values = this.sortedFrontmatterValues.get(path) ?? [];
		const start = lowerBound(values, prefix);
		const matches: string[] = [];
		for (let index = start; index < values.length && matches.length < limit; index++) {
			const value = values[index];
			if (!value.startsWith(prefix)) {
				break;
			}
			matches.push(value);
		}
		return matches;
	}

	findReferencesToPage(relativePath: string): GuideNhIndexedPage[] {
		const normalized = normalizeGuideNhReferencePath(relativePath);
		const keys = this.collectPageLookupKeys(normalized);
		return this.collectReferencedPagesByKeys(keys, this.sourceUrisByLinkedPage);
	}

	findReferencesToResource(relativePath: string): GuideNhIndexedPage[] {
		const normalized = normalizeGuideNhReferencePath(relativePath);
		const keys = this.collectReferenceLookupKeys(normalized, this.sourceUrisByLinkedResource);
		return this.collectReferencedPagesByKeys(keys, this.sourceUrisByLinkedResource);
	}

	findReferencesToItem(itemId: string): GuideNhIndexedPage[] {
		return this.collectReferencedPages(itemId, this.pageUrisByItemId, this.sourceUrisByLinkedItem);
	}

	findReferencesToOre(oreId: string): GuideNhIndexedPage[] {
		return this.collectReferencedPages(oreId, this.pageUrisByOreId, this.sourceUrisByLinkedOre);
	}

	private addPageReference(relativePath: string, sourceUri: string): void {
		const normalized = normalizeGuideNhReferencePath(relativePath);
		const sourceUris = this.sourceUrisByLinkedPage.get(normalized) ?? new Set<string>();
		sourceUris.add(sourceUri);
		this.sourceUrisByLinkedPage.set(normalized, sourceUris);
	}

	private removePageReference(relativePath: string, sourceUri: string): void {
		const normalized = normalizeGuideNhReferencePath(relativePath);
		const sourceUris = this.sourceUrisByLinkedPage.get(normalized);
		if (!sourceUris) {
			return;
		}
		sourceUris.delete(sourceUri);
		if (sourceUris.size === 0) {
			this.sourceUrisByLinkedPage.delete(normalized);
		}
	}

	private addResourceReference(relativePath: string, sourceUri: string): void {
		const normalized = normalizeGuideNhReferencePath(relativePath);
		const sourceUris = this.sourceUrisByLinkedResource.get(normalized) ?? new Set<string>();
		sourceUris.add(sourceUri);
		this.sourceUrisByLinkedResource.set(normalized, sourceUris);
	}

	private removeResourceReference(relativePath: string, sourceUri: string): void {
		const normalized = normalizeGuideNhReferencePath(relativePath);
		const sourceUris = this.sourceUrisByLinkedResource.get(normalized);
		if (!sourceUris) {
			return;
		}
		sourceUris.delete(sourceUri);
		if (sourceUris.size === 0) {
			this.sourceUrisByLinkedResource.delete(normalized);
		}
	}

	private addItemReferences(itemIds: string[], uri: string): void {
		for (const itemId of itemIds) {
			const uris = this.pageUrisByItemId.get(itemId) ?? new Set<string>();
			uris.add(uri);
			this.pageUrisByItemId.set(itemId, uris);
		}
	}

	private removeItemReferences(itemIds: string[], uri: string): void {
		for (const itemId of itemIds) {
			const uris = this.pageUrisByItemId.get(itemId);
			if (!uris) {
				continue;
			}
			uris.delete(uri);
			if (uris.size === 0) {
				this.pageUrisByItemId.delete(itemId);
			}
		}
	}

	private addOreReferences(oreIds: string[], uri: string): void {
		for (const oreId of oreIds) {
			const uris = this.pageUrisByOreId.get(oreId) ?? new Set<string>();
			uris.add(uri);
			this.pageUrisByOreId.set(oreId, uris);
		}
	}

	private removeOreReferences(oreIds: string[], uri: string): void {
		for (const oreId of oreIds) {
			const uris = this.pageUrisByOreId.get(oreId);
			if (!uris) {
				continue;
			}
			uris.delete(uri);
			if (uris.size === 0) {
				this.pageUrisByOreId.delete(oreId);
			}
		}
	}

	private addItemLink(itemId: string, sourceUri: string): void {
		const sourceUris = this.sourceUrisByLinkedItem.get(itemId) ?? new Set<string>();
		sourceUris.add(sourceUri);
		this.sourceUrisByLinkedItem.set(itemId, sourceUris);
	}

	private removeItemLink(itemId: string, sourceUri: string): void {
		const sourceUris = this.sourceUrisByLinkedItem.get(itemId);
		if (!sourceUris) {
			return;
		}
		sourceUris.delete(sourceUri);
		if (sourceUris.size === 0) {
			this.sourceUrisByLinkedItem.delete(itemId);
		}
	}

	private addOreLink(oreId: string, sourceUri: string): void {
		const sourceUris = this.sourceUrisByLinkedOre.get(oreId) ?? new Set<string>();
		sourceUris.add(sourceUri);
		this.sourceUrisByLinkedOre.set(oreId, sourceUris);
	}

	private removeOreLink(oreId: string, sourceUri: string): void {
		const sourceUris = this.sourceUrisByLinkedOre.get(oreId);
		if (!sourceUris) {
			return;
		}
		sourceUris.delete(sourceUri);
		if (sourceUris.size === 0) {
			this.sourceUrisByLinkedOre.delete(oreId);
		}
	}

	private collectReferencedPages(
		value: string,
		declarationUris: Map<string, Set<string>>,
		referenceUris: Map<string, Set<string>>
	): GuideNhIndexedPage[] {
		const pages = new Map<string, GuideNhIndexedPage>();
		for (const uri of declarationUris.get(value) ?? []) {
			const page = this.pages.get(uri);
			if (page) {
				pages.set(uri, page);
			}
		}
		for (const uri of referenceUris.get(value) ?? []) {
			const page = this.pages.get(uri);
			if (page) {
				pages.set(uri, page);
			}
		}
		return Array.from(pages.values());
	}

	private refreshSortedPages(): void {
		if (!this.sortedPagesDirty) {
			return;
		}
		this.sortedPages = Array.from(this.pages.values()).sort((left, right) => {
			return left.relativePath.localeCompare(right.relativePath) || left.pageId.localeCompare(right.pageId);
		});
		this.sortedPageKeys = this.sortedPages.map((page) => page.relativePath);
		this.sortedPagesDirty = false;
	}

	private refreshSortedNamespaces(): void {
		if (!this.namespacesDirty) {
			return;
		}
		this.sortedNamespaces = Array.from(this.namespaceCounts.keys()).sort((left, right) => left.localeCompare(right));
		this.namespacesDirty = false;
	}

	private collectPageLookupKeys(normalized: string): string[] {
		const keys = new Set<string>(this.collectReferenceLookupKeys(normalized, this.sourceUrisByLinkedPage));
		const relativeUris = this.pageUrisByRelativePath.get(normalized);
		for (const uri of relativeUris ?? []) {
			const page = this.pages.get(uri);
			if (page) {
				keys.add(page.pageId);
			}
		}
		return Array.from(keys);
	}

	private collectReferenceLookupKeys(normalized: string, references: Map<string, Set<string>>): string[] {
		const keys = new Set<string>([normalized]);
		for (const key of references.keys()) {
			if (key.endsWith(`:${normalized}`)) {
				keys.add(key);
			}
		}
		return Array.from(keys);
	}

	private collectReferencedPagesByKeys(
		keys: string[],
		referenceUris: Map<string, Set<string>>
	): GuideNhIndexedPage[] {
		const pages = new Map<string, GuideNhIndexedPage>();
		for (const key of keys) {
			for (const uri of referenceUris.get(key) ?? []) {
				const page = this.pages.get(uri);
				if (page) {
					pages.set(uri, page);
				}
			}
		}
		return Array.from(pages.values());
	}

	private queryPagesByAliasPrefix(prefix: string, limit: number): GuideNhIndexedPage[] {
		const pages = new Map<string, GuideNhIndexedPage>();
		const aliases = Array.from(this.pageUrisByPrefixAlias.keys()).sort((left, right) => left.localeCompare(right));
		const start = lowerBound(aliases, prefix);
		for (let index = start; index < aliases.length && pages.size < limit; index++) {
			const alias = aliases[index];
			if (!alias.startsWith(prefix)) {
				break;
			}
			for (const uri of this.pageUrisByPrefixAlias.get(alias) ?? []) {
				const page = this.pages.get(uri);
				if (page) {
					pages.set(uri, page);
				}
			}
		}
		return Array.from(pages.values()).sort((left, right) => left.pageId.localeCompare(right.pageId));
	}

	private selectPreferredPage(uris: string[], preferredLocale?: string): GuideNhIndexedPage | undefined {
		const pages = uris
			.map((uri) => this.pages.get(uri))
			.filter((page): page is GuideNhIndexedPage => page !== undefined);
		if (pages.length === 0) {
			return undefined;
		}
		if (pages.length === 1) {
			return pages[0];
		}
		const normalizedLocale = normalizeGuideNhLocale(preferredLocale);
		if (normalizedLocale) {
			const localeMatch = pages.find((page) => page.locale === normalizedLocale);
			if (localeMatch) {
				return localeMatch;
			}
		}
		const englishFallback = pages.find((page) => page.locale === 'en_us');
		if (englishFallback) {
			return englishFallback;
		}
		return pages.sort((left, right) => left.uri.localeCompare(right.uri))[0];
	}

	private refreshSortedFrontmatterValues(path: string): void {
		if (!this.dirtyFrontmatterPaths.has(path) && this.sortedFrontmatterValues.has(path)) {
			return;
		}
		this.sortedFrontmatterValues.set(path, Array.from(this.valueCountsByFrontmatterPath.get(path)?.keys() ?? []).sort((left, right) => {
			return left.localeCompare(right);
		}));
		this.dirtyFrontmatterPaths.delete(path);
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

	private addNamespace(namespace: string | undefined): void {
		if (!namespace) {
			return;
		}
		const normalized = namespace.toLowerCase();
		this.namespaceCounts.set(normalized, (this.namespaceCounts.get(normalized) ?? 0) + 1);
		this.namespacesDirty = true;
	}

	private removeNamespace(namespace: string | undefined): void {
		if (!namespace) {
			return;
		}
		const normalized = namespace.toLowerCase();
		const count = this.namespaceCounts.get(normalized) ?? 0;
		if (count <= 1) {
			this.namespaceCounts.delete(normalized);
		} else {
			this.namespaceCounts.set(normalized, count - 1);
		}
		this.namespacesDirty = true;
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

function extractMarkdownAnchors(text: string): string[] {
	const anchors = new Set<string>();
	for (const line of text.split(/\r?\n/)) {
		const match = line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/);
		if (match) {
			anchors.add(normalizeAnchor(match[1]));
		}
	}
	return Array.from(anchors);
}

function normalizeAnchor(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/[\x60*_~]/g, '')
		.replace(/[^\p{L}\p{N}\s-]/gu, '')
		.replace(/\s+/g, '-');
}

function extractPageLinks(model: GuideNhDocumentModel): string[] {
	return Array.from(new Set(
		model.references
			.filter((reference) => reference.kind === 'page' && reference.normalizedTarget)
			.map((reference) => String(reference.normalizedTarget))
	));
}

function extractResourceLinks(model: GuideNhDocumentModel): string[] {
	return Array.from(new Set(
		model.references
			.filter((reference) => reference.kind === 'resource' && reference.normalizedTarget)
			.map((reference) => String(reference.normalizedTarget))
	));
}

function extractSemanticLinks(model: GuideNhDocumentModel, capability: 'items' | 'ores'): string[] {
	return Array.from(new Set(
		model.parsed.tags.flatMap((tag) => {
			if (tag.closing) {
				return [];
			}
			return Object.entries(tag.attributes)
				.filter(([, value]) => typeof value === 'string')
				.filter(([attributeName]) => resolveRuntimeAttributeSource(tag.name, attributeName)?.capability === capability)
				.map(([, value]) => String(value));
		})
	));
}

function normalizePagePrefix(prefix: string): string {
	return normalizeGuideNhReferencePath(prefix);
}

function lowerBound(values: string[], target: string): number {
	let low = 0;
	let high = values.length;
	while (low < high) {
		const middle = Math.floor((low + high) / 2);
		if (values[middle] < target) {
			low = middle + 1;
		} else {
			high = middle;
		}
	}
	return low;
}

function createRelativePageReference(directoryPath: string, relativePath: string, prefix: string): string {
	if (prefix.startsWith('/')) {
		return `/${relativePath}`;
	}
	const reference = path.posix.relative(directoryPath || '.', relativePath);
	// Preserve a single-dot prefix so completion can continue with `./page.md`.
	if (prefix === '.' && !reference.startsWith('../')) {
		return `./${reference}`;
	}
	if (!prefix.startsWith('./') || reference.startsWith('../')) {
		return reference;
	}
	return `./${reference}`;
}

function isPreferredPageReference(
	candidate: GuideNhIndexedPage,
	existing: GuideNhIndexedPage,
	preferredLocale: string | undefined
): boolean {
	if (candidate.locale === preferredLocale && existing.locale !== preferredLocale) {
		return true;
	}
	if (candidate.locale !== preferredLocale && existing.locale === preferredLocale) {
		return false;
	}
	return candidate.uri.localeCompare(existing.uri) < 0;
}
