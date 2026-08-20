import * as vscode from 'vscode';

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
	core: { ruler: { after(ruleName: string, name: string, rule: (state: { tokens: MarkdownItToken[] }) => boolean): void } };
	renderer: { rules: Record<string, (tokens: MarkdownItToken[], index: number) => string> };
};

type MarkdownPreviewApi = {
	extendMarkdownIt(callback: (markdownIt: MarkdownIt) => MarkdownIt): void;
};

const ALERT_PATTERN = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:[ \t]+|\r?\n|$)/i;

const ALERT_COLORS: Record<string, string> = {
	note: '#3b82f6',
	tip: '#16a34a',
	important: '#7c3aed',
	warning: '#d97706',
	caution: '#dc2626'
};

/** Adds GitHub Alert syntax to the built-in Markdown preview for GuideNH documents. */
export async function registerGuideNhMarkdownPreview(context: vscode.ExtensionContext): Promise<void> {
	const extension = vscode.extensions.getExtension<MarkdownPreviewApi>('vscode.markdown-language-features');
	if (!extension) {
		return;
	}
	const api = extension.isActive ? extension.exports : await extension.activate();
	api.extendMarkdownIt(markdownIt => {
		installGuideNhPreviewRenderer(markdownIt);
		return markdownIt;
	});
	context.subscriptions.push({ dispose: () => undefined });
}

function installGuideNhPreviewRenderer(markdownIt: MarkdownIt): void {
	installLegacyImageDestinationRenderer(markdownIt);
	installFenceRenderer(markdownIt);
	installAlertRenderer(markdownIt);
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
