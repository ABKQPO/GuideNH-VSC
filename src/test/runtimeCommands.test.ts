import * as assert from 'assert';
import {
	createGuideNhCommandCallbacks,
	RuntimeBridgeNotificationSender
} from '../client/commands';
import { RuntimeBridgeConnectNotification } from '../common/protocol';

suite('GuideNH runtime bridge commands', () => {
	test('sends explicit runtime bridge settings to the language server', async () => {
		const notifications: Array<{ method: string; payload: unknown }> = [];
		const sender: RuntimeBridgeNotificationSender = {
			sendNotification: async (method, payload) => {
				notifications.push({ method, payload });
			}
		};
		const callbacks = createGuideNhCommandCallbacks({
			readConfig: () => ({
				guideNhSourcePath: 'E:\\Github\\GuideNH',
				runtimeHost: '127.0.0.1',
				runtimePort: 8765,
				runtimeToken: 'secret'
			}),
			sender,
			showInformationMessage: async () => undefined,
			showErrorMessage: async () => undefined
		});

		await callbacks.connectRuntimeBridge();

		assert.deepStrictEqual(notifications, [{
			method: RuntimeBridgeConnectNotification,
			payload: { host: '127.0.0.1', port: 8765, token: 'secret' }
		}]);
	});

	test('rejects runtime bridge connection without explicit settings', async () => {
		const errors: string[] = [];
		const callbacks = createGuideNhCommandCallbacks({
			readConfig: () => ({
				guideNhSourcePath: 'E:\\Github\\GuideNH',
				runtimeHost: '',
				runtimePort: 0,
				runtimeToken: ''
			}),
			sender: {
				sendNotification: async () => {
					throw new Error('Notification must not be sent');
				}
			},
			showInformationMessage: async () => undefined,
			showErrorMessage: async (message) => {
				errors.push(message);
				return undefined;
			}
		});

		await callbacks.connectRuntimeBridge();

		assert.strictEqual(errors.length, 1);
		assert.ok(errors[0].includes('host, port, and token'));
	});
});
