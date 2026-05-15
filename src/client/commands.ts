import * as vscode from 'vscode';
import {
	RuntimeBridgeConnectNotification,
	RuntimeBridgeConnectParams,
	RuntimeBridgeDisconnectNotification
} from '../common/protocol';
import { GuideNhExtensionDefaults, readGuideNhDefaults } from './config';

export interface RuntimeBridgeNotificationSender {
	sendNotification(method: string, payload?: unknown): Thenable<void> | Promise<void>;
}

export interface GuideNhCommandCallbacks {
	connectRuntimeBridge(): Promise<void>;
	disconnectRuntimeBridge(): Promise<void>;
	generateSchema(): Promise<void>;
}

export interface GuideNhCommandDependencies {
	readConfig: () => GuideNhExtensionDefaults;
	sender: RuntimeBridgeNotificationSender;
	showInformationMessage: (message: string) => Thenable<unknown> | Promise<unknown>;
	showErrorMessage: (message: string) => Thenable<unknown> | Promise<unknown>;
}

export function createGuideNhCommandCallbacks(dependencies: GuideNhCommandDependencies): GuideNhCommandCallbacks {
	return {
		async generateSchema() {
			await dependencies.showInformationMessage('GuideNH schema generation is available from npm run generate:schema.');
		},
		async connectRuntimeBridge() {
			const config = dependencies.readConfig();
			if (!config.runtimeHost || !config.runtimePort || !config.runtimeToken) {
				await dependencies.showErrorMessage('GuideNH runtime bridge host, port, and token must be configured explicitly.');
				return;
			}
			const params: RuntimeBridgeConnectParams = {
				host: config.runtimeHost,
				port: config.runtimePort,
				token: config.runtimeToken
			};
			await dependencies.sender.sendNotification(RuntimeBridgeConnectNotification, params);
			await dependencies.showInformationMessage('GuideNH runtime bridge connection requested.');
		},
		async disconnectRuntimeBridge() {
			await dependencies.sender.sendNotification(RuntimeBridgeDisconnectNotification);
			await dependencies.showInformationMessage('GuideNH runtime bridge disconnected.');
		}
	};
}

export function registerGuideNhCommands(context: vscode.ExtensionContext, sender: RuntimeBridgeNotificationSender): void {
	const callbacks = createGuideNhCommandCallbacks({
		readConfig: readGuideNhDefaults,
		sender,
		showInformationMessage: vscode.window.showInformationMessage,
		showErrorMessage: vscode.window.showErrorMessage
	});
	context.subscriptions.push(
		vscode.commands.registerCommand('guide-vsc.generateSchema', callbacks.generateSchema),
		vscode.commands.registerCommand('guide-vsc.connectRuntimeBridge', callbacks.connectRuntimeBridge),
		vscode.commands.registerCommand('guide-vsc.disconnectRuntimeBridge', callbacks.disconnectRuntimeBridge)
	);
}
