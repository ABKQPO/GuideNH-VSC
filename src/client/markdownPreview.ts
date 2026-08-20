import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';

type MarkdownItToken = {
	type: string;
	tag: string;
	nesting: number;
	content: string;
	info: string;
	children?: MarkdownItToken[];
	meta?: Record<string, unknown>;
	attrJoin(name: string, value: string): void;
	attrGet?(name: string): string | null;
	attrSet?(name: string, value: string): void;
};

type MarkdownIt = {
	core: { ruler: { after(ruleName: string, name: string, rule: (state: MarkdownItState) => boolean): void } };
	renderer: { rules: Record<string, MarkdownItRenderRule | undefined> };
};

type MarkdownItState = {
	src: string;
	tokens: MarkdownItToken[];
	env?: MarkdownItEnvironment;
};

type MarkdownItRenderRule = (tokens: MarkdownItToken[], index: number, ...rest: unknown[]) => string;

type MarkdownItEnvironment = {
	currentDocument?: vscode.Uri;
	resourceProvider?: {
		asWebviewUri(uri: vscode.Uri): { toString(): string };
	};
};

type MarkdownItRenderer = {
	renderToken(tokens: MarkdownItToken[], index: number, options: unknown): string;
};

const ALERT_PATTERN = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:[ \t]+|\r?\n|$)/i;

const ALERT_COLORS: Record<string, string> = {
	note: '#3b82f6',
	tip: '#16a34a',
	important: '#7c3aed',
	warning: '#d97706',
	caution: '#dc2626'
};

/**
 * VS Code 1.120 discovers Markdown-it plugins through the extension manifest and invokes this
 * export after activation. The previous direct `vscode.markdown-language-features` API no longer
 * exposes an `extendMarkdownIt` object, so calling it prevented the whole extension from loading.
 */
export function extendMarkdownIt(markdownIt: MarkdownIt): MarkdownIt {
	installGuideNhPreviewRenderer(markdownIt);
	return markdownIt;
}

function installGuideNhPreviewRenderer(markdownIt: MarkdownIt): void {
	installFloatingImageRenderer(markdownIt);
	installLegacyImageDestinationRenderer(markdownIt);
	installFenceRenderer(markdownIt);
	installAlertRenderer(markdownIt);
}

const FLOATING_IMAGE_MARKER = 'guidenh-floating:';

/**
 * Converts GuideNH's component tag to a native Markdown image before block parsing.
 * Native image tokens are important: VS Code's Markdown extension rewrites them to
 * webview-safe resource URLs, while images created later by browser JavaScript are
 * unable to load relative workspace paths.
 */
function installFloatingImageRenderer(markdownIt: MarkdownIt): void {
	markdownIt.core.ruler.after('normalize', 'guidenh-floating-images', state => {
		state.src = state.src.replace(/<FloatingImage\b([^>]*)>([\s\S]*?)<\/FloatingImage\s*>|<FloatingImage\b([^>]*)\/\s*>/gi, (_whole, pairedAttributes, _content, standaloneAttributes) => {
			const attributes = pairedAttributes ?? standaloneAttributes ?? '';
			const source = readHtmlAttribute(attributes, 'src');
			if (!source) {
				return _whole;
			}
			const config = {
				alt: readHtmlAttribute(attributes, 'alt') || readHtmlAttribute(attributes, 'title') || source,
				align: readHtmlAttribute(attributes, 'align'),
				wrap: readHtmlAttribute(attributes, 'wrap'),
				displayWidth: readHtmlAttribute(attributes, 'displayWidth'),
				displayHeight: readHtmlAttribute(attributes, 'displayHeight'),
				width: readHtmlAttribute(attributes, 'width') || readHtmlAttribute(attributes, 'w'),
				height: readHtmlAttribute(attributes, 'height') || readHtmlAttribute(attributes, 'h'),
				scaleX: readHtmlAttribute(attributes, 'scaleX'),
				scaleY: readHtmlAttribute(attributes, 'scaleY')
			};
			const label = `${FLOATING_IMAGE_MARKER}${encodeURIComponent(JSON.stringify(config))}`;
			return `![${label}](<${normalizeImagePath(source)}>)`;
		});
		return false;
	});

	const previousImageRenderer = markdownIt.renderer.rules.image;
	markdownIt.renderer.rules.image = (tokens, index, ...rest) => {
		// VS Code's built-in renderer is installed after extension rules. It records the
		// logical Markdown destination here before replacing src with a webview URL.
		const source = tokens[index].attrGet?.('data-src') ?? tokens[index].attrGet?.('src');
		const environment = rest[1] as MarkdownItEnvironment | undefined;
		const resolvedSource = resolveGuideNhPreviewImage(source, environment?.currentDocument);
		if (resolvedSource) {
			const resolvedUri = resolvedSource.toString();
			// The host rule wraps this rule and creates data-src before invoking it. Keep the
			// two attributes in sync: data-src is the target used for click-to-open previews.
			tokens[index].attrSet?.('data-src', resolvedUri);
			tokens[index].attrSet?.('src', environment?.resourceProvider?.asWebviewUri(resolvedSource).toString() ?? resolvedUri);
		}
		const renderImage = () => previousImageRenderer?.(tokens, index, ...rest)
			?? (rest[2] as MarkdownItRenderer | undefined)?.renderToken(tokens, index, rest[0])
			?? '';
		const marker = tokens[index].content;
		if (!marker.startsWith(FLOATING_IMAGE_MARKER)) {
			return renderImage();
		}
		const payload = marker.slice(FLOATING_IMAGE_MARKER.length);
		return renderImage().replace(/<img\b/, `<img class="guidenh-floating-image" data-guidenh-floating="${escapeHtml(payload)}"`);
	};
}

/**
 * Mirrors IdUtils.resolveLink and MutableGuide.loadAsset for preview images. GuideNH page IDs
 * exclude the locale directory, so ../assets from _zh_cn/foo/page.md targets guidenh/assets.
 */
function resolveGuideNhPreviewImage(source: string | null | undefined, documentUri: vscode.Uri | undefined): vscode.Uri | undefined {
	if (!source || !documentUri || documentUri.scheme !== 'file') {
		return undefined;
	}
	const recoveredLogicalPath = recoverGuideNhLogicalResourcePath(source);
	const reference = recoveredLogicalPath ?? normalizeImagePath(unwrapLegacyMarkdownDestination(source));
	if (!reference || (!recoveredLogicalPath && /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(reference))) {
		return undefined;
	}
	const documentPath = documentUri.fsPath.replace(/\\/g, '/');
	const location = /^(.*\/assets\/)([^/]+)(\/guidenh\/)(?:guidenh\/)?_([a-z]{2}_[a-z]{2})\/(.+\.md)$/i.exec(documentPath);
	if (!location) {
		return undefined;
	}

	const [, assetsRoot, documentNamespace, guideFolder, locale, pagePath] = location;
	const explicit = /^([a-z0-9_.-]+):(\/?)(.+)$/i.exec(reference);
	const namespace = explicit?.[1] ?? documentNamespace;
	const pathReference = explicit?.[3] ?? reference;
	const logicalPath = recoveredLogicalPath || reference.startsWith('/') || explicit
		? normalizeGuidePath(pathReference)
		: normalizeGuidePath(path.posix.join(path.posix.dirname(pagePath), pathReference));
	if (!logicalPath) {
		return undefined;
	}

	const guideRoot = `${assetsRoot}${namespace}${guideFolder}`;
	for (const candidate of [`${guideRoot}_${locale}/${logicalPath}`, `${guideRoot}${logicalPath}`]) {
		const filePath = candidate.replace(/\//g, path.sep);
		if (fs.existsSync(filePath)) {
			return vscode.Uri.file(filePath);
		}
	}
	return undefined;
}

/** Converts a file URI produced by an editor renderer back to the GuideNH resource ID path. */
function recoverGuideNhLogicalResourcePath(source: string): string | undefined {
	if (!source.startsWith('file:', 0)) {
		return undefined;
	}
	const physicalPath = vscode.Uri.parse(source).fsPath.replace(/\\/g, '/');
	const localized = /\/guidenh\/(?:guidenh\/)?_[^/]+\/(.+)$/i.exec(physicalPath);
	if (localized) {
		return normalizeGuidePath(localized[1]);
	}
	const shared = /\/guidenh\/assets\/(.+)$/i.exec(physicalPath);
	return shared ? `assets/${normalizeGuidePath(shared[1])}` : undefined;
}

function normalizeGuidePath(value: string): string {
	const normalized = path.posix.normalize(`/${value.replace(/\\/g, '/')}`);
	return normalized.replace(/^\/+/, '').replace(/^(?:\.\.\/)+/, '');
}

function readHtmlAttribute(attributes: string, name: string): string {
	const match = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(attributes);
	return match?.[1] ?? match?.[2] ?? '';
}

function normalizeImagePath(value: string): string {
	return value.trim().replace(/\\([_()[\]])/g, '$1');
}

/** Restores image destinations from historic `(*relative/path*)` GuideNH Markdown. */
function installLegacyImageDestinationRenderer(markdownIt: MarkdownIt): void {
	markdownIt.core.ruler.after('inline', 'guidenh-legacy-image-destinations', state => {
		for (const token of state.tokens) {
			for (const child of token.children ?? []) {
				if (child.type !== 'image' || !child.attrGet || !child.attrSet) {
					continue;
				}
				const source = child.attrGet('src');
				if (source === null) {
					continue;
				}
				const normalized = unwrapLegacyMarkdownDestination(source);
				if (normalized !== source) {
					child.attrSet('src', normalized);
				}
			}
		}
		return false;
	});
}

function unwrapLegacyMarkdownDestination(value: string): string {
	const trimmed = value.trim();
	return trimmed.startsWith('*') && trimmed.endsWith('*') && trimmed.length > 2
		? trimmed.slice(1, -1).trim()
		: trimmed;
}

function installFenceRenderer(markdownIt: MarkdownIt): void {
	markdownIt.core.ruler.after('inline', 'guidenh-fences', state => {
		for (const token of state.tokens) {
			if (token.type !== 'fence') {
				continue;
			}
			switch (token.info.trim().split(/\s+/, 1)[0].toLowerCase()) {
				case 'csv':
					token.type = 'html_block';
					token.content = renderCsv(token.content);
					break;
				case 'filetree':
					token.type = 'html_block';
					token.content = `<pre class="guidenh-filetree">${escapeHtml(token.content)}</pre>`;
					break;
				case 'funcgraph':
					token.type = 'html_block';
					token.content = `<guidenh-funcgraph>${escapeHtml(token.content)}</guidenh-funcgraph>`;
					break;
				default:
					break;
			}
		}
		return false;
	});
}

function renderCsv(content: string): string {
	const rows = content.split(/\r?\n/).filter(line => line.trim().length > 0).map(line => line.split(','));
	if (rows.length === 0) {
		return '<div class="guidenh-block" data-guidenh-preview="csv-empty"></div>';
	}
	return `<table class="guidenh-csv">${rows.map((row, rowIndex) => `<tr>${row.map(cell => {
		const tag = rowIndex === 0 ? 'th' : 'td';
		return `<${tag}>${escapeHtml(cell.trim())}</${tag}>`;
	}).join('')}</tr>`).join('')}</table>`;
}

function escapeHtml(value: string): string {
	return value.replace(/[&<>"']/g, character => ({
		'&': '&amp;',
		'<': '&lt;',
		'>': '&gt;',
		'"': '&quot;',
		"'": '&#39;'
	}[character] ?? character));
}

function installAlertRenderer(markdownIt: MarkdownIt): void {
	markdownIt.core.ruler.after('inline', 'guidenh-alerts', state => {
		for (let index = 0; index + 2 < state.tokens.length; index++) {
			const opening = state.tokens[index];
			const inline = state.tokens[index + 1];
			const closing = state.tokens[index + 2];
			if (opening.type !== 'paragraph_open' || inline.type !== 'inline' || closing.type !== 'paragraph_close') {
				continue;
			}
			const match = ALERT_PATTERN.exec(inline.content);
			if (!match) {
				continue;
			}
			const type = match[1].toLowerCase();
			inline.content = inline.content.slice(match[0].length);
			const firstText = inline.children?.find(token => token.type === 'text' && token.content.startsWith(match[0]));
			if (firstText) {
				firstText.content = firstText.content.slice(match[0].length);
			}
			opening.type = 'guidenh_alert_open';
			opening.tag = 'aside';
			opening.meta = { type };
			closing.type = 'guidenh_alert_close';
			closing.tag = 'aside';
			closing.meta = { type };
		}
		return false;
	});
	markdownIt.renderer.rules.guidenh_alert_open = (tokens, index) => {
		const type = String(tokens[index].meta?.type ?? 'note');
		const color = ALERT_COLORS[type] ?? ALERT_COLORS.note;
		return `<aside class="guidenh-alert guidenh-alert-${type}" role="note" style="margin:1em 0;padding:.65em .85em;border:1px solid ${color};border-left:4px solid ${color};background-color:${color}1a"><div style="color:${color};font-weight:700;font-size:.9em;text-transform:uppercase;margin-bottom:.3em">${type}</div><div>`;
	};
	markdownIt.renderer.rules.guidenh_alert_close = () => '</div></aside>\n';
}
