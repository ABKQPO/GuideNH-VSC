import * as vscode from 'vscode';
import {
	RuntimeBridgeConnectNotification,
	RuntimeBridgeConnectParams,
	RuntimeBridgeDisconnectNotification,
	RuntimeDocumentValidateNotification,
	RuntimeDocumentValidateParams,
	MaxRuntimeDocumentBytes
} from '../common/protocol';
import { GuideNhExtensionDefaults, readGuideNhDefaults } from './config';

export interface RuntimeBridgeNotificationSender {
	sendNotification(method: string, payload?: unknown): Thenable<void> | Promise<void>;
	onNotification(method: string, handler: (payload: unknown) => void): vscode.Disposable;
}

export interface GuideNhCommandCallbacks {
	connectRuntimeBridge(): Promise<void>;
	disconnectRuntimeBridge(): Promise<void>;
	generateSchema(): Promise<void>;
	validateRuntimeDocument(): Promise<void>;
}

export interface ActiveGuideNhDocument {
	uri: string;
	languageId: string;
	text: string;
}

export interface GuideNhCommandDependencies {
	readConfig: () => GuideNhExtensionDefaults;
	sender: RuntimeBridgeNotificationSender;
	activeTextEditor: () => ActiveGuideNhDocument | undefined;
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
		},
		async validateRuntimeDocument() {
			const document = dependencies.activeTextEditor();
			if (!document) {
				await dependencies.showErrorMessage('Open a GuideNH Markdown document before requesting runtime validation.');
				return;
			}
			if (!isGuideNhDocumentLanguage(document.languageId)) {
				await dependencies.showErrorMessage('Open a GuideNH Markdown document before requesting runtime validation.');
				return;
			}
			const byteLength = Buffer.byteLength(document.text, 'utf8');
			if (byteLength > MaxRuntimeDocumentBytes) {
				await dependencies.showErrorMessage(`GuideNH runtime document validation payload is too large: ${byteLength} bytes.`);
				return;
			}
			const params: RuntimeDocumentValidateParams = {
				uri: document.uri,
				languageId: document.languageId,
				text: document.text
			};
			await dependencies.sender.sendNotification(RuntimeDocumentValidateNotification, params);
			await dependencies.showInformationMessage('GuideNH runtime document validation requested.');
		}
	};
}

function isGuideNhDocumentLanguage(languageId: string): boolean {
	return languageId === 'markdown' || languageId === 'guidenh-md';
}

export function registerGuideNhCommands(context: vscode.ExtensionContext, sender: RuntimeBridgeNotificationSender): void {
	const callbacks = createGuideNhCommandCallbacks({
		readConfig: readGuideNhDefaults,
		sender,
		activeTextEditor: readActiveGuideNhDocument,
		showInformationMessage: vscode.window.showInformationMessage,
		showErrorMessage: vscode.window.showErrorMessage
	});
	context.subscriptions.push(
		vscode.commands.registerCommand('guide-vsc.generateSchema', callbacks.generateSchema),
		vscode.commands.registerCommand('guide-vsc.connectRuntimeBridge', callbacks.connectRuntimeBridge),
		vscode.commands.registerCommand('guide-vsc.disconnectRuntimeBridge', callbacks.disconnectRuntimeBridge),
		vscode.commands.registerCommand('guide-vsc.validateRuntimeDocument', callbacks.validateRuntimeDocument)
	);
}

function readActiveGuideNhDocument(): ActiveGuideNhDocument | undefined {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		return undefined;
	}
	return {
		uri: editor.document.uri.toString(),
		languageId: editor.document.languageId,
		text: editor.document.getText()
	};
}
