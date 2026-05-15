import * as assert from 'assert';
import { isGuideNhDocumentSelector, readGuideNhDefaults } from '../client/config';

suite('GuideNH extension configuration', () => {
	test('detects GuideNH resource pack Markdown paths', () => {
		assert.strictEqual(isGuideNhDocumentSelector('assets/guidenh/guidenh/_zh_cn/index.md'), true);
		assert.strictEqual(isGuideNhDocumentSelector('assets/gregtech/guidenh/_en_us/guide.md'), true);
		assert.strictEqual(isGuideNhDocumentSelector('README.md'), false);
	});

	test('does not provide runtime bridge defaults', () => {
		const defaults = readGuideNhDefaults();
		assert.strictEqual(defaults.runtimeHost, '');
		assert.strictEqual(defaults.runtimePort, 0);
		assert.strictEqual(defaults.runtimeToken, '');
		assert.strictEqual(defaults.runtimeAllowRemote, false);
	});
});
