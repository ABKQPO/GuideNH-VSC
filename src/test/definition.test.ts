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

	test('resolves navigation parent values at the cursor position', () => {
		const index = new GuideNhWorkspaceIndex();
		index.updatePage('file:///repo/index.md', '# Index');
		const text = '---\nnavigation:\n  parent: index.md\n---\n';
		const definition = createGuideNhDefinition(text, text.indexOf('index.md') + 1, index);
		assert.strictEqual((definition as Location | undefined)?.uri, 'file:///repo/index.md');
	});

	test('resolves linksTo attribute values at the cursor position', () => {
		const index = new GuideNhWorkspaceIndex();
		index.updatePage('file:///repo/crafting.md', '# Crafting');
		const text = '<ItemLink id="minecraft:stone" linksTo="./crafting.md#smelting" />';
		const definition = createGuideNhDefinition(text, text.indexOf('crafting.md') + 1, index);
		assert.strictEqual((definition as Location | undefined)?.uri, 'file:///repo/crafting.md');
	});
});
