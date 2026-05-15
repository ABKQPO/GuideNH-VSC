import { spawnSync } from 'child_process';
import * as path from 'path';

function run(command: string, args: string[], cwd: string): void {
	const result = spawnSync(command, args, { cwd, stdio: 'inherit', shell: true });
	if (result.status !== 0) {
		throw new Error(`${command} ${args.join(' ')} failed with ${String(result.status)}`);
	}
}

function main(): void {
	const guideNhRoot = process.env.GUIDENH_ROOT || 'E:\\Github\\GuideNH';
	const extensionRoot = path.resolve(__dirname, '..', '..');
	run('npm', ['run', 'generate:schema'], extensionRoot);
	run('npm', ['run', 'lint'], extensionRoot);
	run('npm', ['run', 'compile'], extensionRoot);
	run('npm', ['test'], extensionRoot);
	run('.\\gradlew.bat', ['spotlessApply'], guideNhRoot);
	run('.\\gradlew.bat', ['compileJava'], guideNhRoot);
}

main();
