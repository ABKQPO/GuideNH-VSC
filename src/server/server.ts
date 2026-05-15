import * as path from 'path';
import {
	createConnection,
	InitializeParams,
	ProposedFeatures,
	TextDocumentSyncKind,
	TextDocuments
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { GuideNhWorkspaceIndex } from './index/workspaceIndex';
import { createGuideNhCompletions } from './providers/completion';
import { createGuideNhDiagnostics } from './providers/diagnostics';
import { createGuideNhDefinition } from './providers/definition';
import { createGuideNhHover } from './providers/hover';
import { createGuideNhReferences } from './providers/references';
import { loadGuideNhSchema } from './schema/schemaLoader';

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);
const schemaPromise = loadGuideNhSchema(path.join(__dirname, '..', 'schema'));
const workspaceIndex = new GuideNhWorkspaceIndex();

connection.onInitialize((_params: InitializeParams) => ({
	capabilities: {
		textDocumentSync: TextDocumentSyncKind.Incremental,
		completionProvider: { triggerCharacters: ['<', ' ', '"', '\''] },
		definitionProvider: true,
		referencesProvider: true,
		hoverProvider: true
	}
}));

documents.onDidChangeContent(async (change) => {
	workspaceIndex.updatePage(change.document.uri, change.document.getText());
	const schema = await schemaPromise;
	const diagnostics = createGuideNhDiagnostics(change.document.getText(), schema);
	connection.sendDiagnostics({ uri: change.document.uri, diagnostics });
});

connection.onCompletion(async (params) => {
	const document = documents.get(params.textDocument.uri);
	if (!document) {
		return [];
	}
	const schema = await schemaPromise;
	const offset = document.offsetAt(params.position);
	return createGuideNhCompletions(document.getText(), offset, schema, undefined);
});

connection.onHover(async (params) => {
	const document = documents.get(params.textDocument.uri);
	if (!document) {
		return undefined;
	}
	const schema = await schemaPromise;
	const offset = document.offsetAt(params.position);
	return createGuideNhHover(document.getText(), offset, schema);
});

connection.onDefinition((params) => {
	const document = documents.get(params.textDocument.uri);
	if (!document) {
		return undefined;
	}
	const line = document.getText({
		start: { line: params.position.line, character: 0 },
		end: { line: params.position.line + 1, character: 0 }
	});
	const match = line.match(/\[[^\]]+\]\(([^)]+\.md(?:#[^)]+)?)\)/);
	return match ? createGuideNhDefinition(match[1].split('#')[0], workspaceIndex) : undefined;
});

connection.onReferences((params) => {
	const document = documents.get(params.textDocument.uri);
	if (!document) {
		return [];
	}
	const current = document.uri.slice(document.uri.lastIndexOf('/') + 1);
	return createGuideNhReferences(current, workspaceIndex);
});

documents.listen(connection);
connection.listen();
