import * as assert from 'assert';
import { extractTagNamesFromJavaSource, scanJavaCompilerSource } from '../scripts/generateSchema';

suite('GuideNH schema generator', () => {
	test('extracts registered compiler tag names', () => {
		const source = `
			registerCompiler(new GameSceneCompiler());
			compilers.put("ItemLink", new ItemLinkCompiler());
		`;
		const tags = extractTagNamesFromJavaSource(source);
		assert.ok(tags.includes('ItemLink'));
	});

	test('extracts tag names from getTagNames implementations', () => {
		const source = `
			public Set<String> getTagNames() {
				return new HashSet<>(Arrays.asList("Recipe", "RecipeFor", "RecipeUsage"));
			}
		`;
		const tags = extractTagNamesFromJavaSource(source);
		assert.deepStrictEqual(tags, ['Recipe', 'RecipeFor', 'RecipeUsage']);
	});

	test('ignores quoted strings outside getTagNames implementations', () => {
		const source = `
			private static final Set<String> ROOT_ATTRIBUTES =
				new HashSet<>(Arrays.asList("width", "height", "allowLayerSlider"));
			public Set<String> getTagNames() {
				return Collections.singleton("GameScene");
			}
		`;
		const tags = extractTagNamesFromJavaSource(source);
		assert.deepStrictEqual(tags, ['GameScene']);
	});

	test('resolves string constants inside getTagNames implementations', () => {
		const source = `
			private static final String TAG_NAME = "Latex";
			public Set<String> getTagNames() {
				return Collections.singleton(TAG_NAME);
			}
		`;
		const tags = extractTagNamesFromJavaSource(source);
		assert.deepStrictEqual(tags, ['Latex']);
	});

	test('extracts MdxAttrs attributes with schema types', () => {
		const source = `
			public Set<String> getTagNames() {
				return Collections.singleton("Latex");
			}
			protected void compile(PageCompiler compiler, LytBlockContainer parent, MdxJsxElementFields el) {
				String formula = MdxAttrs.getString(compiler, parent, el, "formula", null);
				float scale = MdxAttrs.getFloat(compiler, parent, el, "scale", 1f);
				boolean showTooltip = MdxAttrs.getBoolean(compiler, parent, el, "showTooltip", false);
				String colorStr = MdxAttrs.getColor(compiler, parent, el, "color", null);
			}
		`;
		const result = scanJavaCompilerSource(source);
		assert.deepStrictEqual(result.tags.Latex.attributes, {
			color: { type: 'color' },
			formula: { type: 'string' },
			scale: { type: 'number' },
			showTooltip: { type: 'boolean' }
		});
	});
});
