import * as assert from 'assert';
import * as vscode from 'vscode';
import {
	findBestMatchingItemStackContext,
	findItemStackContextAtPosition,
	findNearestItemStackContextInEditor,
	findNearestItemStackContextAtPosition,
	findVisibleItemStackContexts
} from '../client/itemStack/itemStackContextResolver';

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

	test('finds the item stack context when the cursor is at the end of the value range', async () => {
		const document = await vscode.workspace.openTextDocument({
			language: 'markdown',
			content: '<ItemImage id="minecraft:stone" />'
		});
		const context = findNearestItemStackContextAtPosition(document, new vscode.Position(0, 30));
		assert.ok(context);
		assert.strictEqual(context?.value, 'minecraft:stone');
		assert.deepStrictEqual(
			context?.valueRange,
			new vscode.Range(new vscode.Position(0, 15), new vscode.Position(0, 30))
		);
	});

	test('resolves the nearest item stack context from an editor selection', async () => {
		const document = await vscode.workspace.openTextDocument({
			language: 'markdown',
			content: '<Block id="minecraft:crafting_table" />'
		});
		const editor = await vscode.window.showTextDocument(document);
		editor.selection = new vscode.Selection(new vscode.Position(0, 34), new vscode.Position(0, 34));
		const context = findNearestItemStackContextInEditor(editor);
		assert.ok(context);
		assert.strictEqual(context?.value, 'minecraft:crafting_table');
	});

	test('relocates a stale context to the same tag and attribute instead of the nearest unrelated item stack', async () => {
		const document = await vscode.workspace.openTextDocument({
			language: 'markdown',
			content: [
				'<ReplaceBlock from="minecraft:stone" to="minecraft:dirt" />',
				'<ItemLink id="minecraft:apple" />'
			].join('\n')
		});
		const fullRange = new vscode.Range(new vscode.Position(0, 0), document.lineAt(document.lineCount - 1).range.end);
		const contexts = findVisibleItemStackContexts(document, [fullRange]);
		const fromContext = contexts.find((context) => context.tagName === 'ReplaceBlock' && context.attributeName === 'from');
		assert.ok(fromContext);
		const staleContext = {
			...fromContext!,
			value: 'minecraft:stone',
			valueRange: new vscode.Range(new vscode.Position(0, 21), new vscode.Position(0, 36))
		};
		const shiftedDocument = await vscode.workspace.openTextDocument({
			language: 'markdown',
			content: [
				'<ReplaceBlock from="  minecraft:stone" to="minecraft:dirt" />',
				'<ItemLink id="minecraft:apple" />'
			].join('\n')
		});
		const match = findBestMatchingItemStackContext(shiftedDocument, staleContext);
		assert.ok(match);
		assert.strictEqual(match?.tagName, 'ReplaceBlock');
		assert.strictEqual(match?.attributeName, 'from');
		assert.strictEqual(match?.value.trim(), 'minecraft:stone');
	});

	test('refuses relocation when only a different attribute remains nearby', async () => {
		const document = await vscode.workspace.openTextDocument({
			language: 'markdown',
			content: '<ReplaceBlock from="minecraft:stone" to="minecraft:dirt" />'
		});
		const fullRange = new vscode.Range(new vscode.Position(0, 0), document.lineAt(0).range.end);
		const contexts = findVisibleItemStackContexts(document, [fullRange]);
		const fromContext = contexts.find((context) => context.attributeName === 'from');
		assert.ok(fromContext);
		const rewrittenDocument = await vscode.workspace.openTextDocument({
			language: 'markdown',
			content: '<ReplaceBlock to="minecraft:dirt" />'
		});
		const match = findBestMatchingItemStackContext(rewrittenDocument, fromContext!);
		assert.strictEqual(match, undefined);
	});
});
