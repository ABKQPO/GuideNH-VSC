import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { resolveGuideNhServerModule } from '../client/languageClient';

suite('GuideNH extension automation', () => {
	test('uses project documentation instead of template README text', () => {
		const readme = fs.readFileSync(path.join(__dirname, '..', '..', 'README.md'), 'utf8');
		assert.strictEqual(readme.includes('This is the README for your extension'), false);
		assert.strictEqual(readme.includes('Describe specific features of your extension'), false);
		assert.strictEqual(readme.includes('Enjoy!'), false);
	});

	test('ships bilingual documentation and LGPLv3 licensing', () => {
		const root = path.join(__dirname, '..', '..');
		const englishReadme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
		const chineseReadme = fs.readFileSync(path.join(root, 'README.zh-CN.md'), 'utf8');
		const license = fs.readFileSync(path.join(root, 'LICENSE'), 'utf8');
		const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as { license?: string };
		assert.match(englishReadme, /GuideVSC/);
		assert.match(chineseReadme, /GuideVSC/);
		assert.match(chineseReadme, /运行时桥/);
		assert.match(license, /GNU LESSER GENERAL PUBLIC LICENSE/);
		assert.match(license, /Version 3, 29 June 2007/);
		assert.strictEqual(packageJson.license, 'LGPL-3.0-only');
		assert.strictEqual(fs.existsSync(path.join(root, 'vsc-extension-quickstart.md')), false);
	});

	test('defines build and package scripts for automated release checks', () => {
		const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8')) as {
			scripts: Record<string, string>;
			devDependencies?: Record<string, string>;
		};
		assert.strictEqual(packageJson.scripts.build, 'npm run verify && npm run package');
		assert.strictEqual(packageJson.scripts.prepackage, 'npm run compile && npm run bundle');
		assert.strictEqual(packageJson.scripts.package, 'vsce package --out dist/guide-vsc.vsix');
		assert.match(packageJson.scripts.verify, /npm run generate:schema/);
		assert.match(packageJson.scripts.verify, /npm run lint/);
		assert.match(packageJson.scripts.verify, /npm run compile/);
		assert.match(packageJson.scripts.verify, /npm test/);
		assert.ok(packageJson.devDependencies?.['@vscode/vsce']);
	});

	test('bundles release JavaScript before packaging', () => {
		const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8')) as {
			scripts: Record<string, string>;
			devDependencies?: Record<string, string>;
		};
		const vscodeIgnore = fs.readFileSync(path.join(__dirname, '..', '..', '.vscodeignore'), 'utf8');
		assert.strictEqual(packageJson.scripts.bundle, 'node ./out/scripts/bundle.js');
		assert.strictEqual(packageJson.scripts['vscode:prepublish'], undefined);
		assert.strictEqual(packageJson.scripts.prepackage, 'npm run compile && npm run bundle');
		assert.ok(packageJson.devDependencies?.esbuild);
		assert.match(vscodeIgnore, /^out\/\*\*$/m);
		assert.match(vscodeIgnore, /^!out\/extension\.js$/m);
		assert.match(vscodeIgnore, /^!out\/server\.js$/m);
		assert.match(vscodeIgnore, /^node_modules\/\*\*$/m);
	});

	test('keeps runtime validation command registered in the extension manifest', () => {
		const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8')) as {
			activationEvents: string[];
			contributes: { commands: Array<{ command: string; title: string }> };
		};
		assert.ok(packageJson.activationEvents.includes('onCommand:guide-vsc.validateRuntimeDocument'));
		assert.ok(packageJson.contributes.commands.some((command) => command.command === 'guide-vsc.validateRuntimeDocument'));
	});

	test('resolves the bundled language server module from the extension root', () => {
		const resolvedModule = resolveGuideNhServerModule({
			asAbsolutePath: (relativePath: string) => path.join('extension-root', relativePath)
		});
		assert.strictEqual(resolvedModule, path.join('extension-root', 'out', 'server.js'));
	});
});
