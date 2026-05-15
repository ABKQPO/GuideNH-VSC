import {
	RuntimeBridgeConnectNotification,
	RuntimeBridgeConnectParams,
	RuntimeBridgeDisconnectNotification,
	RuntimeBridgeStatusNotification,
	RuntimeBridgeStatusParams,
	RuntimeDocumentValidateNotification,
	RuntimeDocumentValidateParams
} from '../../common/protocol';

export interface RuntimeBridgeConnectionController {
	connect(options: RuntimeBridgeConnectParams): void;
	disconnect(): void;
	validateDocument(document: RuntimeDocumentValidateParams): void;
}

export type RuntimeBridgeNotificationHandler = (payload?: unknown) => void;

export interface RuntimeBridgeStatusSender {
	sendNotification(method: string, payload: unknown): void;
}

export function createRuntimeBridgeNotificationHandlers(
	controller: RuntimeBridgeConnectionController
): Record<string, RuntimeBridgeNotificationHandler> {
	return {
		[RuntimeBridgeConnectNotification]: (payload) => {
			controller.connect(payload as RuntimeBridgeConnectParams);
		},
		[RuntimeBridgeDisconnectNotification]: () => {
			controller.disconnect();
		},
		[RuntimeDocumentValidateNotification]: (payload) => {
			controller.validateDocument(payload as RuntimeDocumentValidateParams);
		}
	};
}

export function wireRuntimeBridgeStatus(sender: RuntimeBridgeStatusSender): (status: RuntimeBridgeStatusParams) => void {
	return (status) => {
		sender.sendNotification(RuntimeBridgeStatusNotification, status);
	};
}
