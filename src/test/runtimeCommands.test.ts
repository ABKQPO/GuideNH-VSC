import * as assert from 'assert';
import {
	createGuideNhCommandCallbacks,
	RuntimeBridgeNotificationSender
} from '../client/commands';
import {
	RuntimeBridgeConnectNotification,
	RuntimeDocumentValidateNotification
} from '../common/protocol';

suite('GuideNH runtime bridge commands', () => {
	test('sends explicit runtime bridge settings to the language server', async () => {
		const notifications: Array<{ method: string; payload: unknown }> = [];
		const logs: string[] = [];
		const sender: RuntimeBridgeNotificationSender = {
			sendNotification: async (method, payload) => {
				notifications.push({ method, payload });
			},
			onNotification: () => ({ dispose: () => undefined })
		};
		const callbacks = createGuideNhCommandCallbacks({
			readConfig: () => ({
				guideNhSourcePath: 'E:\\Github\\GuideNH',
				runtimeHost: ' LOCALHOST ',
				runtimePort: 8765,
				runtimeToken: 'secret',
				runtimeAllowRemote: false
			}),
			sender,
			logger: {
				appendLine: (message) => {
					logs.push(message);
				}
			},
			activeTextEditor: () => undefined,
			showInformationMessage: async () => undefined,
			showErrorMessage: async () => undefined
		});

		await callbacks.connectRuntimeBridge();

		assert.deepStrictEqual(notifications, [{
			method: RuntimeBridgeConnectNotification,
			payload: { host: 'localhost', port: 8765, token: 'secret', allowRemote: false }
		}]);
		assert.deepStrictEqual(logs, ['GuideNH runtime bridge connect requested: localhost:8765']);
	});

	test('rejects runtime bridge hosts with url syntax', async () => {
		const errors: string[] = [];
		const callbacks = createGuideNhCommandCallbacks({
			readConfig: () => ({
				guideNhSourcePath: 'E:\\Github\\GuideNH',
				runtimeHost: 'ws://127.0.0.1',
				runtimePort: 8765,
				runtimeToken: 'secret',
				runtimeAllowRemote: false
			}),
			sender: {
				sendNotification: async () => {
					throw new Error('Notification must not be sent');
				},
				onNotification: () => ({ dispose: () => undefined })
			},
			logger: { appendLine: () => undefined },
			activeTextEditor: () => undefined,
			showInformationMessage: async () => undefined,
			showErrorMessage: async (message) => {
				errors.push(message);
				return undefined;
			}
		});

		await callbacks.connectRuntimeBridge();

		assert.strictEqual(errors.length, 1);
		assert.ok(errors[0].includes('host name or IP address'));
	});

	test('rejects remote runtime bridge hosts by default', async () => {
		const errors: string[] = [];
		const callbacks = createGuideNhCommandCallbacks({
			readConfig: () => ({
				guideNhSourcePath: 'E:\\Github\\GuideNH',
				runtimeHost: '192.0.2.10',
				runtimePort: 8765,
				runtimeToken: 'secret',
				runtimeAllowRemote: false
			}),
			sender: {
				sendNotification: async () => {
					throw new Error('Notification must not be sent');
				},
				onNotification: () => ({ dispose: () => undefined })
			},
			logger: { appendLine: () => undefined },
			activeTextEditor: () => undefined,
			showInformationMessage: async () => undefined,
			showErrorMessage: async (message) => {
				errors.push(message);
				return undefined;
			}
		});

		await callbacks.connectRuntimeBridge();

		assert.strictEqual(errors.length, 1);
		assert.ok(errors[0].includes('must be local'));
	});

	test('sends remote runtime bridge settings only after explicit opt-in', async () => {
		const notifications: Array<{ method: string; payload: unknown }> = [];
		const callbacks = createGuideNhCommandCallbacks({
			readConfig: () => ({
				guideNhSourcePath: 'E:\\Github\\GuideNH',
				runtimeHost: '192.0.2.10',
				runtimePort: 8765,
				runtimeToken: 'secret',
				runtimeAllowRemote: true
			}),
			sender: {
				sendNotification: async (method, payload) => {
					notifications.push({ method, payload });
				},
				onNotification: () => ({ dispose: () => undefined })
			},
			logger: { appendLine: () => undefined },
			activeTextEditor: () => undefined,
			showInformationMessage: async () => undefined,
			showErrorMessage: async () => undefined
		});

		await callbacks.connectRuntimeBridge();

		assert.deepStrictEqual(notifications, [{
			method: RuntimeBridgeConnectNotification,
			payload: { host: '192.0.2.10', port: 8765, token: 'secret', allowRemote: true }
		}]);
	});

	test('rejects runtime bridge connection without explicit settings', async () => {
		const errors: string[] = [];
		const callbacks = createGuideNhCommandCallbacks({
			readConfig: () => ({
				guideNhSourcePath: 'E:\\Github\\GuideNH',
				runtimeHost: '',
				runtimePort: 0,
				runtimeToken: '',
				runtimeAllowRemote: false
			}),
			sender: {
				sendNotification: async () => {
					throw new Error('Notification must not be sent');
				},
				onNotification: () => ({ dispose: () => undefined })
			},
			logger: { appendLine: () => undefined },
			activeTextEditor: () => undefined,
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

	test('sends active document validation only when manually requested', async () => {
		const notifications: Array<{ method: string; payload: unknown }> = [];
		const callbacks = createGuideNhCommandCallbacks({
			readConfig: () => ({
				guideNhSourcePath: 'E:\\Github\\GuideNH',
				runtimeHost: '',
				runtimePort: 0,
				runtimeToken: '',
				runtimeAllowRemote: false
			}),
			sender: {
				sendNotification: async (method, payload) => {
					notifications.push({ method, payload });
				},
				onNotification: () => ({ dispose: () => undefined })
			},
			logger: { appendLine: () => undefined },
			activeTextEditor: () => ({
				uri: 'file:///repo/page.md',
				languageId: 'markdown',
				text: '---\nitem_ids:\n  - minecraft:stone\n---\n'
			}),
			showInformationMessage: async () => undefined,
			showErrorMessage: async () => undefined
		});

		await callbacks.validateRuntimeDocument();

		assert.deepStrictEqual(notifications, [{
			method: RuntimeDocumentValidateNotification,
			payload: {
				uri: 'file:///repo/page.md',
				languageId: 'markdown',
				text: '---\nitem_ids:\n  - minecraft:stone\n---\n'
			}
		}]);
	});

	test('rejects runtime document validation without an active document', async () => {
		const errors: string[] = [];
		const callbacks = createGuideNhCommandCallbacks({
			readConfig: () => ({
				guideNhSourcePath: 'E:\\Github\\GuideNH',
				runtimeHost: '',
				runtimePort: 0,
				runtimeToken: '',
				runtimeAllowRemote: false
			}),
			sender: {
				sendNotification: async () => {
					throw new Error('Notification must not be sent');
				},
				onNotification: () => ({ dispose: () => undefined })
			},
			logger: { appendLine: () => undefined },
			activeTextEditor: () => undefined,
			showInformationMessage: async () => undefined,
			showErrorMessage: async (message) => {
				errors.push(message);
				return undefined;
			}
		});

		await callbacks.validateRuntimeDocument();

		assert.strictEqual(errors.length, 1);
		assert.ok(errors[0].includes('Open a GuideNH Markdown document'));
	});

	test('rejects runtime document validation for unsupported documents', async () => {
		const errors: string[] = [];
		const callbacks = createGuideNhCommandCallbacks({
			readConfig: () => ({
				guideNhSourcePath: 'E:\\Github\\GuideNH',
				runtimeHost: '',
				runtimePort: 0,
				runtimeToken: '',
				runtimeAllowRemote: false
			}),
			sender: {
				sendNotification: async () => {
					throw new Error('Notification must not be sent');
				},
				onNotification: () => ({ dispose: () => undefined })
			},
			logger: { appendLine: () => undefined },
			activeTextEditor: () => ({
				uri: 'file:///repo/page.txt',
				languageId: 'plaintext',
				text: '# Page'
			}),
			showInformationMessage: async () => undefined,
			showErrorMessage: async (message) => {
				errors.push(message);
				return undefined;
			}
		});

		await callbacks.validateRuntimeDocument();

		assert.strictEqual(errors.length, 1);
		assert.ok(errors[0].includes('GuideNH Markdown'));
	});

	test('rejects oversized runtime document validation before sending notifications', async () => {
		const errors: string[] = [];
		const callbacks = createGuideNhCommandCallbacks({
			readConfig: () => ({
				guideNhSourcePath: 'E:\\Github\\GuideNH',
				runtimeHost: '',
				runtimePort: 0,
				runtimeToken: '',
				runtimeAllowRemote: false
			}),
			sender: {
				sendNotification: async () => {
					throw new Error('Notification must not be sent');
				},
				onNotification: () => ({ dispose: () => undefined })
			},
			logger: { appendLine: () => undefined },
			activeTextEditor: () => ({
				uri: 'file:///repo/large.md',
				languageId: 'markdown',
				text: 'x'.repeat(262145)
			}),
			showInformationMessage: async () => undefined,
			showErrorMessage: async (message) => {
				errors.push(message);
				return undefined;
			}
		});

		await callbacks.validateRuntimeDocument();

		assert.strictEqual(errors.length, 1);
		assert.ok(errors[0].includes('too large'));
	});
});
