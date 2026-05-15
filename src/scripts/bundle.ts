import { build, BuildOptions } from 'esbuild';
import { promises as fs } from 'fs';

const baseOptions: BuildOptions = {
	bundle: true,
	external: ['vscode'],
	format: 'cjs',
	logLevel: 'info',
	minify: true,
	platform: 'node',
	sourcemap: false,
	target: 'node20'
};

async function bundle(): Promise<void> {
	await Promise.all([
		bundleEntry('out/extension.js', 'out/extension.js'),
		bundleEntry('out/server/server.js', 'out/server.js')
	]);
}

async function bundleEntry(entryPoint: string, outfile: string): Promise<void> {
	const temporaryOutfile = `${outfile}.bundle`;
	await build({
		...baseOptions,
		entryPoints: [entryPoint],
		outfile: temporaryOutfile
	});
	await fs.rename(temporaryOutfile, outfile);
}

bundle().catch((error: unknown) => {
	console.error(error);
	process.exitCode = 1;
});
