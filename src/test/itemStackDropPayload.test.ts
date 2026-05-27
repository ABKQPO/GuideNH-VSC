import * as assert from 'assert';
import {
	createItemStackDropPayload,
	parseItemStackDropPayload
} from '../client/itemStack/itemStackDropPayload';

suite('GuideNH item stack drop payload', () => {
	test('serializes and parses picker entry payloads', () => {
		const payload = createItemStackDropPayload('minecraft:stone', 'picker-entry');
		assert.deepStrictEqual(parseItemStackDropPayload(payload), {
			id: 'minecraft:stone',
			source: 'picker-entry'
		});
	});

	test('serializes and parses apply button payloads', () => {
		const payload = createItemStackDropPayload('minecraft:crafting_table', 'picker-apply');
		assert.deepStrictEqual(parseItemStackDropPayload(payload), {
			id: 'minecraft:crafting_table',
			source: 'picker-apply'
		});
	});

	test('rejects malformed payloads', () => {
		assert.strictEqual(parseItemStackDropPayload('{"id":""}'), undefined);
		assert.strictEqual(parseItemStackDropPayload('not json'), undefined);
	});
});
