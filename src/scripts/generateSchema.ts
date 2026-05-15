import { promises as fs } from 'fs';
import * as path from 'path';

export function extractTagNamesFromJavaSource(source: string): string[] {
	const explicit = Array.from(source.matchAll(/["']([A-Z][A-Za-z0-9]*)["']\s*,\s*new\s+[A-Za-z0-9_]+Compiler/g)).map((match) => match[1]);
	return Array.from(new Set(explicit)).sort();
}

async function collectJavaFiles(root: string): Promise<string[]> {
	const result: string[] = [];
	async function visit(dir: string): Promise<void> {
		const entries = await fs.readdir(dir, { withFileTypes: true });
		for (const entry of entries) {
			const fullPath = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				await visit(fullPath);
			} else if (entry.name.endsWith('.java')) {
				result.push(fullPath);
			}
		}
	}
	await visit(path.join(root, 'src', 'main', 'java'));
	return result;
}

export async function generateSchema(guideNhRoot: string): Promise<void> {
	const javaFiles = await collectJavaFiles(guideNhRoot);
	const tagNames = new Set<string>();
	for (const file of javaFiles) {
		const text = await fs.readFile(file, 'utf8');
		for (const tag of extractTagNamesFromJavaSource(text)) {
			tagNames.add(tag);
		}
	}
	console.log(`GuideNH schema scan found ${tagNames.size} explicit tag names`);
}

if (require.main === module) {
	const root = process.env.GUIDENH_ROOT || 'E:\\Github\\GuideNH';
	generateSchema(root).catch((error: unknown) => {
		console.error(error);
		process.exitCode = 1;
	});
}
