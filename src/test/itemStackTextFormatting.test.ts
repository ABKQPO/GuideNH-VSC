import * as assert from 'assert';
import {
	renderMinecraftFormattingHtml,
	serializeMinecraftTooltipLines,
	stripMinecraftFormatting
} from '../client/itemStack/itemStackTextFormatting';

suite('GuideNH item stack text formatting', () => {
	test('strips Minecraft formatting codes for plain text fields', () => {
		assert.strictEqual(stripMinecraftFormatting('§cError §lName§r'), 'Error Name');
	});

	test('renders Minecraft formatting codes as html spans', () => {
		const html = renderMinecraftFormattingHtml('§cRed §lBold');
		assert.ok(html.includes('color:#ff5555'));
		assert.ok(html.includes('font-weight:700'));
		assert.ok(html.includes('Red'));
		assert.ok(html.includes('Bold'));
	});

	test('serializes tooltip lines to html and plain text', () => {
		const lines = serializeMinecraftTooltipLines(['§aGreen', 'Plain']);
		assert.strictEqual(lines[0].plain, 'Green');
		assert.ok(lines[0].html.includes('color:#55ff55'));
		assert.strictEqual(lines[1].plain, 'Plain');
	});
});
