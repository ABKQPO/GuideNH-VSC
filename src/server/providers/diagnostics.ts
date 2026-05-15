import { Diagnostic, DiagnosticSeverity, Position } from 'vscode-languageserver/node';
import { GuideNhFrontmatterKey, GuideNhSchemaBundle } from '../../common/schema';
import { GuideNhParsedTag, parseGuideNhDocument } from '../parser/documentParser';

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
	const parentStack: GuideNhParsedTag[] = [];
	for (const tag of parsed.tags) {
		if (tag.closing) {
			popParentTag(parentStack, tag.name);
			continue;
		}
		const tagSchema = schema.tags.tags[tag.name];
		if (!tagSchema) {
			diagnostics.push(createDiagnostic(text, tag.start, tag.end, `Unknown GuideNH tag ${tag.name}`));
			continue;
		}
		const parentTag = parentStack[parentStack.length - 1];
		const parentSchema = parentTag ? schema.tags.tags[parentTag.name] : undefined;
		if (parentTag && parentSchema && parentSchema.children.length > 0 && !parentSchema.children.includes(tag.name)) {
			diagnostics.push(createDiagnostic(text, tag.start, tag.end, `Tag ${tag.name} is not allowed inside ${parentTag.name}`));
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
		if (!tag.selfClosing) {
			parentStack.push(tag);
		}
	}
	return diagnostics;
}

function popParentTag(parentStack: GuideNhParsedTag[], tagName: string): void {
	for (let index = parentStack.length - 1; index >= 0; index--) {
		if (parentStack[index].name === tagName) {
			parentStack.splice(index);
			return;
		}
	}
}

function createFrontmatterDiagnostics(text: string, frontmatter: string, schema: GuideNhSchemaBundle): Diagnostic[] {
	const diagnostics: Diagnostic[] = [];
	const parentByIndent = new Map<number, string>();
	const unknownParentIndents = new Set<number>();
	let lineStart = 0;
	for (const line of frontmatter.split(/\r?\n/)) {
		const match = line.match(/^(\s*)([A-Za-z_][\w.-]*)\s*:(.*)$/);
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
			const keySchema = allowedKeys[key];
			if (!keySchema) {
				const qualifiedKey = [...parentPath, key].join('.');
				const start = lineStart + indent;
				diagnostics.push(createDiagnostic(text, start, start + key.length, `Unknown frontmatter key ${qualifiedKey}`));
				unknownParentIndents.add(indent);
			} else {
				const qualifiedKey = [...parentPath, key].join('.');
				const value = match[3].trim();
				const valueStart = lineStart + line.indexOf(match[3]) + match[3].search(/\S/);
				const typeError = validateFrontmatterValueType(keySchema, value);
				if (typeError && value.length > 0) {
					diagnostics.push(createDiagnostic(text, valueStart, valueStart + value.length, `Frontmatter key ${qualifiedKey} expects ${typeError} value`));
				}
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

function validateFrontmatterValueType(key: GuideNhFrontmatterKey, value: string): string | undefined {
	if (value.length === 0 || key.type === 'map' || key.type === 'string' || key.type === 'date') {
		return undefined;
	}
	if (key.type === 'number') {
		return /^-?\d+(?:\.\d+)?$/.test(value) ? undefined : 'number';
	}
	if (key.type === 'boolean') {
		return /^(?:true|false)$/i.test(value) ? undefined : 'boolean';
	}
	if (key.type === 'list') {
		return value.startsWith('[') && value.endsWith(']') ? undefined : 'list';
	}
	return undefined;
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
