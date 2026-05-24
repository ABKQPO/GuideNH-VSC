export interface GuideNhAttributeSchema {
	type: 'string' | 'number' | 'boolean' | 'enum' | 'item' | 'ore' | 'resource' | 'page' | 'color';
	required?: boolean;
	requiredWhenMissing?: string[];
	values?: string[];
	description?: string;
	valueStyle?: 'string' | 'expression' | 'bare';
}

export interface GuideNhTagSchema {
	name: string;
	kind: 'inline' | 'block' | 'scene' | 'chart' | 'any';
	description: string;
	attributes: Record<string, GuideNhAttributeSchema>;
	children: string[];
	snippets: string[];
}

export interface GuideNhTagsFile {
	schemaVersion: number;
	tags: Record<string, GuideNhTagSchema>;
}

export interface GuideNhFrontmatterKey {
	type: 'string' | 'number' | 'boolean' | 'list' | 'string_or_list' | 'map' | 'date';
	description: string;
	children?: Record<string, GuideNhFrontmatterKey>;
}

export interface GuideNhFrontmatterFile {
	schemaVersion: number;
	keys: Record<string, GuideNhFrontmatterKey>;
}

export interface GuideNhMarkdownExtensionsFile {
	schemaVersion: number;
	inlineMarkers: Record<string, { open: string; close: string; description: string }>;
	fencedCodeBlocks: Record<string, { description: string }>;
}

export interface GuideNhSnippetsFile {
	schemaVersion: number;
	snippets: Record<string, { prefix: string; body: string[]; description: string }>;
}

export interface GuideNhProtocolFile {
	schemaVersion: number;
	protocolVersion: number;
	capabilities: string[];
	limits: {
		maxMessageBytes: number;
		maxPageSize: number;
		maxSubscriptions: number;
		maxConnections: number;
		maxDeltaEntries: number;
	};
}

export interface GuideNhSchemaBundle {
	tags: GuideNhTagsFile;
	frontmatter: GuideNhFrontmatterFile;
	markdownExtensions: GuideNhMarkdownExtensionsFile;
	snippets: GuideNhSnippetsFile;
	protocol: GuideNhProtocolFile;
}
