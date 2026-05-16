import * as assert from 'assert';
import {
	createRuntimeBridgeStatusHandler,
	RuntimeBridgeStatusPresenter
} from '../client/runtimeStatus';

suite('GuideNH runtime bridge status presenter', () => {
	test('shows connection success without exposing token data', async () => {
		const messages: string[] = [];
		const logs: string[] = [];
		const presenter: RuntimeBridgeStatusPresenter = {
			showInformationMessage: async (message) => {
				messages.push(message);
				return undefined;
			},
			showErrorMessage: async () => undefined,
			appendLine: (message) => {
				logs.push(message);
			}
		};
		const handler = createRuntimeBridgeStatusHandler(presenter);

		await handler({ state: 'connected' });

		assert.deepStrictEqual(messages, ['GuideNH runtime bridge connected.']);
		assert.deepStrictEqual(logs, ['GuideNH runtime bridge status: connected']);
	});

	test('shows runtime bridge errors', async () => {
		const errors: string[] = [];
		const logs: string[] = [];
		const presenter: RuntimeBridgeStatusPresenter = {
			showInformationMessage: async () => undefined,
			showErrorMessage: async (message) => {
				errors.push(message);
				return undefined;
			},
			appendLine: (message) => {
				logs.push(message);
			}
		};
		const handler = createRuntimeBridgeStatusHandler(presenter);

		await handler({ state: 'error', message: 'Connection refused' });

		assert.deepStrictEqual(errors, ['GuideNH runtime bridge error: Connection refused']);
		assert.deepStrictEqual(logs, ['GuideNH runtime bridge status: error - Connection refused']);
	});
});
