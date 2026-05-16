import * as assert from 'assert';
import * as path from 'path';
import { createGuideNhHover } from '../server/providers/hover';
import { loadGuideNhSchema } from '../server/schema/schemaLoader';

suite('GuideNH hover provider', () => {
	test('returns tag description', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const hover = createGuideNhHover('<GameScene />', 2, schema);
		assert.ok(typeof hover?.contents === 'object');
		assert.match(JSON.stringify(hover?.contents), /Interactive GuideNH 3D scene/);
	});

	test('returns attribute description', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const hover = createGuideNhHover('<GameScene interactive="true" />', 13, schema);
		assert.match(JSON.stringify(hover?.contents), /GameScene\.interactive/);
		assert.match(JSON.stringify(hover?.contents), /Whether the scene accepts mouse input/);
	});

	test('returns frontmatter key description', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const hover = createGuideNhHover('---\nnavigation:\n  title: Machines\n---\n', 19, schema);
		assert.match(JSON.stringify(hover?.contents), /navigation\.title/);
		assert.match(JSON.stringify(hover?.contents), /Navigation title/);
	});

	test('does not treat inline markdown markers as GuideNH tags', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const text = '| `*Italic*` | `_Italic_` |';
		const hover = createGuideNhHover(text, text.indexOf('Italic') + 1, schema);
		assert.strictEqual(hover, undefined);
	});
});
