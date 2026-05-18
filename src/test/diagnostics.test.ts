import * as assert from 'assert';
import * as path from 'path';
import { Diagnostic } from 'vscode-languageserver/node';
import { GuideNhResourceIndex } from '../server/index/resourceIndex';
import { GuideNhWorkspaceIndex } from '../server/index/workspaceIndex';
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

	test('reports invalid tag attribute value types', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const diagnostics = createGuideNhDiagnostics('<GameScene width="wide" interactive="maybe" />', schema);
		assert.deepStrictEqual(
			diagnostics.map((item: Diagnostic) => item.message),
			[
				'Attribute width on GameScene expects number value',
				'Attribute interactive on GameScene expects boolean value'
			]
		);
		assert.deepStrictEqual(diagnostics[0].range, {
			start: { line: 0, character: 18 },
			end: { line: 0, character: 22 }
		});
	});

	test('validates GuideNH attribute value styles', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const validText = [
			'<GameScene width="256" height="192" zoom={4} interactive={true}>',
			'  <Block id="minecraft:diamond_block" x="-1" y="1" z="-1" />',
			'</GameScene>'
		].join('\n');
		const invalidText = '<GameScene width={256} interactive="true" />';

		assert.deepStrictEqual(createGuideNhDiagnostics(validText, schema), []);
		assert.deepStrictEqual(
			createGuideNhDiagnostics(invalidText, schema).map((item: Diagnostic) => item.message),
			[
				'Attribute width on GameScene expects number value',
				'Attribute interactive on GameScene expects boolean value'
			]
		);
	});

	test('accepts nested GameScene content inside annotations', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const text = [
			'<GameScene width="256" height="192" zoom={4} interactive={true}>',
			'  <DiamondAnnotation pos="0.5 2.2 0.5" color="#FFD24C">',
			'    <GameScene width="160" height="128" zoom={5} interactive={false}>',
			'      <Block id="minecraft:diamond_block" x="-1" />',
			'    </GameScene>',
			'  </DiamondAnnotation>',
			'</GameScene>'
		].join('\n');

		assert.deepStrictEqual(createGuideNhDiagnostics(text, schema), []);
	});

	test('reports invalid tag enum attribute values', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const diagnostics = createGuideNhDiagnostics('<GameScene background="opaque" />', schema);
		assert.deepStrictEqual(diagnostics.map((item: Diagnostic) => item.message), ['Attribute background on GameScene expects enum value']);
		assert.deepStrictEqual(diagnostics[0].range, {
			start: { line: 0, character: 23 },
			end: { line: 0, character: 29 }
		});
	});

	test('reports tags that are not allowed inside the current parent tag', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const diagnostics = createGuideNhDiagnostics('<GameScene>\n  <Recipe id="minecraft:stone" />\n</GameScene>', schema);
		assert.strictEqual(diagnostics.some((item: Diagnostic) => item.message === 'Tag Recipe is not allowed inside GameScene'), true);
	});

	test('accepts tags allowed by the current parent tag', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const diagnostics = createGuideNhDiagnostics('<GameScene>\n  <Block id="minecraft:stone" />\n</GameScene>', schema);
		assert.strictEqual(diagnostics.some((item: Diagnostic) => item.message.includes('not allowed inside')), false);
	});

	test('does not apply parent tag rules after the parent is closed', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const diagnostics = createGuideNhDiagnostics('<GameScene>\n  <Block id="minecraft:stone" />\n</GameScene>\n<Recipe id="minecraft:stone" />', schema);
		assert.strictEqual(diagnostics.some((item: Diagnostic) => item.message === 'Tag Recipe is not allowed inside GameScene'), false);
	});

	test('reports mismatched closing tags', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const diagnostics = createGuideNhDiagnostics('<GameScene>\n</Recipe>', schema);
		assert.strictEqual(diagnostics.some((item: Diagnostic) => item.message === 'Closing tag Recipe does not match GameScene'), true);
	});

	test('reports unclosed tags', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const diagnostics = createGuideNhDiagnostics('<GameScene>\n  <Block id="minecraft:stone" />', schema);
		assert.strictEqual(diagnostics.some((item: Diagnostic) => item.message === 'Unclosed GuideNH tag GameScene'), true);
	});

	test('reports diagnostics at the tag line and character range', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const diagnostics = createGuideNhDiagnostics('intro\n  <UnknownTag />', schema);
		assert.deepStrictEqual(diagnostics[0].range, {
			start: { line: 1, character: 2 },
			end: { line: 1, character: 16 }
		});
	});

	test('reports unknown top-level frontmatter keys', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const diagnostics = createGuideNhDiagnostics('---\nunknown_key: true\nnavigation:\n  title: Intro\n---\n', schema);
		assert.strictEqual(diagnostics.length, 1);
		assert.strictEqual(diagnostics[0].message, 'Unknown frontmatter key unknown_key');
		assert.deepStrictEqual(diagnostics[0].range, {
			start: { line: 1, character: 0 },
			end: { line: 1, character: 11 }
		});
	});

	test('reports unknown nested frontmatter keys', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const diagnostics = createGuideNhDiagnostics('---\nnavigation:\n  unknown_child: value\n  title: Intro\n---\n', schema);
		assert.strictEqual(diagnostics.length, 1);
		assert.strictEqual(diagnostics[0].message, 'Unknown frontmatter key navigation.unknown_child');
		assert.deepStrictEqual(diagnostics[0].range, {
			start: { line: 2, character: 2 },
			end: { line: 2, character: 15 }
		});
	});

	test('does not cascade unknown frontmatter parent diagnostics to children', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const diagnostics = createGuideNhDiagnostics('---\nunknown_parent:\n  child: value\n---\n', schema);
		assert.deepStrictEqual(
			diagnostics.map((item: Diagnostic) => item.message),
			['Unknown frontmatter key unknown_parent']
		);
	});

	test('reports invalid frontmatter scalar value types', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const diagnostics = createGuideNhDiagnostics('---\nzoom: fast\ncategories: tech\n---\n', schema);
		assert.deepStrictEqual(
			diagnostics.map((item: Diagnostic) => item.message),
			[
				'Frontmatter key zoom expects number value',
				'Frontmatter key categories expects list value'
			]
		);
		assert.deepStrictEqual(diagnostics[0].range, {
			start: { line: 1, character: 6 },
			end: { line: 1, character: 10 }
		});
	});

	test('accepts valid frontmatter scalar value types', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const diagnostics = createGuideNhDiagnostics('---\nzoom: 1.25\ncategories: [intro, tools]\nnavigation:\n  title: Intro\n---\n', schema);
		assert.deepStrictEqual(diagnostics, []);
	});

	test('reports unresolved GuideNH page references', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const index = new GuideNhWorkspaceIndex();
		index.updatePage('file:///repo/index.md', '# Index');
		const text = [
			'[Missing](missing.md)',
			'---',
			'navigation:',
			'  parent: absent.md',
			'---',
			'<ItemLink id="minecraft:stone" linksTo="./gone.md#usage" />'
		].join('\n');
		const diagnostics = createGuideNhDiagnostics(text, schema, index);
		assert.deepStrictEqual(
			diagnostics.map((item: Diagnostic) => item.message),
			[
				'Unknown GuideNH page missing.md',
				'Unknown GuideNH page absent.md',
				'Unknown GuideNH page gone.md'
			]
		);
		assert.deepStrictEqual(diagnostics[0].range, {
			start: { line: 0, character: 10 },
			end: { line: 0, character: 20 }
		});
	});

	test('accepts resolved GuideNH page references', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const index = new GuideNhWorkspaceIndex();
		index.updatePage('file:///repo/index.md', '# Index');
		index.updatePage('file:///repo/crafting.md', '# Crafting');
		const diagnostics = createGuideNhDiagnostics('---\nnavigation:\n  parent: index.md\n---\n<ItemLink linksTo="crafting.md" />', schema, index);
		assert.strictEqual(diagnostics.some((item: Diagnostic) => item.message.includes('Unknown GuideNH page')), false);
	});

	test('reports unresolved GuideNH resource references', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const resourceIndex = new GuideNhResourceIndex();
		const text = [
			'<FloatingImage src="./images/missing.png" />',
			'<ImportStructure src="icons/missing.png" />'
		].join('\n');
		const diagnostics = createGuideNhDiagnostics(text, schema, undefined, resourceIndex);
		assert.deepStrictEqual(
			diagnostics.map((item: Diagnostic) => item.message),
			[
				'Unknown GuideNH resource images/missing.png',
				'Unknown GuideNH resource icons/missing.png'
			]
		);
	});

	test('accepts resolved GuideNH resource references', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const resourceIndex = new GuideNhResourceIndex();
		resourceIndex.updateResource('file:///repo/assets/mod/guidenh/_en_us/images/test1.png');
		const diagnostics = createGuideNhDiagnostics('<FloatingImage src="./images/test1.png" />', schema, undefined, resourceIndex);
		assert.strictEqual(diagnostics.some((item: Diagnostic) => item.message.includes('Unknown GuideNH resource')), false);
	});

	test('accepts chart common attributes and series children', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const text = [
			'<LineChart',
			'  title="温度"',
			'  categories="周一,周二,周三,周四,周五"',
			'  yAxisUnit="℃"',
			'  width="400"',
			'  height="240"',
			'>',
			'  <Series name="室外" color="#ff6644" data="18,22,25,20,17" />',
			'  <Series name="室内" color="#44aaff" data="22,23,23,22,22" />',
			'</LineChart>'
		].join('\n');
		const diagnostics = createGuideNhDiagnostics(text, schema);

		assert.deepStrictEqual(diagnostics, []);
	});

	test('accepts GuideNH chart child tags used by bundled docs', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const text = [
			'GuideNH chart tags: `<ColumnChart>` `<BarChart>` `<LineChart>` `<PieChart>` `<ScatterChart>`.',
			'<LineChart title="Signal" xAxisLabel="Distance" yAxisLabel="Loss" width="400" height="240">',
			'  <Series name="Air" color="#44ff88">',
			'    <Point x="0" y="0" />',
			'    <Point x="10" y="-2" />',
			'  </Series>',
			'</LineChart>',
			'<PieChart title="Ratio" width="340" height="240">',
			'  <Slice name="Iron" color="#888888" value="40" />',
			'</PieChart>',
			'<ColumnChart title="Combo" categories="A,B" width="420" height="240">',
			'  <Series name="Iron" color="#888888" data="80,120" />',
			'  <LineSeries name="Total" color="#ff4466" data="100,150" />',
			'  <PieInset title="Inset" width="120" height="120">',
			'    <Slice name="Iron" color="#888888" value="80" />',
			'  </PieInset>',
			'</ColumnChart>'
		].join('\n');
		const diagnostics = createGuideNhDiagnostics(text, schema);

		assert.deepStrictEqual(diagnostics, []);
	});

	test('accepts generated image id attributes', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const diagnostics = createGuideNhDiagnostics('<ItemImage id="minecraft:stone" />\n<BlockImage id="minecraft:crafting_table" />', schema);
		assert.deepStrictEqual(diagnostics, []);
	});

	test('accepts ItemImage tooltip and boolean tooltip toggles used by tooltip docs', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const text = [
			'<ItemImage id="minecraft:diamond_sword" noTooltip={true} />',
			'<ItemImage id="minecraft:apple" tooltip="Plain tooltip text." />',
			'<ItemImage id="minecraft:golden_apple" showTooltip={false} />'
		].join('\n');

		assert.deepStrictEqual(createGuideNhDiagnostics(text, schema), []);
	});

	test('accepts floating image annotations and sound regions used by bundled image docs', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const text = [
			'<FloatingImage src="test1.png" align="right" width="200" height="80" title="stretch 200x80">',
			'  <ImageAnnotation x="10" y="10" w="60" h="40" border borderColor="#FFFF4444" borderThickness="2">',
			'    Highlighted tooltip',
			'  </ImageAnnotation>',
			'  <SoundArea x="64" y="0" w="64" h="128" sound="guidenh:guide.sample_hover" trigger="hover" />',
			'</FloatingImage>',
			'<SoundLink sound="guidenh:guide.sample_click" volume={0.8}>',
			'  Rich sound content',
			'</SoundLink>',
			'<FloatingImage src="test1.png" align="left" width="128" sound="guidenh:guide.sample_click" volume={0.8} />'
		].join('\n');

		assert.deepStrictEqual(createGuideNhDiagnostics(text, schema), []);
	});

	test('accepts ore-backed block references without requiring id', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const text = [
			'<BlockImage ore="logWood" scale={3} />',
			'<GameScene>',
			'  <Block ore="logWood" />',
			'</GameScene>'
		].join('\n');

		assert.deepStrictEqual(createGuideNhDiagnostics(text, schema), []);
	});

	test('accepts current GuideNH scene elements and attributes used by scene docs', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const text = [
			'<GameScene width="384" height="256" zoom={4} interactive={true} perspective="isometric_north_east" offsetX="2" offsetY="1">',
			'  <PlaceBlock id="minecraft:stone" dx="5" dy="1" dz="5" />',
			'  <ImportStructure src="/assets/example_structure.snbt" />',
			'  <ReplaceBlock from="minecraft:stone" to="minecraft:glass" />',
			'  <PlaySound sound="guidenh:guide.sample_click" trigger="click" volume={0.75} />',
			'  <IsometricCamera roll={15} />',
			'  <Block id="minecraft:furnace" facing="south" meta="3" />',
			'  <BlockStats mode="manual" corner="bottomRight" maxWidth="160" maxHeight="96">',
			'    <BlockStat item="minecraft:cobblestone" count={8} />',
			'  </BlockStats>',
			'  <BlockAnnotationTemplate id="minecraft:furnace">',
			'    <DiamondAnnotation pos="0.5 2.2 0.5" color="#FFD24C" />',
			'  </BlockAnnotationTemplate>',
			'</GameScene>'
		].join('\n');

		assert.deepStrictEqual(createGuideNhDiagnostics(text, schema), []);
	});

	test('accepts StructureLib conditional scene attributes', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const text = [
			'<GameScene interactive={true}>',
			'  <ImportStructureLib name="main" controller="gregtech:gt.blockmachines:15411" />',
			'  <BlockAnnotation showWhenStructure="main" showWhenTier="2..4,!3" showWhenChannels="input:1..3, casing:!2" pos="5 1 2" color="#FFD24C" />',
			'  <PlaySound sound="guidenh:guide.sample_click" trigger="click" showWhenStructure="main" showWhenTier="2..3" />',
			'</GameScene>'
		].join('\n');

		assert.deepStrictEqual(createGuideNhDiagnostics(text, schema), []);
	});

	test('accepts function graph tags and attributes used by bundled docs', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const text = [
			'<FunctionGraph width="360" height="220" xRange="-6..6" yRange="-3..3" quadrants="all" showGrid={true}>',
			'  <Plot expr="sin(x)" color="#ff5566" label="sin x" />',
			'  <Plot expr="x^2 / 4" color="#3399ff" domain="-4..4" label="x^2 / 4" />',
			'  <Point plot={0} atX={0} label="origin-ish" />',
			'</FunctionGraph>',
			'<Function expr="x^3" color="#44aaff" xRange="-3..3" yRange="-8..8" />'
		].join('\n');

		assert.deepStrictEqual(createGuideNhDiagnostics(text, schema), []);
	});

	test('accepts extended scene entity and line point attributes', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const text = [
			'<GameScene width="384" height="256" zoom={4} interactive={true}>',
			'  <Entity id="player" y="1" baby={false} showName={true} showCape={false} headRotation="0 20 0" rightArmRotation="0 0 25" />',
			'  <LineAnnotation from="0 0 0" to="1 1 1" showPoints={true} pointColor="#66ccff" pointSize={0.12}>',
			'    <LinePoint index="0" show color="#66ccff" />',
			'    <LinePoint index="1" color="#ff8844" size={0.12} />',
			'  </LineAnnotation>',
			'</GameScene>'
		].join('\n');

		assert.deepStrictEqual(createGuideNhDiagnostics(text, schema), []);
	});

	test('accepts top-level frontmatter title key', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const text = '---\ntitle: Rendering\nnavigation:\n  title: Rendering\n---\n';

		assert.deepStrictEqual(createGuideNhDiagnostics(text, schema), []);
	});

	test('resolves GuideNH resourcepack index page references', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const index = new GuideNhWorkspaceIndex();
		index.updatePage('file:///E:/Github/GuideNH/wiki/resourcepack/assets/guidenh/guidenh/_zh_cn/index.md', '# Index');
		const diagnostics = createGuideNhDiagnostics('---\nnavigation:\n  parent: index.md\n---\n', schema, index);
		assert.strictEqual(diagnostics.some((item: Diagnostic) => item.message.includes('Unknown GuideNH page')), false);
	});

	test('accepts lowercase GuideNH tags and attributes against mixed-case schema entries', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		const diagnostics = createGuideNhDiagnostics('<importstructurelib controller="gregtech:gt.blockmachines:1000" />', schema);
		assert.strictEqual(diagnostics.some((item: Diagnostic) => item.message.includes('Unknown GuideNH tag')), false);
		assert.strictEqual(diagnostics.some((item: Diagnostic) => item.message.includes('Unknown attribute')), false);
	});
});
