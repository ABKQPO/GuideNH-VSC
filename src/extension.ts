import * as vscode from 'vscode';
import { registerGuideNhCommands } from './client/commands';
import { createGuideNhLanguageClient } from './client/languageClient';
import { registerRuntimeBridgeStatusHandler } from './client/runtimeStatus';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
	const client = createGuideNhLanguageClient(context);
	registerGuideNhCommands(context, client);
	registerRuntimeBridgeStatusHandler(context, client);
	context.subscriptions.push(client);
	await client.start();
}

export function deactivate(): Thenable<void> | undefined {
	return undefined;
}
