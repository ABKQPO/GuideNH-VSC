import * as vscode from 'vscode';
import {
	findItemStackContextAtPosition,
	isGuideNhPreviewDocument
} from './itemStackContextResolver';
import {
	GuideNhItemStackDropMime,
	parseItemStackDropPayload
} from './itemStackDropPayload';

export class ItemStackDocumentDropProvider implements vscode.DocumentDropEditProvider {
	public async provideDocumentDropEdits(
		document: vscode.TextDocument,
		position: vscode.Position,
		dataTransfer: vscode.DataTransfer,
		_token: vscode.CancellationToken
	): Promise<vscode.DocumentDropEdit | undefined> {
		if (!isGuideNhPreviewDocument(document)) {
			return undefined;
		}
		const customPayloadText = await dataTransfer.get(GuideNhItemStackDropMime)?.asString();
		const plainText = await dataTransfer.get('text/plain')?.asString();
		const payload = customPayloadText ? parseItemStackDropPayload(customPayloadText) : undefined;
		const itemId = payload?.id ?? plainText?.trim();
		if (!itemId) {
			return undefined;
		}
		const targetContext = findItemStackContextAtPosition(document, position);
		if (!targetContext) {
			return new vscode.DocumentDropEdit(itemId, 'Insert GuideNH ItemStack Id');
		}
		const edit = new vscode.DocumentDropEdit('', 'Replace GuideNH ItemStack Id');
		const workspaceEdit = new vscode.WorkspaceEdit();
		workspaceEdit.replace(document.uri, targetContext.valueRange, itemId);
		edit.additionalEdit = workspaceEdit;
		return edit;
	}
}
