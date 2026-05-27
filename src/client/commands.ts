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
import { resolveRuntimeBridgeConnectionParams } from '../common/runtimeBridgeSecurity';
import { localize } from './localization';

export interface RuntimeBridgeNotificationSender {
	sendNotification(method: string, payload?: unknown): Thenable<void> | Promise<void>;
	onNotification(method: string, handler: (payload: unknown) => void): vscode.Disposable;
}

export interface RuntimeBridgeLogger {
	appendLine(message: string): void;
}

export interface RuntimeBridgeConnectAttemptResult {
	params?: RuntimeBridgeConnectParams;
	errorMessage?: string;
}

export interface GuideNhCommandCallbacks {
	connectRuntimeBridge(): Promise<void>;
	disconnectRuntimeBridge(): Promise<void>;
	generateSchema(): Promise<void>;
	validateRuntimeDocument(): Promise<void>;
	openItemStackPicker(): Promise<void>;
}

export interface ActiveGuideNhDocument {
	uri: string;
	languageId: string;
	text: string;
}

export interface GuideNhCommandDependencies {
	readConfig: () => GuideNhExtensionDefaults;
	sender: RuntimeBridgeNotificationSender;
	logger: RuntimeBridgeLogger;
	activeTextEditor: () => ActiveGuideNhDocument | undefined;
	showInformationMessage: (message: string) => Thenable<unknown> | Promise<unknown>;
	showErrorMessage: (message: string) => Thenable<unknown> | Promise<unknown>;
}

export function resolveGuideNhRuntimeBridgeConnectAttempt(
	config: GuideNhExtensionDefaults
): RuntimeBridgeConnectAttemptResult {
	if (!config.runtimeHost || !config.runtimePort || !config.runtimeToken) {
		return {
			errorMessage: localize('GuideNH runtime bridge host, port, and token must be configured explicitly.')
		};
	}
	try {
		return {
			params: resolveRuntimeBridgeConnectionParams({
				host: config.runtimeHost,
				port: config.runtimePort,
				token: config.runtimeToken,
				allowRemote: config.runtimeAllowRemote
			})
		};
	} catch (error) {
		return {
			errorMessage: error instanceof Error
				? localize('GuideNH {0}.', error.message)
				: localize('GuideNH runtime bridge host is invalid.')
		};
	}
}

export function createGuideNhCommandCallbacks(dependencies: GuideNhCommandDependencies): GuideNhCommandCallbacks {
	return {
		async generateSchema() {
			await dependencies.showInformationMessage(localize('GuideNH schema generation is available from npm run generate:schema.'));
		},
		async connectRuntimeBridge() {
			const config = dependencies.readConfig();
			const attempt = resolveGuideNhRuntimeBridgeConnectAttempt(config);
			if (!attempt.params) {
				await dependencies.showErrorMessage(
					attempt.errorMessage ?? localize('GuideNH runtime bridge host is invalid.')
				);
				return;
			}
			dependencies.logger.appendLine(
				`GuideNH runtime bridge connect requested: ${attempt.params.host}:${attempt.params.port}`
			);
			await dependencies.sender.sendNotification(RuntimeBridgeConnectNotification, attempt.params);
			await dependencies.showInformationMessage(localize('GuideNH runtime bridge connection requested.'));
		},
		async disconnectRuntimeBridge() {
			dependencies.logger.appendLine('GuideNH runtime bridge disconnect requested.');
			await dependencies.sender.sendNotification(RuntimeBridgeDisconnectNotification);
			await dependencies.showInformationMessage(localize('GuideNH runtime bridge disconnected.'));
		},
		async validateRuntimeDocument() {
			const document = dependencies.activeTextEditor();
			if (!document) {
				await dependencies.showErrorMessage(localize('Open a GuideNH Markdown document before requesting runtime validation.'));
				return;
			}
			if (!isGuideNhDocumentLanguage(document.languageId)) {
				await dependencies.showErrorMessage(localize('Open a GuideNH Markdown document before requesting runtime validation.'));
				return;
			}
			const byteLength = Buffer.byteLength(document.text, 'utf8');
			if (byteLength > MaxRuntimeDocumentBytes) {
				await dependencies.showErrorMessage(localize('GuideNH runtime document validation payload is too large: {0} bytes.', byteLength));
				return;
			}
			const params: RuntimeDocumentValidateParams = {
				uri: document.uri,
				languageId: document.languageId,
				text: document.text
			};
			await dependencies.sender.sendNotification(RuntimeDocumentValidateNotification, params);
			await dependencies.showInformationMessage(localize('GuideNH runtime document validation requested.'));
		},
		async openItemStackPicker() {
			await vscode.commands.executeCommand('guide-vsc.openItemStackPicker');
		}
	};
}

function isGuideNhDocumentLanguage(languageId: string): boolean {
	return languageId === 'markdown' || languageId === 'guidenh-md';
}

export function registerGuideNhCommands(
	context: vscode.ExtensionContext,
	sender: RuntimeBridgeNotificationSender,
	output: vscode.OutputChannel = vscode.window.createOutputChannel('GuideNH')
): void {
	if (!context.subscriptions.includes(output)) {
		context.subscriptions.push(output);
	}
	const callbacks = createGuideNhCommandCallbacks({
		readConfig: readGuideNhDefaults,
		sender,
		logger: output,
		activeTextEditor: readActiveGuideNhDocument,
		showInformationMessage: vscode.window.showInformationMessage,
		showErrorMessage: vscode.window.showErrorMessage
	});
	context.subscriptions.push(
		vscode.commands.registerCommand('guide-vsc.generateSchema', callbacks.generateSchema),
		vscode.commands.registerCommand('guide-vsc.connectRuntimeBridge', callbacks.connectRuntimeBridge),
		vscode.commands.registerCommand('guide-vsc.disconnectRuntimeBridge', callbacks.disconnectRuntimeBridge),
		vscode.commands.registerCommand('guide-vsc.validateRuntimeDocument', callbacks.validateRuntimeDocument),
		vscode.commands.registerCommand('guide-vsc.pickItemStack', callbacks.openItemStackPicker)
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
