/**
 * The named arguments a template declares, read from its body.
 *
 * GuideNH keeps this information in its own index and offers it while editing in game; this is the editor
 * equivalent. A template is an ordinary page under `templates/`, so its parameters come from that page's
 * text rather than from the schema, which only describes the tag.
 */

/**
 * GuideNH's MediaWiki-compatible template name normalization. The first character is folded to
 * upper case and underscores/whitespace are treated as a single space. The path below
 * `templates/` (including nested folders) is otherwise kept intact.
 */
export function normalizeTemplateName(templateName: string): string {
	const normalized = templateName.replace(/_/g, ' ').trim().replace(/\s+/g, ' ');
	return normalized.length === 0 ? '' : normalized[0].toUpperCase() + normalized.slice(1);
}

/** Extracts the logical template name from an indexed page path. */
export function templateNameFromRelativePath(relativePath: string): string | undefined {
	const normalized = relativePath.replace(/\\/g, '/');
	const marker = normalized.lastIndexOf('templates/');
	if (marker < 0 || !normalized.toLowerCase().endsWith('.md')) {
		return undefined;
	}
	const name = normalized.slice(marker + 'templates/'.length, -'.md'.length);
	return name.length > 0 ? name : undefined;
}

/**
 * Every parameter name a template body declares.
 *
 * Both `<Param name="x" />` and the attribute-value form `id={<Param name="x" />}` match, because the
 * pattern only looks for the tag and its name attribute. A positional `<Param pos="1" />` has no name and
 * therefore contributes nothing here, since there is no attribute name to complete.
 */
export function extractTemplateParameterNames(text: string): string[] {
	const names: string[] = [];
	for (const match of text.matchAll(/<Param\b[^>]*?\bname\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
		const name = (match[1] ?? match[2] ?? '').trim();
		if (name.length > 0 && !names.includes(name)) {
			names.push(name);
		}
	}
	return names;
}
