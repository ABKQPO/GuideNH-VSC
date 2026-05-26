import * as assert from 'assert';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { loadGuideNhSchema, writeBundledGuideNhSchema } from '../server/schema/schemaLoader';

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

	test('exposes Scene alias child tags', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		assert.ok(schema.tags.tags.Scene.children.includes('Block'));
		assert.ok(schema.tags.tags.Scene.children.includes('ImportStructure'));
	});

	test('exposes GT preview formed attributes on scene structure tags', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		assert.strictEqual(schema.tags.tags.Block.attributes.gtFormed?.type, 'boolean');
		assert.strictEqual(schema.tags.tags.ImportStructure.attributes.gtFormed?.type, 'boolean');
		assert.strictEqual(schema.tags.tags.ImportStructureLib.attributes.gtFormed?.type, 'boolean');
		assert.strictEqual(schema.tags.tags.PlaceBlock.attributes.gtFormed?.type, 'boolean');
		assert.strictEqual(schema.tags.tags.ReplaceBlock.attributes.gtFormed?.type, 'boolean');
	});

	test('loads bundled default schema files for packaged extensions', async () => {
		const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'guide-vsc-schema-'));
		const outputDir = path.join(tempRoot, 'schema');

		await writeBundledGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'), outputDir);
		const schema = await loadGuideNhSchema(outputDir);

		assert.ok(schema.tags.tags.GameScene);
		assert.ok(schema.frontmatter.keys.navigation);
		assert.ok(schema.protocol.capabilities.includes('pages'));
	});
});
