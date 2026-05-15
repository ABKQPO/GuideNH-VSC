import * as assert from 'assert';
import * as path from 'path';
import { Diagnostic } from 'vscode-languageserver/node';
import { GuideNhWorkspaceIndex } from '../server/index/workspaceIndex';
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

	test('reports invalid tag attribute value types', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const diagnostics = createGuideNhDiagnostics('<GameScene width="wide" interactive="maybe" />', schema);
		assert.deepStrictEqual(
			diagnostics.map((item: Diagnostic) => item.message),
			[
				'Attribute width on GameScene expects number value',
				'Attribute interactive on GameScene expects boolean value'
			]
		);
		assert.deepStrictEqual(diagnostics[0].range, {
			start: { line: 0, character: 18 },
			end: { line: 0, character: 22 }
		});
	});

	test('reports invalid tag enum attribute values', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const diagnostics = createGuideNhDiagnostics('<GameScene background="opaque" />', schema);
		assert.deepStrictEqual(diagnostics.map((item: Diagnostic) => item.message), ['Attribute background on GameScene expects enum value']);
		assert.deepStrictEqual(diagnostics[0].range, {
			start: { line: 0, character: 23 },
			end: { line: 0, character: 29 }
		});
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

	test('reports mismatched closing tags', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const diagnostics = createGuideNhDiagnostics('<GameScene>\n</Recipe>', schema);
		assert.strictEqual(diagnostics.some((item: Diagnostic) => item.message === 'Closing tag Recipe does not match GameScene'), true);
	});

	test('reports unclosed tags', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const diagnostics = createGuideNhDiagnostics('<GameScene>\n  <Block id="minecraft:stone" />', schema);
		assert.strictEqual(diagnostics.some((item: Diagnostic) => item.message === 'Unclosed GuideNH tag GameScene'), true);
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

	test('reports unresolved GuideNH page references', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const index = new GuideNhWorkspaceIndex();
		index.updatePage('file:///repo/index.md', '# Index');
		const text = [
			'[Missing](missing.md)',
			'---',
			'navigation:',
			'  parent: absent.md',
			'---',
			'<ItemLink id="minecraft:stone" linksTo="./gone.md#usage" />'
		].join('\n');
		const diagnostics = createGuideNhDiagnostics(text, schema, index);
		assert.deepStrictEqual(
			diagnostics.map((item: Diagnostic) => item.message),
			[
				'Unknown GuideNH page missing.md',
				'Unknown GuideNH page absent.md',
				'Unknown GuideNH page gone.md'
			]
		);
		assert.deepStrictEqual(diagnostics[0].range, {
			start: { line: 0, character: 10 },
			end: { line: 0, character: 20 }
		});
	});

	test('accepts resolved GuideNH page references', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const index = new GuideNhWorkspaceIndex();
		index.updatePage('file:///repo/index.md', '# Index');
		index.updatePage('file:///repo/crafting.md', '# Crafting');
		const diagnostics = createGuideNhDiagnostics('---\nnavigation:\n  parent: index.md\n---\n<ItemLink linksTo="crafting.md" />', schema, index);
		assert.strictEqual(diagnostics.some((item: Diagnostic) => item.message.includes('Unknown GuideNH page')), false);
	});
});
