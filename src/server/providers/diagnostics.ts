import { Diagnostic, DiagnosticSeverity, Position } from 'vscode-languageserver/node';
import { GuideNhSchemaBundle } from '../../common/schema';
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
