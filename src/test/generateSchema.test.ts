import * as assert from 'assert';
import { enhanceGeneratedTagsFromJavaSources, extractTagNamesFromJavaSource, scanJavaCompilerSource } from '../scripts/generateSchema';

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
			color: { type: 'color', valueStyle: 'string' },
			formula: { type: 'string', valueStyle: 'string' },
			scale: { type: 'number', valueStyle: 'expression' },
			showTooltip: { type: 'boolean', valueStyle: 'expression' }
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
			linksTo: { type: 'page', valueStyle: 'string' },
			src: { type: 'resource', valueStyle: 'string' },
			title: { type: 'string', valueStyle: 'string' },
			visible: { type: 'boolean', valueStyle: 'expression' },
			width: { type: 'number', valueStyle: 'string' }
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
			maxHeight: { type: 'number', valueStyle: 'string' }
		});
	});

	test('extracts implicit item id and ore attributes from item stack helpers', () => {
		const source = `
			public Set<String> getTagNames() {
				return Collections.singleton("ItemImage");
			}
			protected void compile(PageCompiler compiler, LytErrorSink errorSink, MdxJsxElementFields el) {
				var stack = MdxAttrs.getRequiredItemStack(compiler, errorSink, el);
			}
		`;
		const result = scanJavaCompilerSource(source);
		assert.deepStrictEqual(result.tags.ItemImage.attributes, {
			id: { type: 'item', valueStyle: 'string' },
			ore: { type: 'ore', valueStyle: 'string' }
		});
	});

	test('extracts block references as item-like ids', () => {
		const source = `
			public Set<String> getTagNames() {
				return Collections.singleton("BlockImage");
			}
			protected void compile(PageCompiler compiler, LytErrorSink errorSink, MdxJsxElementFields el) {
				var blockReference = MdxAttrs.getRequiredBlockReference(compiler, errorSink, el, "id");
			}
		`;
		const result = scanJavaCompilerSource(source);
		assert.deepStrictEqual(result.tags.BlockImage.attributes, {
			id: { type: 'item', valueStyle: 'string' }
		});
	});

	test('merges common chart and axis attributes into chart compilers', () => {
		const commonChartAttrs = `
			public class CommonChartAttrs {
				public static void apply(LytChartBase chart, PageCompiler compiler, LytErrorSink errorSink, MdxJsxElementFields el) {
					chart.setTitle(MdxAttrs.getString(compiler, errorSink, el, "title", null));
					int w = MdxAttrs.getInt(compiler, errorSink, el, "width", -1);
					int h = MdxAttrs.getInt(compiler, errorSink, el, "height", -1);
					String titleColor = MdxAttrs.getString(compiler, errorSink, el, "titleColor", null);
				}
			}
		`;
		const columnChart = `
			public class ColumnChartCompiler extends BlockTagCompiler {
				public Set<String> getTagNames() {
					return Collections.singleton("ColumnChart");
				}
				protected void compile(PageCompiler compiler, LytBlockContainer parent, MdxJsxElementFields el) {
					CommonChartAttrs.apply(chart, compiler, parent, el);
					ChartAttrParser.parseAxisOptions(compiler, parent, el, "yAxis", "showYGrid", "yGridColor");
					String categories = MdxAttrs.getString(compiler, parent, el, "categories", null);
				}
			}
		`;
		const scanned = scanJavaCompilerSource(columnChart).tags;
		const enhanced = enhanceGeneratedTagsFromJavaSources(scanned, [
			{ path: '/chart/CommonChartAttrs.java', text: commonChartAttrs },
			{ path: '/chart/ColumnChartCompiler.java', text: columnChart }
		]);

		assert.deepStrictEqual(enhanced.ColumnChart.attributes, {
			categories: { type: 'string', valueStyle: 'string' },
			height: { type: 'number', valueStyle: 'string' },
			showYGrid: { type: 'boolean', valueStyle: 'expression' },
			title: { type: 'string', valueStyle: 'string' },
			titleColor: { type: 'string', valueStyle: 'string' },
			width: { type: 'number', valueStyle: 'string' },
			yAxisLabel: { type: 'string', valueStyle: 'string' },
			yAxisMax: { type: 'number', valueStyle: 'expression' },
			yAxisMin: { type: 'number', valueStyle: 'expression' },
			yAxisStep: { type: 'number', valueStyle: 'expression' },
			yAxisTickFormat: { type: 'string', valueStyle: 'string' },
			yAxisUnit: { type: 'string', valueStyle: 'string' },
			yGridColor: { type: 'string', valueStyle: 'string' }
		});
	});

	test('creates chart child tag schemas from shared child parser', () => {
		const childParser = `
			public class ChartChildParser {
				private static void parseSeriesInternal(PageCompiler compiler, LytErrorSink errorSink, MdxJsxElementFields childEl) {
					if (!"Series".equals(name)) return;
					String seriesName = MdxAttrs.getString(compiler, errorSink, childEl, "name", "");
					String colorStr = MdxAttrs.getString(compiler, errorSink, childEl, "color", null);
					String data = MdxAttrs.getString(compiler, errorSink, childEl, "data", "");
				}
				public static List<PieSlice> parseSlices(PageCompiler compiler, LytErrorSink errorSink, MdxJsxElementFields parentEl) {
					if (!"Slice".equals(name)) return;
				}
				public static PieInsetSpec parsePieInset(PageCompiler compiler, LytErrorSink errorSink, MdxJsxElementFields parentEl) {
					if (!"PieInset".equals(name)) return;
				}
				public static List<ChartSeries> parseLineOverlays(PageCompiler compiler, LytErrorSink errorSink, MdxJsxElementFields parentEl) {
					if (!"LineSeries".equals(name)) return;
				}
			}
		`;
		const enhanced = enhanceGeneratedTagsFromJavaSources({}, [
			{ path: '/chart/ChartChildParser.java', text: childParser }
		]);

		assert.deepStrictEqual(enhanced.Series.attributes, {
			color: { type: 'string', valueStyle: 'string' },
			data: { type: 'string', valueStyle: 'string' },
			icon: { type: 'string', valueStyle: 'string' },
			iconImage: { type: 'string', valueStyle: 'string' },
			name: { type: 'string', valueStyle: 'string' },
			points: { type: 'string', valueStyle: 'string' },
			tooltip: { type: 'string', valueStyle: 'string' }
		});
		assert.deepStrictEqual(enhanced.Series.children, ['Point']);
		assert.deepStrictEqual(enhanced.Point.attributes, {
			atX: { type: 'number', valueStyle: 'expression' },
			atY: { type: 'number', valueStyle: 'expression' },
			color: { type: 'string', valueStyle: 'string' },
			label: { type: 'string', valueStyle: 'string' },
			plot: { type: 'number', valueStyle: 'expression' },
			x: { type: 'number', valueStyle: 'expression' },
			y: { type: 'number', valueStyle: 'expression' }
		});
		assert.deepStrictEqual(enhanced.Slice.attributes, {
			color: { type: 'string', valueStyle: 'string' },
			icon: { type: 'string', valueStyle: 'string' },
			iconImage: { type: 'string', valueStyle: 'string' },
			label: { type: 'string', valueStyle: 'string' },
			name: { type: 'string', valueStyle: 'string' }
			,
			tooltip: { type: 'string', valueStyle: 'string' },
			value: { type: 'number', valueStyle: 'expression' }
		});
	});
});
