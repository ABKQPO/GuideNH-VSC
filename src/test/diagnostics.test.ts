import * as assert from 'assert';
import * as path from 'path';
import { Diagnostic } from 'vscode-languageserver/node';
import { createGuideNhDiagnostics } from '../server/providers/diagnostics';
import { loadGuideNhSchema } from '../server/schema/schemaLoader';

suite('GuideNH diagnostics', () => {
	test('reports unknown tags and attributes', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const diagnostics = createGuideNhDiagnostics('<UnknownTag bad="1" />', schema);
		assert.strictEqual(diagnostics.length, 1);
		assert.match(diagnostics[0].message, /Unknown GuideNH tag/);
	});

	test('reports missing required attributes', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const diagnostics = createGuideNhDiagnostics('<Block />', schema);
		assert.strictEqual(diagnostics.some((item: Diagnostic) => item.message.includes('Missing required attribute id')), true);
	});

	test('reports tags that are not allowed inside the current parent tag', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const diagnostics = createGuideNhDiagnostics('<GameScene>\n  <Recipe id="minecraft:stone" />\n</GameScene>', schema);
		assert.strictEqual(diagnostics.some((item: Diagnostic) => item.message === 'Tag Recipe is not allowed inside GameScene'), true);
	});

	test('accepts tags allowed by the current parent tag', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const diagnostics = createGuideNhDiagnostics('<GameScene>\n  <Block id="minecraft:stone" />\n</GameScene>', schema);
		assert.strictEqual(diagnostics.some((item: Diagnostic) => item.message.includes('not allowed inside')), false);
	});

	test('does not apply parent tag rules after the parent is closed', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const diagnostics = createGuideNhDiagnostics('<GameScene>\n  <Block id="minecraft:stone" />\n</GameScene>\n<Recipe id="minecraft:stone" />', schema);
		assert.strictEqual(diagnostics.some((item: Diagnostic) => item.message === 'Tag Recipe is not allowed inside GameScene'), false);
	});

	test('reports diagnostics at the tag line and character range', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const diagnostics = createGuideNhDiagnostics('intro\n  <UnknownTag />', schema);
		assert.deepStrictEqual(diagnostics[0].range, {
			start: { line: 1, character: 2 },
			end: { line: 1, character: 16 }
		});
	});

	test('reports unknown top-level frontmatter keys', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const diagnostics = createGuideNhDiagnostics('---\nunknown_key: true\nnavigation:\n  title: Intro\n---\n', schema);
		assert.strictEqual(diagnostics.length, 1);
		assert.strictEqual(diagnostics[0].message, 'Unknown frontmatter key unknown_key');
		assert.deepStrictEqual(diagnostics[0].range, {
			start: { line: 1, character: 0 },
			end: { line: 1, character: 11 }
		});
	});

	test('reports unknown nested frontmatter keys', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const diagnostics = createGuideNhDiagnostics('---\nnavigation:\n  unknown_child: value\n  title: Intro\n---\n', schema);
		assert.strictEqual(diagnostics.length, 1);
		assert.strictEqual(diagnostics[0].message, 'Unknown frontmatter key navigation.unknown_child');
		assert.deepStrictEqual(diagnostics[0].range, {
			start: { line: 2, character: 2 },
			end: { line: 2, character: 15 }
		});
	});

	test('does not cascade unknown frontmatter parent diagnostics to children', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const diagnostics = createGuideNhDiagnostics('---\nunknown_parent:\n  child: value\n---\n', schema);
		assert.deepStrictEqual(
			diagnostics.map((item: Diagnostic) => item.message),
			['Unknown frontmatter key unknown_parent']
		);
	});

	test('reports invalid frontmatter scalar value types', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const diagnostics = createGuideNhDiagnostics('---\nzoom: fast\ncategories: tech\n---\n', schema);
		assert.deepStrictEqual(
			diagnostics.map((item: Diagnostic) => item.message),
			[
				'Frontmatter key zoom expects number value',
				'Frontmatter key categories expects list value'
			]
		);
		assert.deepStrictEqual(diagnostics[0].range, {
			start: { line: 1, character: 6 },
			end: { line: 1, character: 10 }
		});
	});

	test('accepts valid frontmatter scalar value types', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const diagnostics = createGuideNhDiagnostics('---\nzoom: 1.25\ncategories: [intro, tools]\nnavigation:\n  title: Intro\n---\n', schema);
		assert.deepStrictEqual(diagnostics, []);
	});
});
