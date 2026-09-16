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
	/**
	 * Set when the container's body also takes ordinary block content, such as an annotation tooltip or a
	 * details body. `children` then ranks completion rather than restricting it, so validation must accept
	 * any block tag here and completion offers these first.
	 */
	preferredChildren?: string[];
	/**
	 * Set when the tag accepts any attribute, so one that is not in `attributes` is legal rather than a
	 * mistake. A `<Template>` call is the case this exists for: every attribute except the first `name`
	 * becomes an argument. Declared attributes stay typed and are still checked.
	 */
	forwardsAttributes?: boolean;
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
