import * as assert from 'assert';
import * as path from 'path';
import { createGuideNhCompletions } from '../server/providers/completion';
import { SemanticCache } from '../server/runtime/semanticCache';
import { loadGuideNhSchema } from '../server/schema/schemaLoader';

suite('GuideNH runtime completion', () => {
	test('completes item ids for id attributes', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const cache = new SemanticCache();
		cache.replace('items', 1, [{ id: 'minecraft:stone', label: 'Stone' }]);

		const completions = createGuideNhCompletions('<ItemLink id="minecraft:s', 24, schema, undefined, cache);

		assert.ok(completions.some((item) => item.label === 'minecraft:stone'));
	});
});
