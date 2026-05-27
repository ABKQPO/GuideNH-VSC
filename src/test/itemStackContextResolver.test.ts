import * as assert from 'assert';
import * as vscode from 'vscode';
import { findItemStackContextAtPosition, findVisibleItemStackContexts } from '../client/itemStack/itemStackContextResolver';

suite('GuideNH item stack context resolver', () => {
	test('finds supported item id attributes inside visible ranges', async () => {
		const document = await vscode.workspace.openTextDocument({
			language: 'markdown',
			content: [
				'<Block id="minecraft:stone" />',
				'<ReplaceBlock from="minecraft:dirt" to="gregtech:gt.blockmachines" />',
				'<Entity id="minecraft:zombie" />'
			].join('\n')
		});
		const fullRange = new vscode.Range(new vscode.Position(0, 0), document.lineAt(document.lineCount - 1).range.end);
		const contexts = findVisibleItemStackContexts(document, [fullRange]);
		assert.deepStrictEqual(
			contexts.map((context) => `${context.tagName}.${context.attributeName}=${context.value}`),
			[
				'Block.id=minecraft:stone',
				'ReplaceBlock.from=minecraft:dirt',
				'ReplaceBlock.to=gregtech:gt.blockmachines'
			]
		);
	});

	test('resolves the context at the cursor position', async () => {
		const document = await vscode.workspace.openTextDocument({
			language: 'markdown',
			content: '<ItemImage id="gregtech:gt.blockmachines" />'
		});
		const position = new vscode.Position(0, 22);
		const context = findItemStackContextAtPosition(document, position);
		assert.ok(context);
		assert.strictEqual(context?.tagName, 'ItemImage');
		assert.strictEqual(context?.attributeName, 'id');
		assert.strictEqual(context?.value, 'gregtech:gt.blockmachines');
	});
});
