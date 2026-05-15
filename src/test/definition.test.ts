import * as assert from 'assert';
import { Location } from 'vscode-languageserver/node';
import { GuideNhWorkspaceIndex } from '../server/index/workspaceIndex';
import { createGuideNhDefinition } from '../server/providers/definition';

suite('GuideNH definition provider', () => {
	test('resolves the markdown link at the cursor position', () => {
		const index = new GuideNhWorkspaceIndex();
		index.updatePage('file:///repo/a.md', '[A](a.md)');
		index.updatePage('file:///repo/b.md', '[B](b.md)');
		const text = '[A](a.md) and [B](b.md)';
		const definition = createGuideNhDefinition(text, text.indexOf('b.md') + 1, index);
		assert.strictEqual((definition as Location | undefined)?.uri, 'file:///repo/b.md');
	});

	test('ignores markdown links away from the cursor position', () => {
		const index = new GuideNhWorkspaceIndex();
		index.updatePage('file:///repo/a.md', '[A](a.md)');
		const definition = createGuideNhDefinition('prefix [A](a.md)', 1, index);
		assert.strictEqual(definition, undefined);
	});
});
