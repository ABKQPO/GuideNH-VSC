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
import { createGuideNhCompletions, GuideNhCompletionTriggerCharacters } from './providers/completion';
import { createGuideNhDiagnostics } from './providers/diagnostics';
import { createGuideNhDefinition } from './providers/definition';
import { createGuideNhHover } from './providers/hover';
import { createGuideNhReferences } from './providers/references';
import { RuntimeBridgeClient } from './runtime/runtimeBridgeClient';
import { createRuntimeBridgeNotificationHandlers, wireRuntimeBridgeStatus } from './runtime/runtimeBridgeNotifications';
import { SemanticCache } from './runtime/semanticCache';
import { loadGuideNhSchema } from './schema/schemaLoader';

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);
const schemaPromise = loadGuideNhSchema(path.join(__dirname, '..', 'schema'));
const workspaceIndex = new GuideNhWorkspaceIndex();
const semanticCache = new SemanticCache();
const runtimeBridgeClient = new RuntimeBridgeClient(semanticCache, {
	onStatus: wireRuntimeBridgeStatus(connection)
});
const runtimeBridgeHandlers = createRuntimeBridgeNotificationHandlers(runtimeBridgeClient);

connection.onInitialize((_params: InitializeParams) => ({
	capabilities: {
		textDocumentSync: TextDocumentSyncKind.Incremental,
		completionProvider: { triggerCharacters: GuideNhCompletionTriggerCharacters },
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
	return createGuideNhCompletions(document.getText(), offset, schema, undefined, semanticCache);
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
	return createGuideNhDefinition(document.getText(), document.offsetAt(params.position), workspaceIndex);
});

connection.onReferences((params) => {
	const document = documents.get(params.textDocument.uri);
	if (!document) {
		return [];
	}
	const current = document.uri.slice(document.uri.lastIndexOf('/') + 1);
	return createGuideNhReferences(current, workspaceIndex);
});

for (const [method, handler] of Object.entries(runtimeBridgeHandlers)) {
	connection.onNotification(method, handler);
}

documents.listen(connection);
connection.listen();
