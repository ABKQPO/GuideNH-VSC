import * as assert from 'assert';
import { PreviewResolvePayload, PreviewResolveResultPayload, PreviewSearchPayload, PreviewSearchResultPayload } from '../common/protocol';
import { ItemStackPreviewClient } from '../client/itemStack/itemStackPreviewClient';

suite('GuideNH item stack preview client', () => {
	test('deduplicates in-flight resolve requests and caches results', async () => {
		let resolveCalls = 0;
		const client = new ItemStackPreviewClient({
			search: async (_payload: PreviewSearchPayload): Promise<PreviewSearchResultPayload> => {
				return { capability: 'items', version: 1, entries: [], nextCursor: null };
			},
			resolve: async (payload: PreviewResolvePayload): Promise<PreviewResolveResultPayload> => {
				resolveCalls++;
				return {
					capability: payload.capability,
					previewKey: payload.id,
					id: payload.id,
					displayName: 'Stone',
					detail: 'minecraft:stone:0',
					meta: 0,
					count: 1,
					nbt: '',
					tooltipLines: ['Stone'],
					iconPngBase64: 'AAAA',
					pixelWidth: 16,
					pixelHeight: 16
				};
			}
		} as never);

		const payload: PreviewResolvePayload = {
			capability: 'items',
			id: 'minecraft:stone',
			count: 1,
			renderVariant: 'inline',
			filters: { source: 'inline' }
		};
		const [first, second] = await Promise.all([client.resolve(payload), client.resolve(payload)]);
		const third = await client.resolve(payload);
		assert.strictEqual(resolveCalls, 1);
		assert.strictEqual(first.id, 'minecraft:stone');
		assert.strictEqual(second.id, 'minecraft:stone');
		assert.strictEqual(third.id, 'minecraft:stone');
	});
});
