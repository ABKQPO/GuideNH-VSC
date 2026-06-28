import * as vscode from 'vscode';
import {
	registerGuideNhCommands,
	resolveGuideNhRuntimeBridgeConnectAttempt
} from './client/commands';
import { registerGuideNhCompletionAssist } from './client/completionAssist';
import { readGuideNhDefaults } from './client/config';
import { ItemStackContextCache } from './client/itemStack/itemStackContextCache';
import { ItemStackDecorationController } from './client/itemStack/itemStackDecorationController';
import { ItemStackDocumentDropProvider } from './client/itemStack/itemStackDocumentDropProvider';
import { ItemStackHoverWarmupController } from './client/itemStack/itemStackHoverWarmupController';
import { ItemStackPickerPanel } from './client/itemStack/itemStackPickerPanel';
import { createGuideNhLanguageClient } from './client/languageClient';
import { ItemStackPreviewClient } from './client/itemStack/itemStackPreviewClient';
import { RuntimePreviewClient } from './client/runtimePreviewClient';
import { registerRuntimeBridgeStatusHandler } from './client/runtimeStatus';
import { RuntimeBridgeConnectNotification } from './common/protocol';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
	const output = vscode.window.createOutputChannel('GuideNH');
	context.subscriptions.push(output);
	const client = createGuideNhLanguageClient(context);
	registerGuideNhCommands(context, client, output);
	registerGuideNhCompletionAssist(context);
	registerRuntimeBridgeStatusHandler(context, client);
	const previewClient = new ItemStackPreviewClient(new RuntimePreviewClient(client));
	const pickerPanel = new ItemStackPickerPanel(previewClient);
	const itemStackContextCache = new ItemStackContextCache();
	const itemStackDocumentDropProvider = new ItemStackDocumentDropProvider();
	const itemStackDecorationController = new ItemStackDecorationController(
		previewClient,
		pickerPanel,
		itemStackContextCache
	);
	const itemStackHoverWarmupController = new ItemStackHoverWarmupController(
		previewClient,
		itemStackContextCache
	);
	context.subscriptions.push(client);
	context.subscriptions.push(
		previewClient,
		pickerPanel,
		itemStackDecorationController,
		itemStackHoverWarmupController
	);
	context.subscriptions.push(
		vscode.languages.registerDocumentDropEditProvider(
			[
				{ language: 'markdown' },
				{ language: 'guidenh-md' }
			],
			itemStackDocumentDropProvider,
			{
				dropMimeTypes: ['text/plain', 'application/vnd.guidenh.itemstack+json']
			}
		)
	);
	await client.start();
	await tryAutoConnectRuntimeBridge(client, output);
}

export function deactivate(): Thenable<void> | undefined {
	return undefined;
}

async function tryAutoConnectRuntimeBridge(
	client: ReturnType<typeof createGuideNhLanguageClient>,
	output: vscode.OutputChannel
): Promise<void> {
	const config = readGuideNhDefaults();
	if (!config.runtimeAutoConnectOnStartup) {
		return;
	}
	const attempt = resolveGuideNhRuntimeBridgeConnectAttempt(config);
	if (!attempt.params) {
		output.appendLine(
			`GuideNH runtime bridge auto-connect skipped: ${attempt.errorMessage ?? 'invalid configuration'}`
		);
		return;
	}
	try {
		output.appendLine(
			`GuideNH runtime bridge auto-connect requested: ${attempt.params.host}:${attempt.params.port}`
		);
		await client.sendNotification(RuntimeBridgeConnectNotification, attempt.params);
	} catch (error) {
		output.appendLine(
			`GuideNH runtime bridge auto-connect failed: ${error instanceof Error ? error.message : String(error)}`
		);
	}
}
