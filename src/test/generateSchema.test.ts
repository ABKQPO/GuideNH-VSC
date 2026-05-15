import * as assert from 'assert';
import { extractTagNamesFromJavaSource } from '../scripts/generateSchema';

suite('GuideNH schema generator', () => {
	test('extracts registered compiler tag names', () => {
		const source = `
			registerCompiler(new GameSceneCompiler());
			compilers.put("ItemLink", new ItemLinkCompiler());
		`;
		const tags = extractTagNamesFromJavaSource(source);
		assert.ok(tags.includes('ItemLink'));
	});
});
