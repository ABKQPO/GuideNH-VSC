import * as assert from 'assert';
import * as path from 'path';
import { CompletionItem, CompletionItemKind, InsertTextFormat } from 'vscode-languageserver/node';
import { createGuideNhCompletions, GuideNhCompletionTriggerCharacters } from '../server/providers/completion';
import { loadGuideNhSchema } from '../server/schema/schemaLoader';

suite('GuideNH completion provider', () => {
	test('declares trigger characters for GuideNH syntax families', () => {
		for (const trigger of ['<', ' ', '"', '\'', '`', '=', '+', ':', '^']) {
			assert.ok(GuideNhCompletionTriggerCharacters.includes(trigger));
		}
	});

	test('completes tags after opening angle bracket', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const items = createGuideNhCompletions('<', 1, schema, undefined);
		assert.ok(items.some((item: CompletionItem) => item.label === 'GameScene' && item.kind === CompletionItemKind.Class));
	});

	test('completes GameScene attributes', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const items = createGuideNhCompletions('<GameScene ', 11, schema, undefined);
		assert.ok(items.some((item: CompletionItem) => item.label === 'interactive'));
	});

	test('completes reusable GuideNH snippets', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const items = createGuideNhCompletions('<', 1, schema, undefined);
		const snippet = items.find((item: CompletionItem) => item.label === 'GameScene' && item.kind === CompletionItemKind.Snippet);
		assert.strictEqual(snippet?.insertTextFormat, InsertTextFormat.Snippet);
		assert.match(String(snippet?.insertText), /<GameScene width="\$\{1:220\}"/);
	});

	test('completes top-level frontmatter keys', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const text = '---\nna\n---\n';
		const items = createGuideNhCompletions(text, 6, schema, undefined);
		assert.ok(items.some((item: CompletionItem) => item.label === 'navigation' && item.kind === CompletionItemKind.Property));
		assert.ok(items.some((item: CompletionItem) => item.label === 'item_ids' && item.detail === 'list'));
	});

	test('completes nested frontmatter keys', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const text = '---\nnavigation:\n  ti\n---\n';
		const items = createGuideNhCompletions(text, 20, schema, undefined);
		assert.ok(items.some((item: CompletionItem) => item.label === 'title' && item.kind === CompletionItemKind.Property));
		assert.ok(items.some((item: CompletionItem) => item.label === 'required_mods' && item.detail === 'list'));
	});

	test('completes GuideNH inline markdown markers', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const items = createGuideNhCompletions('Use =', 5, schema, undefined);
		const highlight = items.find((item: CompletionItem) => item.label === 'highlight');
		assert.strictEqual(highlight?.kind, CompletionItemKind.Snippet);
		assert.strictEqual(highlight?.insertTextFormat, InsertTextFormat.Snippet);
		assert.strictEqual(highlight?.insertText, '==${1:text}==');
	});

	test('completes GuideNH fenced code block languages', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const items = createGuideNhCompletions('```f', 4, schema, undefined);
		assert.ok(items.some((item: CompletionItem) => item.label === 'filetree' && item.kind === CompletionItemKind.Value));
		assert.ok(items.some((item: CompletionItem) => item.label === 'funcgraph' && item.detail === 'GuideNH fenced block'));
	});
});
