import * as path from 'path';
import {
	createConnection,
	InitializeParams,
	ProposedFeatures,
	TextDocumentSyncKind,
	TextDocuments,
	WorkspaceFolder
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { pathToFileURL } from 'url';
import { GuideNhInitializationOptions } from '../common/protocol';
import { GuideNhWorkspaceIndex } from './index/workspaceIndex';
import { indexGuideNhWorkspaceFolders } from './index/workspaceScanner';
import { localizeServer, setServerLocale } from './localization';
import { createGuideNhCompletions, GuideNhCompletionTriggerCharacters } from './providers/completion';
import { createGuideNhDiagnostics } from './providers/diagnostics';
import { createGuideNhDefinition } from './providers/definition';
import { createGuideNhHover } from './providers/hover';
import { createGuideNhReferences } from './providers/references';
import { RuntimeBridgeClient } from './runtime/runtimeBridgeClient';
import { createRuntimeBridgeNotificationHandlers, wireRuntimeBridgeLogs, wireRuntimeBridgeStatus } from './runtime/runtimeBridgeNotifications';
import { SemanticCache } from './runtime/semanticCache';
import { loadGuideNhSchema } from './schema/schemaLoader';

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);
const schemaPromise = loadGuideNhSchemaFromCandidates([
	path.join(__dirname, 'schema'),
	path.join(__dirname, '..', 'schema'),
	path.join(__dirname, '..', 'src', 'schema')
]);
const workspaceIndex = new GuideNhWorkspaceIndex();
const semanticCache = new SemanticCache();
const runtimeBridgeClient = new RuntimeBridgeClient(semanticCache, {
	onStatus: wireRuntimeBridgeStatus(connection),
	onLog: wireRuntimeBridgeLogs(connection.console)
});
const runtimeBridgeHandlers = createRuntimeBridgeNotificationHandlers(runtimeBridgeClient);
let workspaceFolders: WorkspaceFolder[] = [];
let configuredResourcePackPath: string | undefined;

connection.onInitialize((params: InitializeParams) => {
	workspaceFolders = params.workspaceFolders ?? [];
	const initializationOptions = readInitializationOptions(params.initializationOptions);
	setServerLocale(initializationOptions.locale);
	configuredResourcePackPath = readConfiguredResourcePackPath(initializationOptions);
	return {
		capabilities: {
			textDocumentSync: TextDocumentSyncKind.Incremental,
			completionProvider: { triggerCharacters: GuideNhCompletionTriggerCharacters },
			definitionProvider: true,
			referencesProvider: true,
			hoverProvider: true
		}
	};
});

connection.onInitialized(() => {
	const folders = resolveInitialWorkspaceFolders(workspaceFolders, configuredResourcePackPath);
	void indexGuideNhWorkspaceFolders(folders, workspaceIndex).catch((error: unknown) => {
		connection.console.warn(`GuideNH workspace scan failed: ${error instanceof Error ? error.message : String(error)}`);
	}).finally(() => {
		void refreshOpenDocumentDiagnostics();
	});
});

documents.onDidChangeContent(async (change) => {
	workspaceIndex.updatePage(change.document.uri, change.document.getText());
	await publishDiagnostics(change.document);
});

connection.onCompletion(async (params) => {
	const document = documents.get(params.textDocument.uri);
	if (!document) {
		return [];
	}
	const schema = await schemaPromise;
	const offset = document.offsetAt(params.position);
	return createGuideNhCompletions(document.getText(), offset, schema, undefined, semanticCache, workspaceIndex);
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
	return createGuideNhReferences(document.getText(), document.offsetAt(params.position), current, workspaceIndex);
});

for (const [method, handler] of Object.entries(runtimeBridgeHandlers)) {
	connection.onNotification(method, handler);
}

documents.listen(connection);
connection.listen();

async function refreshOpenDocumentDiagnostics(): Promise<void> {
	for (const document of documents.all()) {
		await publishDiagnostics(document);
	}
}

async function publishDiagnostics(document: TextDocument): Promise<void> {
	const schema = await schemaPromise;
	const diagnostics = createGuideNhDiagnostics(document.getText(), schema, workspaceIndex);
	connection.sendDiagnostics({ uri: document.uri, diagnostics });
}

function readInitializationOptions(value: unknown): GuideNhInitializationOptions {
	if (!value || typeof value !== 'object') {
		return {};
	}
	const options = value as GuideNhInitializationOptions;
	return {
		locale: typeof options.locale === 'string' ? options.locale : undefined,
		resourcePackPath: typeof options.resourcePackPath === 'string' ? options.resourcePackPath : undefined
	};
}

function readConfiguredResourcePackPath(options: GuideNhInitializationOptions): string | undefined {
	if (typeof options.resourcePackPath !== 'string') {
		return undefined;
	}
	const trimmed = options.resourcePackPath.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function resolveInitialWorkspaceFolders(folders: WorkspaceFolder[], resourcePackPath: string | undefined): WorkspaceFolder[] {
	if (!resourcePackPath || folders.some((folder) => sameFileUri(folder.uri, pathToFileURL(resourcePackPath).toString()))) {
		return folders;
	}
	return [
		...folders,
		{
			name: 'GuideNH Resource Pack',
			uri: pathToFileURL(resourcePackPath).toString()
		}
	];
}

function sameFileUri(left: string, right: string): boolean {
	return left.toLowerCase() === right.toLowerCase();
}

async function loadGuideNhSchemaFromCandidates(schemaDirs: string[]) {
	let lastError: unknown;
	for (const schemaDir of schemaDirs) {
		try {
			return await loadGuideNhSchema(schemaDir);
		} catch (error) {
			lastError = error;
		}
	}
	throw lastError instanceof Error ? lastError : new Error(localizeServer('runtime.schema.loadFailed'));
}
