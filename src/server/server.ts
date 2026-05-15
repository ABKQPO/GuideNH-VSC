import * as path from 'path';
import {
	createConnection,
	InitializeParams,
	ProposedFeatures,
	TextDocumentSyncKind,
	TextDocuments
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { createGuideNhCompletions } from './providers/completion';
import { createGuideNhDiagnostics } from './providers/diagnostics';
import { createGuideNhHover } from './providers/hover';
import { loadGuideNhSchema } from './schema/schemaLoader';

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);
const schemaPromise = loadGuideNhSchema(path.join(__dirname, '..', 'schema'));

connection.onInitialize((_params: InitializeParams) => ({
	capabilities: {
		textDocumentSync: TextDocumentSyncKind.Incremental,
		completionProvider: { triggerCharacters: ['<', ' ', '"', '\''] },
		hoverProvider: true
	}
}));

documents.onDidChangeContent(async (change) => {
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

documents.listen(connection);
connection.listen();
