import * as vscode from 'vscode';
import { PreviewResolveResultPayload } from '../../common/protocol';

const SizedInlineIconCache = new Map<string, vscode.Uri>();

const FallbackInlineIconSvg = [
	'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">',
	'<rect x="1" y="1" width="14" height="14" rx="2" fill="#2f7d32" stroke="#dff2b8" stroke-width="1"/>',
	'<path d="M4 6.5h8M4 9.5h8" stroke="#dff2b8" stroke-width="1.2" stroke-linecap="round"/>',
	'<path d="M5 4.5h6v7H5z" fill="none" stroke="#dff2b8" stroke-width="1"/>',
	'</svg>'
].join('');

export function createFallbackInlineIconUri(): vscode.Uri {
	return vscode.Uri.parse(`data:image/svg+xml;utf8,${encodeURIComponent(FallbackInlineIconSvg)}`);
}

export function createFallbackInlineDataUri(): string {
	return `data:image/svg+xml;utf8,${encodeURIComponent(FallbackInlineIconSvg)}`;
}

export function createSizedInlineIconUri(preview: PreviewResolveResultPayload): vscode.Uri {
	const cacheKey = `${preview.previewKey}:${preview.id}:${preview.iconPngBase64.slice(0, 64)}`;
	const cached = SizedInlineIconCache.get(cacheKey);
	if (cached) {
		return cached;
	}
	const uri = vscode.Uri.parse(createSizedInlineDataUri(preview.iconPngBase64));
	SizedInlineIconCache.set(cacheKey, uri);
	while (SizedInlineIconCache.size > 128) {
		const oldestKey = SizedInlineIconCache.keys().next().value as string | undefined;
		if (!oldestKey) {
			break;
		}
		SizedInlineIconCache.delete(oldestKey);
	}
	return uri;
}

export function createPreviewIconUri(preview: PreviewResolveResultPayload): vscode.Uri {
	return vscode.Uri.parse(`data:image/png;base64,${preview.iconPngBase64}`);
}

export function createPreviewDataUri(preview: PreviewResolveResultPayload): string {
	return `data:image/png;base64,${preview.iconPngBase64}`;
}

function createSizedInlineDataUri(iconPngBase64: string): string {
	const svg = [
		'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">',
		'<image href="data:image/png;base64,',
		iconPngBase64,
		'" x="0" y="0" width="16" height="16" preserveAspectRatio="xMidYMid meet" />',
		'</svg>'
	].join('');
	return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}
