import * as vscode from 'vscode';

export function registerGuideNhCommands(context: vscode.ExtensionContext): void {
	context.subscriptions.push(
		vscode.commands.registerCommand('guide-vsc.generateSchema', async () => {
			await vscode.window.showInformationMessage('GuideNH schema generation is available from npm run generate:schema.');
		}),
		vscode.commands.registerCommand('guide-vsc.connectRuntimeBridge', async () => {
			await vscode.commands.executeCommand('guide-vsc.runtime.connect');
		}),
		vscode.commands.registerCommand('guide-vsc.disconnectRuntimeBridge', async () => {
			await vscode.commands.executeCommand('guide-vsc.runtime.disconnect');
		})
	);
}
