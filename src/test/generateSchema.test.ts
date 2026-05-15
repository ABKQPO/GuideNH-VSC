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

	test('resolves collection constants and modern collection factories', () => {
		const source = `
			private static final String PREFIX = "Recipe";
			private static final String USAGE = PREFIX + "Usage";
			private static final Set<String> TAGS = Set.of("Recipe", "RecipeFor", USAGE);
			private static final String[] EXTRA_TAGS = new String[] { "RecipesFor" };
			public Set<String> getTagNames() {
				return new HashSet<>(TAGS);
			}
			public Set<String> getExtraTagNames() {
				return new HashSet<>(Arrays.asList(EXTRA_TAGS));
			}
		`;
		const tags = extractTagNamesFromJavaSource(source);
		assert.deepStrictEqual(tags, ['Recipe', 'RecipeFor', 'RecipeUsage']);
	});

	test('extracts List.of and new String array tag names directly from getTagNames', () => {
		const source = `
			public Set<String> getTagNames() {
				return ImmutableSet.of("QuestCard", "QuestLink");
			}
			public Collection<String> getOtherNames() {
				return List.of("IgnoredOutsideGetTagNames");
			}
		`;
		const tags = extractTagNamesFromJavaSource(source);
		assert.deepStrictEqual(tags, ['QuestCard', 'QuestLink']);
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

	test('extracts additional MdxAttrs and fallback attribute reader types', () => {
		const source = `
			public Set<String> getTagNames() {
				return Collections.singleton("ImportStructure");
			}
			protected void compile(PageCompiler compiler, LytBlockContainer parent, MdxJsxElementFields el) {
				ResourceLocation src = MdxAttrs.getResource(compiler, parent, el, "src", null);
				String linksTo = MdxAttrs.getPage(compiler, parent, el, "linksTo", null);
				String title = el.getAttributeString("title", "");
				boolean visible = el.getAttributeBoolean("visible", true);
				int width = el.getAttributeInt("width", 100);
			}
		`;
		const result = scanJavaCompilerSource(source);
		assert.deepStrictEqual(result.tags.ImportStructure.attributes, {
			linksTo: { type: 'page' },
			src: { type: 'resource' },
			title: { type: 'string' },
			visible: { type: 'boolean' },
			width: { type: 'number' }
		});
	});

	test('extracts chained MdxAttrs calls split across lines', () => {
		const source = `
			public Set<String> getTagNames() {
				return Collections.singleton("Scene");
			}
			protected void compile(PageCompiler compiler, LytErrorSink errorSink, MdxJsxElementFields el) {
				MdxAttrs
					.getInt(compiler, errorSink, el, "maxHeight", 180);
			}
		`;
		const result = scanJavaCompilerSource(source);
		assert.deepStrictEqual(result.tags.Scene.attributes, {
			maxHeight: { type: 'number' }
		});
	});
});
