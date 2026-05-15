import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node';
import { GuideNhSchemaBundle } from '../../common/schema';
import { parseGuideNhDocument } from '../parser/documentParser';

function createDiagnostic(start: number, end: number, message: string): Diagnostic {
	return {
		range: {
			start: { line: 0, character: start },
			end: { line: 0, character: end }
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
			diagnostics.push(createDiagnostic(tag.start, tag.end, `Unknown GuideNH tag ${tag.name}`));
			continue;
		}
		for (const attributeName of Object.keys(tag.attributes)) {
			if (!tagSchema.attributes[attributeName]) {
				diagnostics.push(createDiagnostic(tag.start, tag.end, `Unknown attribute ${attributeName} on ${tag.name}`));
			}
		}
		for (const [attributeName, attribute] of Object.entries(tagSchema.attributes)) {
			if (attribute.required && tag.attributes[attributeName] === undefined) {
				diagnostics.push(createDiagnostic(tag.start, tag.end, `Missing required attribute ${attributeName} on ${tag.name}`));
			}
		}
	}
	return diagnostics;
}
