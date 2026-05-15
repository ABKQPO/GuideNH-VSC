import * as assert from 'assert';
import * as path from 'path';
import { loadGuideNhSchema } from '../server/schema/schemaLoader';

suite('GuideNH schema loader', () => {
	test('loads modular schema files', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		assert.ok(schema.tags.tags.GameScene);
		assert.ok(schema.frontmatter.keys.navigation);
		assert.ok(schema.markdownExtensions.inlineMarkers.highlight);
		assert.strictEqual(schema.protocol.protocolVersion, 1);
		assert.ok(schema.protocol.capabilities.includes('categories'));
		assert.ok(schema.protocol.capabilities.includes('mods'));
	});

	test('exposes GameScene child tags', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		assert.ok(schema.tags.tags.GameScene.children.includes('Block'));
		assert.ok(schema.tags.tags.GameScene.children.includes('ImportStructure'));
	});
});
