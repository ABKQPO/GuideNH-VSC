import * as vscode from 'vscode';
import { RuntimeBridgeStatusNotification, RuntimeBridgeStatusParams } from '../common/protocol';
import { RuntimeBridgeNotificationSender } from './commands';

export interface RuntimeBridgeStatusPresenter {
	showInformationMessage: (message: string) => Thenable<unknown> | Promise<unknown>;
	showErrorMessage: (message: string) => Thenable<unknown> | Promise<unknown>;
}

export function createRuntimeBridgeStatusHandler(
	presenter: RuntimeBridgeStatusPresenter
): (status: RuntimeBridgeStatusParams) => Promise<void> {
	return async (status) => {
		if (status.state === 'connected') {
			await presenter.showInformationMessage('GuideNH runtime bridge connected.');
			return;
		}
		if (status.state === 'error') {
			await presenter.showErrorMessage(`GuideNH runtime bridge error: ${status.message ?? 'Unknown error'}`);
		}
	};
}

export function registerRuntimeBridgeStatusHandler(context: vscode.ExtensionContext, sender: RuntimeBridgeNotificationSender): void {
	const handler = createRuntimeBridgeStatusHandler({
		showInformationMessage: vscode.window.showInformationMessage,
		showErrorMessage: vscode.window.showErrorMessage
	});
	context.subscriptions.push(sender.onNotification(RuntimeBridgeStatusNotification, (payload) => {
		void handler(payload as RuntimeBridgeStatusParams);
	}));
}
