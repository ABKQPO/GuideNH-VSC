/**
 * The named arguments a template declares, read from its body.
 *
 * GuideNH keeps this information in its own index and offers it while editing in game; this is the editor
 * equivalent. A template is an ordinary page under `templates/`, so its parameters come from that page's
 * text rather than from the schema, which only describes the tag.
 */

/** Where a template's page lives, for a name written on a call. */
export function resolveTemplateRelativePath(templateName: string): string | undefined {
	const trimmed = templateName.trim();
	if (trimmed.length === 0) {
		return undefined;
	}
	return `templates/${trimmed.replace(/\.md$/i, '')}.md`;
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
