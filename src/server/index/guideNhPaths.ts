import * as path from 'path';

export interface GuideNhDocumentLocation {
	uri: string;
	namespace?: string;
	locale?: string;
	relativePath: string;
	directoryPath: string;
	pageId: string;
}

export interface GuideNhResourceLocation {
	uri: string;
	namespace?: string;
	locale?: string;
	relativePath?: string;
	aliases: string[];
}

const GuideNhLocalePathPattern = /\/assets\/([^/]+)\/guidenh\/(?:guidenh\/)?_([a-z]{2}_[a-z]{2})\/(.+)$/i;

export function resolveGuideNhDocumentLocation(uri: string): GuideNhDocumentLocation {
	const normalizedUri = uri.replace(/\\/g, '/');
	const match = normalizedUri.match(/\/assets\/([^/]+)\/guidenh\/(?:guidenh\/)?_([a-z]{2}_[a-z]{2})\/(.+\.md)$/i);
	if (match) {
		const relativePath = decodeURIComponent(match[3]);
		return {
			uri,
			namespace: decodeURIComponent(match[1]),
			locale: normalizeGuideNhLocale(match[2]),
			relativePath,
			directoryPath: toPosixDirectory(relativePath),
			pageId: buildNamespacedId(match[1], relativePath)
		};
	}
	const relativePath = decodeURIComponent(normalizedUri.slice(normalizedUri.lastIndexOf('/') + 1));
	return {
		uri,
		relativePath,
		directoryPath: '',
		pageId: relativePath
	};
}

export function resolveGuideNhPageId(uri: string): string {
	return resolveGuideNhDocumentLocation(uri).pageId;
}

/** Prefer the locale encoded by the current GuideNH document over UI locale. */
export function resolveGuideNhPreferredLocale(documentUri?: string, fallbackLocale?: string): string | undefined {
	const documentLocale = documentUri ? resolveGuideNhDocumentLocation(documentUri).locale : undefined;
	return documentLocale ?? normalizeGuideNhLocale(fallbackLocale);
}

export function resolveGuideNhPageReference(reference: string | undefined, documentUri?: string): string | undefined {
	const normalizedReference = stripAnchor(reference);
	if (!normalizedReference || !normalizedReference.endsWith('.md')) {
		return undefined;
	}
	const explicitNamespace = splitExplicitNamespace(normalizedReference);
	if (explicitNamespace) {
		return buildNamespacedId(explicitNamespace.namespace, normalizeRootedGuidePath(explicitNamespace.value));
	}
	if (!documentUri) {
		return normalizeRootedGuidePath(normalizedReference);
	}
	const location = resolveGuideNhDocumentLocation(documentUri);
	if (normalizedReference.startsWith('/')) {
		return location.namespace
			? buildNamespacedId(location.namespace, normalizeRootedGuidePath(normalizedReference))
			: normalizeRootedGuidePath(normalizedReference);
	}
	const resolvedPath = resolveGuideRelativePath(location.directoryPath, normalizedReference);
	return location.namespace
		? buildNamespacedId(location.namespace, resolvedPath)
		: resolvedPath;
}

export function resolveGuideNhResourceReference(reference: string | undefined, documentUri?: string): string | undefined {
	if (!reference) {
		return undefined;
	}
	const trimmed = unwrapLegacyMarkdownDestination(reference);
	if (trimmed.length === 0 || trimmed.startsWith('#')) {
		return undefined;
	}
	if (trimmed.startsWith('/assets/')) {
		return trimmed.slice(1);
	}
	const explicitNamespace = splitExplicitNamespace(trimmed);
	if (explicitNamespace) {
		return buildNamespacedId(explicitNamespace.namespace, normalizeRootedGuidePath(explicitNamespace.value));
	}
	if (!documentUri) {
		return normalizeRootedGuidePath(trimmed);
	}
	const location = resolveGuideNhDocumentLocation(documentUri);
	if (trimmed.startsWith('/')) {
		return location.namespace
			? buildNamespacedId(location.namespace, normalizeRootedGuidePath(trimmed))
			: normalizeRootedGuidePath(trimmed);
	}
	const resolvedPath = resolveGuideRelativePath(location.directoryPath, trimmed);
	return location.namespace
		? buildNamespacedId(location.namespace, resolvedPath)
		: resolvedPath;
}

export function resolveGuideNhResourceLocation(uri: string): GuideNhResourceLocation | undefined {
	const normalizedUri = uri.replace(/\\/g, '/');
	const guideAssetsMatch = normalizedUri.match(/\/assets\/([^/]+)\/guidenh\/assets\/(.+)$/i);
	if (guideAssetsMatch) {
		const namespace = decodeURIComponent(guideAssetsMatch[1]);
		const guideAssetPath = decodeURIComponent(guideAssetsMatch[2]);
		return {
			uri,
			namespace,
			aliases: uniqueAliases([
				`assets/${guideAssetPath}`,
				buildNamespacedId(namespace, `assets/${guideAssetPath}`)
			])
		};
	}
	const localeMatch = normalizedUri.match(GuideNhLocalePathPattern);
	if (localeMatch) {
		const namespace = decodeURIComponent(localeMatch[1]);
		const relativePath = decodeURIComponent(localeMatch[3]);
		return {
			uri,
			namespace,
			locale: normalizeGuideNhLocale(localeMatch[2]),
			relativePath,
			aliases: uniqueAliases([
				buildNamespacedId(namespace, relativePath),
				relativePath
			])
		};
	}
	const assetsMatch = normalizedUri.match(/\/assets\/(.+)$/i);
	if (!assetsMatch) {
		return undefined;
	}
	return {
		uri,
		aliases: [`assets/${decodeURIComponent(assetsMatch[1])}`]
	};
}

export function buildNamespacedId(namespace: string, relativePath: string): string {
	return `${decodeURIComponent(namespace)}:${normalizeRootedGuidePath(relativePath)}`;
}

export function normalizeGuideNhReferencePath(value: string): string {
	const explicitNamespace = splitExplicitNamespace(value);
	if (explicitNamespace) {
		return buildNamespacedId(explicitNamespace.namespace, explicitNamespace.value);
	}
	return normalizeRootedGuidePath(value);
}

export function normalizeGuideNhLocale(locale: string | undefined): string | undefined {
	if (!locale) {
		return undefined;
	}
	const normalized = locale.trim().toLowerCase().replace(/-/g, '_');
	if (/^[a-z]{2}_[a-z]{2}$/.test(normalized)) {
		return normalized;
	}
	if (normalized === 'zh') {
		return 'zh_cn';
	}
	if (normalized === 'en') {
		return 'en_us';
	}
	return normalized;
}

export function stripGuideNhNamespace(value: string): string {
	const explicitNamespace = splitExplicitNamespace(value);
	return explicitNamespace ? explicitNamespace.value : value;
}

function stripAnchor(reference: string | undefined): string | undefined {
	return unwrapLegacyMarkdownDestination(reference).split('#')[0];
}

/** Supports historic Markdown destinations written as `(*relative/path*)`. */
function unwrapLegacyMarkdownDestination(reference: string | undefined): string {
	let value = reference?.trim() ?? '';
	if (value.startsWith('(*') && value.endsWith('*)') && value.length > 4) {
		value = value.slice(2, -2).trim();
	}
	if (value.startsWith('*') && value.endsWith('*') && value.length > 2) {
		value = value.slice(1, -1).trim();
	}
	return value;
}

function splitExplicitNamespace(value: string): { namespace: string; value: string } | undefined {
	const match = value.match(/^([a-z0-9_.-]+):(.*)$/i);
	if (!match) {
		return undefined;
	}
	return {
		namespace: decodeURIComponent(match[1]),
		value: match[2]
	};
}

function resolveGuideRelativePath(directoryPath: string, reference: string): string {
	const normalizedReference = reference.replace(/^\.\//, '');
	return normalizePath(path.posix.join('/', directoryPath, normalizedReference));
}

function normalizeRootedGuidePath(reference: string): string {
	return normalizePath(reference.replace(/^\//, ''));
}

function normalizePath(value: string): string {
	const normalized = path.posix.normalize(value).replace(/^\/+/, '').replace(/^(?:\.\.\/)+/, '');
	return normalized === '.' ? '' : normalized;
}

function toPosixDirectory(relativePath: string): string {
	const directoryPath = path.posix.dirname(relativePath);
	return directoryPath === '.' ? '' : directoryPath;
}

function uniqueAliases(values: string[]): string[] {
	return Array.from(new Set(values));
}
