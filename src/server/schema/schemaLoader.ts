import { promises as fs } from 'fs';
import * as path from 'path';
import {
	GuideNhFrontmatterFile,
	GuideNhMarkdownExtensionsFile,
	GuideNhProtocolFile,
	GuideNhSchemaBundle,
	GuideNhSnippetsFile,
	GuideNhTagsFile
} from '../../common/schema';

const DefaultSchemaFileName = 'defaultSchema.json';

async function readJson<T>(schemaDir: string, fileName: string): Promise<T> {
	const text = await fs.readFile(path.join(schemaDir, fileName), 'utf8');
	return JSON.parse(text) as T;
}

function assertSchemaVersion(name: string, value: { schemaVersion?: number }): void {
	if (value.schemaVersion !== 1) {
		throw new Error(`${name} has unsupported schema version ${String(value.schemaVersion)}`);
	}
}

export async function loadGuideNhSchema(schemaDir: string): Promise<GuideNhSchemaBundle> {
	const bundledSchema = await tryReadBundledSchema(schemaDir);
	if (bundledSchema) {
		assertSchemaBundle(bundledSchema);
		return bundledSchema;
	}
	const tags = await readJson<GuideNhTagsFile>(schemaDir, 'tags.json');
	const frontmatter = await readJson<GuideNhFrontmatterFile>(schemaDir, 'frontmatter.json');
	const markdownExtensions = await readJson<GuideNhMarkdownExtensionsFile>(schemaDir, 'markdownExtensions.json');
	const snippets = await readJson<GuideNhSnippetsFile>(schemaDir, 'snippets.json');
	const protocol = await readJson<GuideNhProtocolFile>(schemaDir, 'protocol.json');
	const schema = { tags, frontmatter, markdownExtensions, snippets, protocol };
	assertSchemaBundle(schema);
	return schema;
}

export async function writeBundledGuideNhSchema(sourceSchemaDir: string, outputSchemaDir: string): Promise<void> {
	const schema = await loadGuideNhSchema(sourceSchemaDir);
	await fs.mkdir(outputSchemaDir, { recursive: true });
	await fs.writeFile(path.join(outputSchemaDir, DefaultSchemaFileName), `${JSON.stringify(schema, null, 2)}\n`, 'utf8');
}

async function tryReadBundledSchema(schemaDir: string): Promise<GuideNhSchemaBundle | undefined> {
	try {
		return await readJson<GuideNhSchemaBundle>(schemaDir, DefaultSchemaFileName);
	} catch (error) {
		if (isMissingFileError(error)) {
			return undefined;
		}
		throw error;
	}
}

function assertSchemaBundle(schema: GuideNhSchemaBundle): void {
	assertSchemaVersion('tags.json', schema.tags);
	assertSchemaVersion('frontmatter.json', schema.frontmatter);
	assertSchemaVersion('markdownExtensions.json', schema.markdownExtensions);
	assertSchemaVersion('snippets.json', schema.snippets);
	assertSchemaVersion('protocol.json', schema.protocol);
}

function isMissingFileError(error: unknown): boolean {
	return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
