import { build, BuildOptions } from 'esbuild';
import { promises as fs } from 'fs';
import * as path from 'path';
import { writeBundledGuideNhSchema } from '../server/schema/schemaLoader';

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
	await writeBundledGuideNhSchema(path.join('src', 'schema'), path.join('out', 'schema'));
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
