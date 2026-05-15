import * as assert from 'assert';
import {
	RuntimeBridgeConnectNotification,
	RuntimeBridgeConnectParams,
	RuntimeBridgeDisconnectNotification,
	RuntimeBridgeStatusNotification,
	RuntimeDocumentValidateNotification
} from '../common/protocol';
import {
	createRuntimeBridgeNotificationHandlers,
	RuntimeBridgeConnectionController,
	RuntimeBridgeStatusSender,
	wireRuntimeBridgeStatus,
} from '../server/runtime/runtimeBridgeNotifications';

suite('GuideNH runtime bridge server notifications', () => {
	test('connects runtime bridge from language client notification', () => {
		const calls: RuntimeBridgeConnectParams[] = [];
		const controller: RuntimeBridgeConnectionController = {
			connect: (options) => {
				calls.push(options);
			},
			disconnect: () => undefined,
			validateDocument: () => undefined
		};
		const handlers = createRuntimeBridgeNotificationHandlers(controller);

		handlers[RuntimeBridgeConnectNotification]({ host: '127.0.0.1', port: 8765, token: 'secret', allowRemote: false });

		assert.deepStrictEqual(calls, [{ host: '127.0.0.1', port: 8765, token: 'secret', allowRemote: false }]);
	});

	test('disconnects runtime bridge from language client notification', () => {
		let disconnects = 0;
		const controller: RuntimeBridgeConnectionController = {
			connect: () => undefined,
			disconnect: () => {
				disconnects++;
			},
			validateDocument: () => undefined
		};
		const handlers = createRuntimeBridgeNotificationHandlers(controller);

		handlers[RuntimeBridgeDisconnectNotification]();

		assert.strictEqual(disconnects, 1);
	});

	test('forwards manual runtime document validation requests', () => {
		const documents: unknown[] = [];
		const controller: RuntimeBridgeConnectionController = {
			connect: () => undefined,
			disconnect: () => undefined,
			validateDocument: (document) => {
				documents.push(document);
			}
		};
		const handlers = createRuntimeBridgeNotificationHandlers(controller);

		handlers[RuntimeDocumentValidateNotification]({ uri: 'file:///repo/page.md', languageId: 'markdown', text: '# Page' });

		assert.deepStrictEqual(documents, [{ uri: 'file:///repo/page.md', languageId: 'markdown', text: '# Page' }]);
	});

	test('sends runtime bridge status to the language client', () => {
		const notifications: Array<{ method: string; payload: unknown }> = [];
		const sender: RuntimeBridgeStatusSender = {
			sendNotification: (method, payload) => {
				notifications.push({ method, payload });
			}
		};

		wireRuntimeBridgeStatus(sender)({ state: 'connected' });

		assert.deepStrictEqual(notifications, [{
			method: RuntimeBridgeStatusNotification,
			payload: { state: 'connected' }
		}]);
	});
});
