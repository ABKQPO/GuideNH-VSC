import * as vscode from 'vscode';
import { registerGuideNhCommands } from './client/commands';
import { createGuideNhLanguageClient } from './client/languageClient';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
	registerGuideNhCommands(context);
	const client = createGuideNhLanguageClient(context);
	context.subscriptions.push(client);
	await client.start();
}

export function deactivate(): Thenable<void> | undefined {
	return undefined;
}
