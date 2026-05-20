import * as assert from 'assert';
import { parseGuideNhDocument } from '../server/parser/documentParser';

suite('GuideNH document parser', () => {
	test('extracts frontmatter and MDX tags', () => {
		const parsed = parseGuideNhDocument(`---
navigation:
  title: Machines
---

# Machines

<GameScene width="220">
  <Block id="minecraft:stone" />
</GameScene>
`);
		assert.strictEqual(parsed.frontmatter?.text.includes('navigation:'), true);
		assert.strictEqual(parsed.tags.length, 3);
		assert.strictEqual(parsed.tags[0].name, 'GameScene');
		assert.strictEqual(parsed.tags[1].attributes.id, 'minecraft:stone');
		assert.strictEqual(parsed.tags[2].name, 'GameScene');
		assert.strictEqual(parsed.tags[2].closing, true);
	});

	test('ignores MDX comments', () => {
		const parsed = parseGuideNhDocument('Visible {/* <ItemLink id="minecraft:stone" /> */} text');
		assert.strictEqual(parsed.tags.length, 0);
	});

	test('ignores tags inside inline and fenced code', () => {
		const parsed = parseGuideNhDocument([
			'Use `<ColumnChart>` in prose.',
			'```md',
			'<LineChart title="demo">',
			'  <Series name="ignored" />',
			'</LineChart>',
			'```',
			'<ItemImage id="minecraft:stone" />'
		].join('\n'));
		assert.deepStrictEqual(
			parsed.tags.map((tag) => tag.name),
			['ItemImage']
		);
	});

	test('tracks attribute value ranges when the value matches the attribute name', () => {
		const parsed = parseGuideNhDocument('<GuideExample name="name" />');
		assert.deepStrictEqual(parsed.tags[0].attributeRanges.name, {
			start: 20,
			end: 24
		});
	});

	test('tracks attribute value styles', () => {
		const parsed = parseGuideNhDocument('<GameScene width="256" zoom={4} interactive />');
		assert.deepStrictEqual(parsed.tags[0].attributeValueStyles, {
			width: 'string',
			zoom: 'expression',
			interactive: 'bare'
		});
	});

	test('parses lowercase GuideNH tags', () => {
		const parsed = parseGuideNhDocument('<details open><summary>More</summary><br /></details>');
		assert.deepStrictEqual(
			parsed.tags.map((tag) => tag.name),
			['details', 'summary', 'summary', 'br', 'details']
		);
	});

	test('parses details attributes used by runtime content blocks', () => {
		const parsed = parseGuideNhDocument('<details open width="220" height="150" wrap="square" align="right"></details>');
		assert.deepStrictEqual(parsed.tags[0].attributes, {
			open: 'bare',
			width: 'string',
			height: 'string',
			wrap: 'string',
			align: 'string'
		});
	});
});
