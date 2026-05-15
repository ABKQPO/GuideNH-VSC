import { promises as fs } from 'fs';
import * as path from 'path';
import { GuideNhAttributeSchema, GuideNhTagSchema, GuideNhTagsFile } from '../common/schema';

export function extractTagNamesFromJavaSource(source: string): string[] {
	return scanJavaCompilerSource(source).tagNames;
}

export interface JavaCompilerScanResult {
	tagNames: string[];
	tags: Record<string, GuideNhTagSchema>;
}

export function scanJavaCompilerSource(source: string): JavaCompilerScanResult {
	const tagNames = extractCompilerTagNames(source);
	const attributes = extractCompilerAttributes(source);
	const tags: Record<string, GuideNhTagSchema> = {};
	for (const tagName of tagNames) {
		tags[tagName] = {
			name: tagName,
			kind: inferTagKind(source),
			description: `Generated from GuideNH ${tagName} compiler source.`,
			attributes,
			children: [],
			snippets: []
		};
	}
	return { tagNames, tags };
}

function extractCompilerTagNames(source: string): string[] {
	const names = new Set<string>();
	const stringConstants = extractStringConstants(source);
	for (const match of source.matchAll(/["']([A-Z][A-Za-z0-9]*)["']\s*,\s*new\s+[A-Za-z0-9_]+Compiler/g)) {
		names.add(match[1]);
	}
	for (const body of extractGetTagNamesBodies(source)) {
		for (const name of extractQuotedStrings(body)) {
			names.add(name);
		}
		for (const name of extractResolvedTagNameConstants(body, stringConstants)) {
			names.add(name);
		}
	}
	return Array.from(names).sort();
}

function extractStringConstants(source: string): Map<string, string> {
	const constants = new Map<string, string>();
	for (const match of source.matchAll(/\b(?:(?:public|private|protected|static|final)\s+)*String\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"([^"]+)"/g)) {
		constants.set(match[1], match[2]);
	}
	return constants;
}

function extractResolvedTagNameConstants(body: string, constants: Map<string, string>): string[] {
	const names = new Set<string>();
	for (const match of body.matchAll(/Collections\.singleton\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)/g)) {
		addResolvedConstant(names, constants, match[1]);
	}
	for (const match of body.matchAll(/Arrays\.asList\s*\(([^)]*)\)/gs)) {
		for (const argument of match[1].split(',')) {
			addResolvedConstant(names, constants, argument.trim());
		}
	}
	return Array.from(names);
}

function addResolvedConstant(names: Set<string>, constants: Map<string, string>, identifier: string): void {
	const value = constants.get(identifier);
	if (value) {
		names.add(value);
	}
}

function extractGetTagNamesBodies(source: string): string[] {
	const bodies: string[] = [];
	const matcher = /getTagNames\s*\(\s*\)\s*\{/g;
	for (const match of source.matchAll(matcher)) {
		const openBrace = match.index === undefined ? -1 : source.indexOf('{', match.index);
		if (openBrace >= 0) {
			const closeBrace = findMatchingBrace(source, openBrace);
			if (closeBrace > openBrace) {
				bodies.push(source.slice(openBrace + 1, closeBrace));
			}
		}
	}
	return bodies;
}

function findMatchingBrace(source: string, openBrace: number): number {
	let depth = 0;
	for (let index = openBrace; index < source.length; index++) {
		const char = source[index];
		if (char === '{') {
			depth++;
		} else if (char === '}') {
			depth--;
			if (depth === 0) {
				return index;
			}
		}
	}
	return -1;
}

function extractCompilerAttributes(source: string): Record<string, GuideNhAttributeSchema> {
	const attributes: Record<string, GuideNhAttributeSchema> = {};
	for (const match of source.matchAll(/MdxAttrs\.([A-Za-z0-9_]+)\([^;]*?"([^"]+)"[^;]*?\)/gs)) {
		const type = mapMdxAttrReaderType(match[1]);
		if (type) {
			attributes[match[2]] = { type };
		}
	}
	for (const match of source.matchAll(/getAttributeString\(\s*"([^"]+)"/g)) {
		if (!attributes[match[1]]) {
			attributes[match[1]] = { type: 'string' };
		}
	}
	return sortAttributes(attributes);
}

function mapMdxAttrReaderType(reader: string): GuideNhAttributeSchema['type'] | undefined {
	if (reader.includes('Item')) {
		return 'item';
	}
	if (reader.includes('Ore')) {
		return 'ore';
	}
	if (reader.includes('Color')) {
		return 'color';
	}
	if (reader.includes('Boolean')) {
		return 'boolean';
	}
	if (reader.includes('Int') || reader.includes('Float') || reader.includes('Double')) {
		return 'number';
	}
	if (reader.includes('Enum')) {
		return 'enum';
	}
	if (reader.includes('String')) {
		return 'string';
	}
	return undefined;
}

function inferTagKind(source: string): GuideNhTagSchema['kind'] {
	if (source.includes('extends FlowTagCompiler')) {
		return 'inline';
	}
	if (source.includes('chart')) {
		return 'chart';
	}
	if (source.includes('extends BlockTagCompiler')) {
		return 'block';
	}
	return 'any';
}

function extractQuotedStrings(value: string): string[] {
	return Array.from(value.matchAll(/"([^"]+)"/g)).map((match) => match[1]);
}

function sortAttributes(attributes: Record<string, GuideNhAttributeSchema>): Record<string, GuideNhAttributeSchema> {
	return Object.fromEntries(Object.entries(attributes).sort(([left], [right]) => left.localeCompare(right)));
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
	const generatedTags: Record<string, GuideNhTagSchema> = {};
	for (const file of javaFiles) {
		const text = await fs.readFile(file, 'utf8');
		const scan = scanJavaCompilerSource(text);
		for (const tag of scan.tagNames) {
			tagNames.add(tag);
		}
		Object.assign(generatedTags, scan.tags);
	}
	await mergeGeneratedTags(generatedTags);
	console.log(`GuideNH schema scan found ${tagNames.size} explicit tag names`);
}

async function mergeGeneratedTags(generatedTags: Record<string, GuideNhTagSchema>): Promise<void> {
	const schemaPath = path.join(__dirname, '..', '..', 'src', 'schema', 'tags.json');
	const existing = JSON.parse(await fs.readFile(schemaPath, 'utf8')) as GuideNhTagsFile;
	const handwrittenTags = Object.fromEntries(
		Object.entries(existing.tags).filter(([, tag]) => !tag.description.startsWith('Generated from GuideNH '))
	);
	const merged: GuideNhTagsFile = {
		...existing,
		tags: {
			...generatedTags,
			...handwrittenTags
		}
	};
	await fs.writeFile(schemaPath, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
}

if (require.main === module) {
	const root = process.env.GUIDENH_ROOT || 'E:\\Github\\GuideNH';
	generateSchema(root).catch((error: unknown) => {
		console.error(error);
		process.exitCode = 1;
	});
}
