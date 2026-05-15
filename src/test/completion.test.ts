import * as assert from 'assert';
import * as path from 'path';
import { CompletionItem, CompletionItemKind, InsertTextFormat } from 'vscode-languageserver/node';
import { createGuideNhCompletions } from '../server/providers/completion';
import { loadGuideNhSchema } from '../server/schema/schemaLoader';

suite('GuideNH completion provider', () => {
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
});
