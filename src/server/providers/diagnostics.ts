import { Diagnostic, DiagnosticSeverity, Position } from 'vscode-languageserver/node';
import { GuideNhFrontmatterKey, GuideNhSchemaBundle } from '../../common/schema';
import { parseGuideNhDocument } from '../parser/documentParser';

function createDiagnostic(text: string, start: number, end: number, message: string): Diagnostic {
	return {
		range: {
			start: offsetToPosition(text, start),
			end: offsetToPosition(text, end)
		},
		severity: DiagnosticSeverity.Warning,
		source: 'GuideNH',
		message
	};
}

export function createGuideNhDiagnostics(text: string, schema: GuideNhSchemaBundle): Diagnostic[] {
	const parsed = parseGuideNhDocument(text);
	const diagnostics: Diagnostic[] = [];
	if (parsed.frontmatter) {
		diagnostics.push(...createFrontmatterDiagnostics(text, parsed.frontmatter.text, schema));
	}
	for (const tag of parsed.tags) {
		const tagSchema = schema.tags.tags[tag.name];
		if (!tagSchema) {
			diagnostics.push(createDiagnostic(text, tag.start, tag.end, `Unknown GuideNH tag ${tag.name}`));
			continue;
		}
		for (const attributeName of Object.keys(tag.attributes)) {
			if (!tagSchema.attributes[attributeName]) {
				diagnostics.push(createDiagnostic(text, tag.start, tag.end, `Unknown attribute ${attributeName} on ${tag.name}`));
			}
		}
		for (const [attributeName, attribute] of Object.entries(tagSchema.attributes)) {
			if (attribute.required && tag.attributes[attributeName] === undefined) {
				diagnostics.push(createDiagnostic(text, tag.start, tag.end, `Missing required attribute ${attributeName} on ${tag.name}`));
			}
		}
	}
	return diagnostics;
}

function createFrontmatterDiagnostics(text: string, frontmatter: string, schema: GuideNhSchemaBundle): Diagnostic[] {
	const diagnostics: Diagnostic[] = [];
	const parentByIndent = new Map<number, string>();
	const unknownParentIndents = new Set<number>();
	let lineStart = 0;
	for (const line of frontmatter.split(/\r?\n/)) {
		const match = line.match(/^(\s*)([A-Za-z_][\w.-]*)\s*:/);
		if (match) {
			const indent = match[1].length;
			for (const knownIndent of Array.from(parentByIndent.keys())) {
				if (knownIndent >= indent) {
					parentByIndent.delete(knownIndent);
				}
			}
			for (const unknownIndent of Array.from(unknownParentIndents.keys())) {
				if (unknownIndent >= indent) {
					unknownParentIndents.delete(unknownIndent);
				}
			}
			const key = match[2];
			const parentPath = Array.from(parentByIndent.entries())
				.filter(([parentIndent]) => parentIndent < indent)
				.sort(([left], [right]) => left - right)
				.map(([, parent]) => parent);
			if (hasUnknownParent(unknownParentIndents, indent)) {
				parentByIndent.set(indent, key);
				lineStart += line.length + 1;
				continue;
			}
			const allowedKeys = resolveFrontmatterAllowedKeys(schema.frontmatter.keys, parentPath);
			if (!allowedKeys[key]) {
				const qualifiedKey = [...parentPath, key].join('.');
				const start = lineStart + indent;
				diagnostics.push(createDiagnostic(text, start, start + key.length, `Unknown frontmatter key ${qualifiedKey}`));
				unknownParentIndents.add(indent);
			}
			parentByIndent.set(indent, key);
		}
		lineStart += line.length + 1;
	}
	return diagnostics;
}

function hasUnknownParent(unknownParentIndents: Set<number>, indent: number): boolean {
	return Array.from(unknownParentIndents).some((unknownIndent) => unknownIndent < indent);
}

function resolveFrontmatterAllowedKeys(
	keys: Record<string, GuideNhFrontmatterKey>,
	path: string[]
): Record<string, GuideNhFrontmatterKey> {
	let current = keys;
	for (const key of path) {
		current = current[key]?.children ?? {};
	}
	return current;
}

function offsetToPosition(text: string, offset: number): Position {
	let line = 0;
	let character = 0;
	for (let index = 0; index < offset && index < text.length; index++) {
		const char = text[index];
		if (char === '\n') {
			line++;
			character = 0;
		} else if (char !== '\r') {
			character++;
		}
	}
	return { line, character };
}
