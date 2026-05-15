import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

suite('GuideNH extension automation', () => {
	test('uses project documentation instead of template README text', () => {
		const readme = fs.readFileSync(path.join(__dirname, '..', '..', 'README.md'), 'utf8');
		assert.strictEqual(readme.includes('This is the README for your extension'), false);
		assert.strictEqual(readme.includes('Describe specific features of your extension'), false);
		assert.strictEqual(readme.includes('Enjoy!'), false);
	});

	test('defines build and package scripts for automated release checks', () => {
		const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8')) as {
			scripts: Record<string, string>;
			devDependencies?: Record<string, string>;
		};
		assert.strictEqual(packageJson.scripts.build, 'npm run verify && npm run package');
		assert.strictEqual(packageJson.scripts.prepackage, 'node -e "require(\'fs\').mkdirSync(\'dist\', { recursive: true })"');
		assert.strictEqual(packageJson.scripts.package, 'vsce package --out dist/guide-vsc.vsix');
		assert.match(packageJson.scripts.verify, /npm run generate:schema/);
		assert.match(packageJson.scripts.verify, /npm run lint/);
		assert.match(packageJson.scripts.verify, /npm run compile/);
		assert.match(packageJson.scripts.verify, /npm test/);
		assert.ok(packageJson.devDependencies?.['@vscode/vsce']);
	});
});
