import * as vscode from 'vscode';
import { RuntimeBridgeStatusNotification, RuntimeBridgeStatusParams } from '../common/protocol';
import { RuntimeBridgeNotificationSender } from './commands';
import { localize } from './localization';

export interface RuntimeBridgeStatusPresenter {
	showInformationMessage: (message: string) => Thenable<unknown> | Promise<unknown>;
	showErrorMessage: (message: string) => Thenable<unknown> | Promise<unknown>;
	appendLine: (message: string) => void;
}

export function createRuntimeBridgeStatusHandler(
	presenter: RuntimeBridgeStatusPresenter
): (status: RuntimeBridgeStatusParams) => Promise<void> {
	return async (status) => {
		presenter.appendLine(`GuideNH runtime bridge status: ${status.state}${status.message ? ` - ${status.message}` : ''}`);
		if (status.state === 'connected') {
			await presenter.showInformationMessage(localize('GuideNH runtime bridge connected.'));
			return;
		}
		if (status.state === 'error') {
			await presenter.showErrorMessage(localize('GuideNH runtime bridge error: {0}', status.message ?? localize('Unknown error')));
		}
	};
}

export function registerRuntimeBridgeStatusHandler(context: vscode.ExtensionContext, sender: RuntimeBridgeNotificationSender): void {
	const output = vscode.window.createOutputChannel('GuideNH Runtime');
	context.subscriptions.push(output);
	const handler = createRuntimeBridgeStatusHandler({
		showInformationMessage: vscode.window.showInformationMessage,
		showErrorMessage: vscode.window.showErrorMessage,
		appendLine: (message) => output.appendLine(message)
	});
	context.subscriptions.push(sender.onNotification(RuntimeBridgeStatusNotification, (payload) => {
		void handler(payload as RuntimeBridgeStatusParams);
	}));
}
