import * as assert from 'assert';
import * as path from 'path';
import { CompletionItem, CompletionItemKind } from 'vscode-languageserver/node';
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
});
