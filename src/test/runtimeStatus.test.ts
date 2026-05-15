import * as assert from 'assert';
import {
	createRuntimeBridgeStatusHandler,
	RuntimeBridgeStatusPresenter
} from '../client/runtimeStatus';

suite('GuideNH runtime bridge status presenter', () => {
	test('shows connection success without exposing token data', async () => {
		const messages: string[] = [];
		const presenter: RuntimeBridgeStatusPresenter = {
			showInformationMessage: async (message) => {
				messages.push(message);
				return undefined;
			},
			showErrorMessage: async () => undefined
		};
		const handler = createRuntimeBridgeStatusHandler(presenter);

		await handler({ state: 'connected' });

		assert.deepStrictEqual(messages, ['GuideNH runtime bridge connected.']);
	});

	test('shows runtime bridge errors', async () => {
		const errors: string[] = [];
		const presenter: RuntimeBridgeStatusPresenter = {
			showInformationMessage: async () => undefined,
			showErrorMessage: async (message) => {
				errors.push(message);
				return undefined;
			}
		};
		const handler = createRuntimeBridgeStatusHandler(presenter);

		await handler({ state: 'error', message: 'Connection refused' });

		assert.deepStrictEqual(errors, ['GuideNH runtime bridge error: Connection refused']);
	});
});
