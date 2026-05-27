import * as vscode from 'vscode';
import { registerGuideNhCommands } from './client/commands';
import { registerGuideNhCompletionAssist } from './client/completionAssist';
import { ItemStackDecorationController } from './client/itemStack/itemStackDecorationController';
import { ItemStackPickerPanel } from './client/itemStack/itemStackPickerPanel';
import { createGuideNhLanguageClient } from './client/languageClient';
import { ItemStackPreviewClient } from './client/itemStack/itemStackPreviewClient';
import { RuntimePreviewClient } from './client/runtimePreviewClient';
import { registerRuntimeBridgeStatusHandler } from './client/runtimeStatus';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
	const client = createGuideNhLanguageClient(context);
	registerGuideNhCommands(context, client);
	registerGuideNhCompletionAssist(context);
	registerRuntimeBridgeStatusHandler(context, client);
	const previewClient = new ItemStackPreviewClient(new RuntimePreviewClient(client));
	const pickerPanel = new ItemStackPickerPanel(previewClient);
	const itemStackDecorationController = new ItemStackDecorationController(previewClient, pickerPanel);
	context.subscriptions.push(client);
	context.subscriptions.push(previewClient, pickerPanel, itemStackDecorationController);
	await client.start();
}

export function deactivate(): Thenable<void> | undefined {
	return undefined;
}
