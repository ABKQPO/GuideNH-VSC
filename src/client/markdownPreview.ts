import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';

type MarkdownItToken = {
	type: string;
	tag: string;
	nesting: number;
	attrs?: Array<[string, string]> | null;
	content: string;
	info: string;
	children?: MarkdownItToken[];
	meta?: Record<string, unknown>;
	map?: number[] | null;
	hidden?: boolean;
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
	installMarkdownTableSpanRenderer(markdownIt);
	installFloatingImageRenderer(markdownIt);
	installLegacyImageDestinationRenderer(markdownIt);
	installFenceRenderer(markdownIt);
	installAlertRenderer(markdownIt);
}

const TABLE_SPAN_MARKER = "\uE000GNHSPAN";
const TABLE_SPAN_END = "\uE001";
const TABLE_HEADERLESS_MARKER = "\uE000GNHHEADERLESS";

function installMarkdownTableSpanRenderer(markdownIt: MarkdownIt): void {
	markdownIt.core.ruler.after("normalize", "guidenh-table-span-source", state => {
		state.src = preprocessMarkdownTableSpans(state.src);
		return false;
	});
	markdownIt.core.ruler.after("inline", "guidenh-table-spans", state => {
		applyMarkdownTableSpans(state.tokens);
		return false;
	});
}

function preprocessMarkdownTableSpans(source: string): string {
	const lines = String(source || "").replaceAll("\r\n", "\n").split("\n");
	for (let index = 0; index + 1 < lines.length; index += 1) {
		if (/^\s*\{:\s*.*\}\s*$/.test(lines[index]) && isMarkdownTableStart(lines, index + 1)) {
			lines[index] = "";
			continue;
		}
		if (isHeaderlessTableStart(lines, index)) {
			const columns = splitRawTableCells(lines[index]).length;
			lines.splice(index, 0, `| ${Array.from({ length: Math.max(1, columns) }, () => TABLE_HEADERLESS_MARKER).join(" | ")} |`);
			index += 1;
		}
		if (!isMarkdownTableStart(lines, index)) continue;
		let cursor = index;
		while (cursor < lines.length && /^\s*\|?.*\|.*$/.test(lines[cursor]) && lines[cursor].trim()) {
			while (hasTableContinuation(lines[cursor]) && cursor + 1 < lines.length
				&& /^\s*\|?.*\|.*$/.test(lines[cursor + 1]) && lines[cursor + 1].trim()) {
				lines[cursor] = mergeTableRows(lines[cursor], lines[cursor + 1]);
				lines.splice(cursor + 1, 1);
			}
			lines[cursor] = rewriteTableSpanLine(lines[cursor]);
			cursor += 1;
		}
		if (cursor < lines.length && /^\s*\{:\s*.*\}\s*$/.test(lines[cursor])) lines[cursor] = "";
		index = cursor - 1;
	}
	return lines.join("\n");
}

function isTableDelimiter(line: string): boolean {
	return /^\s*\|?\s*:?-{1,}:?\s*(?:\|\s*:?-{1,}:?\s*)+\|?\s*$/.test(line || "");
}

function isHeaderlessTableStart(lines: string[], index: number): boolean {
	return isTableDelimiter(lines[index]) && index + 1 < lines.length
		&& /^\s*\|?.*\|.*$/.test(lines[index + 1]) && lines[index + 1].trim().length > 0
		&& !(index > 0 && /^\s*\|?.*\|.*$/.test(lines[index - 1]) && !isTableDelimiter(lines[index - 1]));
}

function hasTableContinuation(line: string): boolean {
	const match = String(line || "").match(/(\\+)\s*$/);
	return Boolean(match && match[1].length % 2 === 1);
}

function mergeTableRows(first: string, second: string): string {
	const left = splitRawTableCells(first);
	const right = splitRawTableCells(second);
	const count = Math.max(left.length, right.length);
	const cells: string[] = [];
	for (let index = 0; index < count; index += 1) {
		const a = left[index]?.text || "";
		const b = right[index]?.text || "";
		cells.push(`${a.replace(/\\\s*$/, "").trim()}${a.trim() ? " <br> " : ""}${b}`.trim());
	}
	return `| ${cells.join(" | ")} |`;
}

function rewriteTableSpanLine(line: string): string {
	const cells = splitRawTableCells(line);
	if (!cells.some(cell => cell.run > 1)) return line;
	const result = ["|"];
	for (let index = 0; index < cells.length; index += 1) {
		const cell = cells[index];
		const marker = cell.span > 1 ? `${TABLE_SPAN_MARKER}${cell.span}${TABLE_SPAN_END}` : "";
		result.push(` ${cell.text}${marker} |`);
	}
	return result.join("");
}

function splitRawTableCells(line: string): Array<{ text: string; span: number; run: number }> {
	let text = String(line || "").trim();
	if (text.startsWith("|")) text = text.slice(1);
	const cells: Array<{ text: string; span: number; run: number }> = [];
	let value = "";
	for (let index = 0; index < text.length;) {
		if (text[index] === "\\" && index + 1 < text.length) {
			value += text.slice(index, index + 2); index += 2; continue;
		}
		if (text[index] !== "|") { value += text[index++]; continue; }
		let end = index + 1;
		while (end < text.length && text[end] === "|") end += 1;
		const run = end - index;
		if (value.trim() || cells.length) cells.push({ text: value.replaceAll("\\|", "|").trim(), span: 1, run });
		if (run > 1 && cells.length) cells[cells.length - 1].span = run;
		if (cells.length >= 2048) return cells;
		value = "";
		index = end;
	}
	if (value.trim()) cells.push({ text: value.replaceAll("\\|", "|").trim(), span: 1, run: 1 });
	return cells;
}

function isMarkdownTableStart(lines: string[], index: number): boolean {
	return index >= 0 && index + 1 < lines.length
		&& /^\s*\|?.*\|.*$/.test(lines[index])
		&& (isTableDelimiter(lines[index + 1]) || isTableDelimiter(lines[index]));
}

function applyMarkdownTableSpans(tokens: MarkdownItToken[]): void {
	for (let tableStart = 0; tableStart < tokens.length; tableStart += 1) {
		if (tokens[tableStart].type !== "table_open") continue;
		const tableEnd = findTokenEnd(tokens, tableStart, "table_open", "table_close");
		if (tableEnd < 0) continue;
		const rows: Array<Array<{ open: MarkdownItToken; inline?: MarkdownItToken; close?: MarkdownItToken; column: number; span: number; row: number; rowSpan: number; tokenIndex: number }>> = [];
		for (let index = tableStart + 1; index < tableEnd; index += 1) {
			if (tokens[index].type !== "tr_open") continue;
			const rowEnd = findTokenEnd(tokens, index, "tr_open", "tr_close");
			if (rowEnd < 0) continue;
			const cells = [] as Array<{ open: MarkdownItToken; inline?: MarkdownItToken; close?: MarkdownItToken; column: number; span: number; row: number; rowSpan: number; tokenIndex: number }>;
			let column = 0;
			for (let cellIndex = index + 1; cellIndex < rowEnd; cellIndex += 1) {
				if (tokens[cellIndex].type !== "th_open" && tokens[cellIndex].type !== "td_open") continue;
				const open = tokens[cellIndex];
				const inline = tokens[cellIndex + 1]?.type === "inline" ? tokens[cellIndex + 1] : undefined;
				const close = inline && tokens[cellIndex + 2]?.type === (open.tag + "_close") ? tokens[cellIndex + 2] : undefined;
				const spanMatch = inline?.content.match(new RegExp(`${TABLE_SPAN_MARKER}(\\d+)${TABLE_SPAN_END}`));
				const span = Math.max(1, Number(spanMatch?.[1] || 1));
				if (inline) {
					inline.content = inline.content.replaceAll(TABLE_HEADERLESS_MARKER, "");
					inline.content = inline.content.replace(new RegExp(`${TABLE_SPAN_MARKER}\\d+${TABLE_SPAN_END}`, "g"), "");
					for (const child of inline.children || []) child.content = child.content.replace(new RegExp(`${TABLE_SPAN_MARKER}\\d+${TABLE_SPAN_END}`, "g"), "");
				}
				cells.push({ open, inline, close, column, span, row: rows.length, rowSpan: 1, tokenIndex: cellIndex });
				column += span;
			}
			rows.push(cells);
			index = rowEnd;
		}
		let activeCells: typeof rows[number] = [];
		let previousRowCells: typeof rows[number] = [];
		for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
			const rowCoverage = activeCells.slice();
			const headerless = rowIndex === 0 && rows[rowIndex].some(cell => cell.inline?.content.includes(TABLE_HEADERLESS_MARKER));
			if (headerless && rows[rowIndex][0]?.open) {
				const rowOpenIndex = rows[rowIndex][0].tokenIndex - 1;
				const rowEndIndex = findTokenEnd(tokens, rowOpenIndex, "tr_open", "tr_close");
				for (let tokenIndex = rowOpenIndex; tokenIndex <= rowEndIndex; tokenIndex += 1) tokens[tokenIndex].hidden = true;
			}
			for (const cell of rows[rowIndex]) {
				const text = cell.inline?.content.trim() || "";
				if (!/^\^\^/.test(text)) continue;
				const target = previousRowCells.find(candidate => candidate.column <= cell.column && cell.column < candidate.column + candidate.span);
				if (!target) continue;
				if (!target.open.attrs) target.open.attrs = [];
				target.open.attrJoin("rowspan", String((Number(target.open.attrGet?.("rowspan") || 1) || 1) + 1));
				const continuationText = text.replace(/^\^\^\s*/, "");
				if (target.inline && continuationText) {
					target.inline.content = `${target.inline.content}\n${continuationText}`;
					target.inline.children = [...(target.inline.children || []), {
						type: "softbreak", tag: "br", nesting: 0, content: "", info: "", children: undefined
					} as MarkdownItToken, { type: "text", tag: "", nesting: 0, content: continuationText, info: "", children: undefined } as MarkdownItToken];
				}
				target.rowSpan += 1;
				if (!rowCoverage.includes(target)) rowCoverage.push(target);
				cell.open.hidden = true;
				if (cell.inline) { cell.inline.hidden = true; cell.inline.content = ""; }
				if (cell.close) cell.close.hidden = true;
			}
			previousRowCells = [...rowCoverage, ...rows[rowIndex]];
			activeCells = rowCoverage.filter(cell => rowIndex + 1 < cell.row + cell.rowSpan);
		}
		for (const row of rows) {
			for (const cell of row) {
				if (cell.span <= 1) continue;
				if (!cell.open.attrs) cell.open.attrs = [];
				cell.open.attrJoin("colspan", String(cell.span));
			}
		}
		tableStart = tableEnd;
	}
}

function findTokenEnd(tokens: MarkdownItToken[], start: number, openType: string, closeType: string): number {
	let depth = 0;
	for (let index = start; index < tokens.length; index += 1) {
		if (tokens[index].type === openType) depth += 1;
		if (tokens[index].type === closeType && --depth === 0) return index;
	}
	return -1;
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
