import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { createGuideNhDiagnostics } from '../server/providers/diagnostics';
import { setServerLocale } from '../server/localization';
import { loadGuideNhSchema } from '../server/schema/schemaLoader';

suite('GuideNH localization', () => {
	test('ships Chinese runtime localization bundle', () => {
		const bundlePath = path.join(__dirname, '..', '..', 'l10n', 'bundle.l10n.zh-cn.json');
		const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8')) as Record<string, string>;
		assert.strictEqual(bundle['GuideNH runtime bridge connected.'], 'GuideNH 运行时桥接已连接。');
	});

	test('localizes server diagnostics by initialized locale', async () => {
		const schema = await loadGuideNhSchema(path.join(__dirname, '..', '..', 'src', 'schema'));
		setServerLocale('zh-cn');
		const diagnostics = createGuideNhDiagnostics('<UnknownTag />', schema);
		setServerLocale('en');

		assert.strictEqual(diagnostics[0].message, '未知 GuideNH 标签 UnknownTag');
	});
});
