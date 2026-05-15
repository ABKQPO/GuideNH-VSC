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
});
