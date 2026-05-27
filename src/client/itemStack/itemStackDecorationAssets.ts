import * as vscode from 'vscode';
import { PreviewResolveResultPayload } from '../../common/protocol';

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

export function createPreviewIconUri(preview: PreviewResolveResultPayload): vscode.Uri {
	return vscode.Uri.parse(`data:image/png;base64,${preview.iconPngBase64}`);
}

export function createPreviewDataUri(preview: PreviewResolveResultPayload): string {
	return `data:image/png;base64,${preview.iconPngBase64}`;
}

export function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}
