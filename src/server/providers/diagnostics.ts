import { Diagnostic, DiagnosticSeverity, Position } from 'vscode-languageserver/node';
import { GuideNhAttributeSchema, GuideNhFrontmatterKey, GuideNhSchemaBundle } from '../../common/schema';
import { GuideNhResourceIndex } from '../index/resourceIndex';
import { GuideNhWorkspaceIndex } from '../index/workspaceIndex';
import { localizeServer } from '../localization';
import { createGuideNhDocumentModel } from '../parser/documentModel';
import { GuideNhParsedTag, parseGuideNhDocument } from '../parser/documentParser';
import { findAttributeSchema, findTagSchema, hasAttributeValue, isChildTagAllowed, matchesTagName } from '../schema/schemaLookup';

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

export function createGuideNhDiagnostics(
	text: string,
	schema: GuideNhSchemaBundle,
	index?: GuideNhWorkspaceIndex,
	resourceIndex?: GuideNhResourceIndex,
	documentUri?: string,
	preferredLocale?: string
): Diagnostic[] {
	const model = createGuideNhDocumentModel(text, documentUri);
	const parsed = model.parsed;
	const diagnostics: Diagnostic[] = [];
	if (parsed.frontmatter) {
		diagnostics.push(...createFrontmatterDiagnostics(text, parsed.frontmatter.text, schema));
	}
	if (index) {
		diagnostics.push(...createPageReferenceDiagnostics(model, text, index, preferredLocale));
	}
	if (resourceIndex) {
		diagnostics.push(...createResourceReferenceDiagnostics(model, text, resourceIndex));
	}
	const parentStack: GuideNhParsedTag[] = [];
	for (const tag of parsed.tags) {
		if (tag.closing) {
			const parentTag = parentStack[parentStack.length - 1];
			if (parentTag && !matchesTagName(parentTag.name, tag.name)) {
				diagnostics.push(createDiagnostic(text, tag.start, tag.end, localizeServer('diagnostic.closingTagMismatch', tag.name, parentTag.name)));
			}
			popParentTag(parentStack, tag.name);
			continue;
		}
		const tagSchema = findTagSchema(schema, tag.name);
		if (!tagSchema) {
			diagnostics.push(createDiagnostic(text, tag.start, tag.end, localizeServer('diagnostic.unknownTag', tag.name)));
			continue;
		}
		const parentTag = parentStack[parentStack.length - 1];
		if (parentTag && !isChildTagAllowed(schema, parentTag.name, tag.name)) {
			diagnostics.push(createDiagnostic(text, tag.start, tag.end, localizeServer('diagnostic.tagNotAllowed', tag.name, parentTag.name)));
		}
		for (const attributeName of Object.keys(tag.attributes)) {
			const attributeSchema = findAttributeSchema(schema, tag.name, attributeName);
			if (!attributeSchema) {
				diagnostics.push(createDiagnostic(text, tag.start, tag.end, localizeServer('diagnostic.unknownAttribute', attributeName, tag.name)));
				continue;
			}
			const typeError = validateAttributeValueType(attributeSchema, tag.attributes[attributeName], tag.attributeValueStyles[attributeName]);
			if (typeError) {
				const range = tag.attributeRanges[attributeName] ?? { start: tag.start, end: tag.end };
				diagnostics.push(createDiagnostic(text, range.start, range.end, localizeServer('diagnostic.attributeExpects', attributeName, tag.name, typeError)));
			}
		}
		for (const [attributeName, attribute] of Object.entries(tagSchema.attributes)) {
			if (isAttributeMissing(tag.attributes, attributeName, attribute)) {
				diagnostics.push(createDiagnostic(text, tag.start, tag.end, localizeServer('diagnostic.missingAttribute', attributeName, tag.name)));
			}
		}
		diagnostics.push(...createTagSpecificDiagnostics(text, tag));
		if (!tag.selfClosing) {
			parentStack.push(tag);
		}
	}
	for (const tag of parentStack) {
		diagnostics.push(createDiagnostic(text, tag.start, tag.end, localizeServer('diagnostic.unclosedTag', tag.name)));
	}
	return diagnostics;
}

function createTagSpecificDiagnostics(text: string, tag: GuideNhParsedTag): Diagnostic[] {
	if (!matchesTagName(tag.name, 'FloatingImage')) {
		return [];
	}
	const diagnostics: Diagnostic[] = [];
	if (hasAttributeValue(tag.attributes, 'width') && hasAttributeValue(tag.attributes, 'w')) {
		diagnostics.push(createDiagnostic(text, tag.start, tag.end, 'FloatingImage cannot use both width and w'));
	}
	if (hasAttributeValue(tag.attributes, 'height') && hasAttributeValue(tag.attributes, 'h')) {
		diagnostics.push(createDiagnostic(text, tag.start, tag.end, 'FloatingImage cannot use both height and h'));
	}
	return diagnostics;
}

function createPageReferenceDiagnostics(
	model: ReturnType<typeof createGuideNhDocumentModel>,
	text: string,
	index: GuideNhWorkspaceIndex,
	preferredLocale?: string
): Diagnostic[] {
	return model.references
		.filter((reference) => reference.kind === 'page' && reference.normalizedTarget && !index.findPageByRelativePathForLocale(reference.normalizedTarget, preferredLocale))
		.map((reference) => createDiagnostic(text, reference.start, reference.end, localizeServer('diagnostic.unknownPage', String(reference.normalizedTarget))));
}

function createResourceReferenceDiagnostics(
	model: ReturnType<typeof createGuideNhDocumentModel>,
	text: string,
	resourceIndex: GuideNhResourceIndex
): Diagnostic[] {
	return model.references
		.filter((reference) => reference.kind === 'resource' && reference.normalizedTarget && !resourceIndex.findResourceByRelativePath(reference.normalizedTarget))
		.map((reference) => createDiagnostic(text, reference.start, reference.end, localizeServer('diagnostic.unknownResource', String(reference.normalizedTarget))));
}

function isAttributeMissing(
	attributes: Record<string, string | true>,
	attributeName: string,
	attribute: GuideNhAttributeSchema
): boolean {
	if (hasAttributeValue(attributes, attributeName)) {
		return false;
	}
	if (attribute.requiredWhenMissing && attribute.requiredWhenMissing.some((name) => hasAttributeValue(attributes, name))) {
		return false;
	}
	return attribute.required === true;
}

function popParentTag(parentStack: GuideNhParsedTag[], tagName: string): void {
	for (let index = parentStack.length - 1; index >= 0; index--) {
		if (matchesTagName(parentStack[index].name, tagName)) {
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
		const listItemMatch = line.match(/^\s*-\s+(.+?)\s*$/);
		if (listItemMatch) {
			lineStart += line.length + 1;
			continue;
		}
		const indentedScalarMatch = line.match(/^(\s+)(\S.*)$/);
		if (indentedScalarMatch && shouldTreatAsFrontmatterListValue(schema, parentByIndent, indentedScalarMatch[1].length)) {
			lineStart += line.length + 1;
			continue;
		}
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
				diagnostics.push(createDiagnostic(text, start, start + key.length, localizeServer('diagnostic.unknownFrontmatterKey', qualifiedKey)));
				unknownParentIndents.add(indent);
			} else {
				const qualifiedKey = [...parentPath, key].join('.');
				const value = match[3].trim();
				const valueStart = lineStart + line.indexOf(match[3]) + match[3].search(/\S/);
				const typeError = validateFrontmatterValueType(keySchema, value);
				if (typeError && value.length > 0) {
					diagnostics.push(createDiagnostic(text, valueStart, valueStart + value.length, localizeServer('diagnostic.frontmatterExpects', qualifiedKey, typeError)));
				}
			}
			parentByIndent.set(indent, key);
		}
		lineStart += line.length + 1;
	}
	return diagnostics;
}

function shouldTreatAsFrontmatterListValue(
	schema: GuideNhSchemaBundle,
	parentByIndent: Map<number, string>,
	indent: number
): boolean {
	const parentEntry = Array.from(parentByIndent.entries())
		.filter(([parentIndent]) => parentIndent < indent)
		.sort(([left], [right]) => right - left)[0];
	if (!parentEntry) {
		return false;
	}
	const parentPath = Array.from(parentByIndent.entries())
		.filter(([parentIndent]) => parentIndent <= parentEntry[0])
		.sort(([left], [right]) => left - right)
		.map(([, parent]) => parent);
	const parentKey = resolveFrontmatterAllowedKeys(schema.frontmatter.keys, parentPath.slice(0, -1))[parentPath[parentPath.length - 1]];
	return parentKey?.type === 'list' || parentKey?.type === 'string_or_list';
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
	if (value.length === 0 || key.type === 'map' || key.type === 'string' || key.type === 'string_or_list' || key.type === 'date') {
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

function validateAttributeValueType(attribute: GuideNhAttributeSchema, value: string | true, valueStyle?: string): string | undefined {
	if (value === true) {
		return attribute.type === 'boolean' ? undefined : attribute.type;
	}
	if (attribute.type === 'boolean') {
		return /^(?:true|false)$/i.test(value) ? undefined : 'boolean';
	}
	if (acceptsBooleanLikeString(attribute, value)) {
		return undefined;
	}
	if (attribute.valueStyle === 'string' && valueStyle === 'expression') {
		return attribute.type;
	}
	if (attribute.type === 'number') {
		return /^-?\d+(?:\.\d+)?$/.test(value) ? undefined : 'number';
	}
	if (attribute.type === 'color') {
		return /^(?:#[0-9a-fA-F]{6}|#[0-9a-fA-F]{8}|0x[0-9a-fA-F]{6}|0x[0-9a-fA-F]{8}|[A-Za-z_][\w.-]*)$/.test(value)
			? undefined
			: 'color';
	}
	if (attribute.type === 'enum') {
		return !attribute.values || attribute.values.includes(value) ? undefined : 'enum';
	}
	if (attribute.type === 'item' || attribute.type === 'ore' || attribute.type === 'resource' || attribute.type === 'page') {
		return value.trim().length > 0 ? undefined : attribute.type;
	}
	return undefined;
}

function acceptsBooleanLikeString(attribute: GuideNhAttributeSchema, value: string): boolean {
	if (attribute.type !== 'string') {
		return false;
	}
	return /^(?:true|false)$/i.test(value);
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
