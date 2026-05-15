import { extractFrontmatter, FrontmatterBlock } from './frontmatter';

export interface GuideNhParsedTag {
	name: string;
	attributes: Record<string, string | true>;
	start: number;
	end: number;
	selfClosing: boolean;
}

export interface GuideNhParsedDocument {
	frontmatter?: FrontmatterBlock;
	tags: GuideNhParsedTag[];
}

function maskMdxComments(text: string): string {
	return text.replace(/\{\/\*[\s\S]*?\*\/\}/g, (value) => ' '.repeat(value.length));
}

function parseAttributes(source: string): Record<string, string | true> {
	const attributes: Record<string, string | true> = {};
	const pattern = /([A-Za-z_][\w.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|\{([^}]*)\}|([^\s"'=<>`]+)))?/g;
	let match: RegExpExecArray | null;
	while ((match = pattern.exec(source)) !== null) {
		const name = match[1];
		attributes[name] = match[2] ?? match[3] ?? match[4] ?? match[5] ?? true;
	}
	return attributes;
}

export function parseGuideNhDocument(text: string): GuideNhParsedDocument {
	const masked = maskMdxComments(text);
	const frontmatter = extractFrontmatter(masked);
	const tags: GuideNhParsedTag[] = [];
	const tagPattern = /<([A-Z][A-Za-z0-9]*)(\s[^<>]*?)?(\/?)>/g;
	let match: RegExpExecArray | null;
	while ((match = tagPattern.exec(masked)) !== null) {
		tags.push({
			name: match[1],
			attributes: parseAttributes(match[2] ?? ''),
			start: match.index,
			end: match.index + match[0].length,
			selfClosing: match[3] === '/'
		});
	}
	return { frontmatter, tags };
}
