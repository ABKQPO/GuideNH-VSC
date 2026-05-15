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
	const tags = await readJson<GuideNhTagsFile>(schemaDir, 'tags.json');
	const frontmatter = await readJson<GuideNhFrontmatterFile>(schemaDir, 'frontmatter.json');
	const markdownExtensions = await readJson<GuideNhMarkdownExtensionsFile>(schemaDir, 'markdownExtensions.json');
	const snippets = await readJson<GuideNhSnippetsFile>(schemaDir, 'snippets.json');
	const protocol = await readJson<GuideNhProtocolFile>(schemaDir, 'protocol.json');
	assertSchemaVersion('tags.json', tags);
	assertSchemaVersion('frontmatter.json', frontmatter);
	assertSchemaVersion('markdownExtensions.json', markdownExtensions);
	assertSchemaVersion('snippets.json', snippets);
	assertSchemaVersion('protocol.json', protocol);
	return { tags, frontmatter, markdownExtensions, snippets, protocol };
}
