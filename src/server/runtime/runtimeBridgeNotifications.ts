import {
	RuntimeBridgeConnectNotification,
	RuntimeBridgeConnectParams,
	RuntimeBridgeDisconnectNotification
} from '../../common/protocol';

export interface RuntimeBridgeConnectionController {
	connect(options: RuntimeBridgeConnectParams): void;
	disconnect(): void;
}

export type RuntimeBridgeNotificationHandler = (payload?: unknown) => void;

export function createRuntimeBridgeNotificationHandlers(
	controller: RuntimeBridgeConnectionController
): Record<string, RuntimeBridgeNotificationHandler> {
	return {
		[RuntimeBridgeConnectNotification]: (payload) => {
			controller.connect(payload as RuntimeBridgeConnectParams);
		},
		[RuntimeBridgeDisconnectNotification]: () => {
			controller.disconnect();
		}
	};
}
