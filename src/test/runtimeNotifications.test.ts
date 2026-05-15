import * as assert from 'assert';
import {
	RuntimeBridgeConnectNotification,
	RuntimeBridgeConnectParams,
	RuntimeBridgeDisconnectNotification
} from '../common/protocol';
import {
	createRuntimeBridgeNotificationHandlers,
	RuntimeBridgeConnectionController
} from '../server/runtime/runtimeBridgeNotifications';

suite('GuideNH runtime bridge server notifications', () => {
	test('connects runtime bridge from language client notification', () => {
		const calls: RuntimeBridgeConnectParams[] = [];
		const controller: RuntimeBridgeConnectionController = {
			connect: (options) => {
				calls.push(options);
			},
			disconnect: () => undefined
		};
		const handlers = createRuntimeBridgeNotificationHandlers(controller);

		handlers[RuntimeBridgeConnectNotification]({ host: '127.0.0.1', port: 8765, token: 'secret' });

		assert.deepStrictEqual(calls, [{ host: '127.0.0.1', port: 8765, token: 'secret' }]);
	});

	test('disconnects runtime bridge from language client notification', () => {
		let disconnects = 0;
		const controller: RuntimeBridgeConnectionController = {
			connect: () => undefined,
			disconnect: () => {
				disconnects++;
			}
		};
		const handlers = createRuntimeBridgeNotificationHandlers(controller);

		handlers[RuntimeBridgeDisconnectNotification]();

		assert.strictEqual(disconnects, 1);
	});
});
