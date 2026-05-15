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

	test('tracks attribute value ranges when the value matches the attribute name', () => {
		const parsed = parseGuideNhDocument('<GuideExample name="name" />');
		assert.deepStrictEqual(parsed.tags[0].attributeRanges.name, {
			start: 20,
			end: 24
		});
	});
});
