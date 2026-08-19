import * as path from 'path';
import {
	CodeActionKind,
	CompletionItemKind,
	createConnection,
	DidChangeWatchedFilesParams,
	DocumentLink,
	InitializeParams,
	MarkupKind,
	ProposedFeatures,
	TextDocumentSyncKind,
	TextDocuments,
	WorkspaceFolder
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { pathToFileURL } from 'url';
import { GuideNhInitializationOptions } from '../common/protocol';
import {
	PreviewResolvePayload,
	PreviewSearchPayload,
	RuntimePreviewResolveRequest,
	RuntimePreviewSearchRequest
} from '../common/protocol';
import { GuideNhResourceIndex } from './index/resourceIndex';
import { GuideNhWorkspaceIndex } from './index/workspaceIndex';
import {
	applyGuideNhWorkspaceFileChanges,
	forEachGuideNhMarkdownDocument,
	indexGuideNhWorkspaceFolders
} from './index/workspaceScanner';
import { localizeServer, setServerLocale } from './localization';
import {
	applyCompletionReplacementRange,
	createRuntimeSemanticCompletionItems,
	createGuideNhCompletionResult,
	GuideNhCompletionTriggerCharacters,
	resolveGuideNhCompletionOffset
} from './providers/completion';
import { createGuideNhCodeActions } from './providers/codeActions';
import { createGuideNhDiagnostics } from './providers/diagnostics';
import { createGuideNhDefinition } from './providers/definition';
import { createGuideNhDocumentLinks } from './providers/documentLinks';
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
	path.join(__dirname, '..', 'src', 'schema'),
	path.join(__dirname, '..', '..', 'src', 'schema')
]).catch((error) => {
	connection.console.error(`GuideNH schema load failed: ${error instanceof Error ? error.message : String(error)}`);
	throw error;
});
const workspaceIndex = new GuideNhWorkspaceIndex();
const resourceIndex = new GuideNhResourceIndex();
const semanticCache = new SemanticCache();
const runtimeBridgeClient = new RuntimeBridgeClient(semanticCache, {
	onStatus: wireRuntimeBridgeStatus(connection),
	onLog: wireRuntimeBridgeLogs(connection.console)
});
const runtimeBridgeHandlers = createRuntimeBridgeNotificationHandlers(runtimeBridgeClient);
let workspaceFolders: WorkspaceFolder[] = [];
let configuredResourcePackPath: string | undefined;
let preferredLocale: string | undefined;

connection.onInitialize((params: InitializeParams) => {
	workspaceFolders = params.workspaceFolders ?? [];
	const initializationOptions = readInitializationOptions(params.initializationOptions);
	setServerLocale(initializationOptions.locale);
	preferredLocale = initializationOptions.locale;
	configuredResourcePackPath = readConfiguredResourcePackPath(initializationOptions);
	return {
		capabilities: {
			textDocumentSync: TextDocumentSyncKind.Incremental,
			completionProvider: { triggerCharacters: GuideNhCompletionTriggerCharacters },
			definitionProvider: true,
			referencesProvider: true,
			hoverProvider: true,
			codeActionProvider: {
				codeActionKinds: [CodeActionKind.QuickFix]
			},
			documentLinkProvider: {
				resolveProvider: false
			}
		}
	};
});

connection.onInitialized(() => {
	const folders = resolveInitialWorkspaceFolders(workspaceFolders, configuredResourcePackPath);
	void initializeWorkspace(folders);
});

connection.onDidChangeWatchedFiles(async (params: DidChangeWatchedFilesParams) => {
	try {
		await applyGuideNhWorkspaceFileChanges(params.changes, workspaceIndex, resourceIndex);
		await refreshOpenDocumentDiagnostics();
	} catch (error) {
		connection.console.warn(`GuideNH file change update failed: ${error instanceof Error ? error.message : String(error)}`);
	}
});

connection.onRequest(RuntimePreviewSearchRequest, async (payload: PreviewSearchPayload) => {
	return runtimeBridgeClient.queryPreviewSearch(payload);
});

connection.onRequest(RuntimePreviewResolveRequest, async (payload: PreviewResolvePayload) => {
	return runtimeBridgeClient.queryPreviewResolve(payload);
});

documents.onDidChangeContent(async (change) => {
	workspaceIndex.updatePage(change.document.uri, change.document.getText());
	await publishDiagnostics(change.document);
});

connection.onCompletion(async (params) => {
	try {
		const document = documents.get(params.textDocument.uri);
		if (!document) {
			return [];
		}
		const schema = await schemaPromise;
		const requestedOffset = document.offsetAt(params.position);
		const offset = resolveGuideNhCompletionOffset(document.getText(), requestedOffset);
		const text = document.getText();
		const completionResult = createGuideNhCompletionResult(
			text,
			offset,
			schema,
			undefined,
			semanticCache,
			workspaceIndex,
			resourceIndex,
			document.uri
		);
		if (!completionResult.dynamicRequest) {
			return completionResult.items;
		}
		if (!shouldQueryRuntimeCompletion(completionResult.items.length, completionResult.dynamicRequest.filters)) {
			return completionResult.items;
		}
		const runtimeEntries = await runtimeBridgeClient.querySemanticEntries({
			capability: completionResult.dynamicRequest.capability,
			prefix: completionResult.dynamicRequest.prefix,
			filters: completionResult.dynamicRequest.filters
		});
		const runtimeItems = createRuntimeSemanticCompletionItems(
			completionResult.dynamicRequest.capability,
			runtimeEntries
		);
		const runtimeItemsWithReplacement = applyCompletionReplacementRange(
			runtimeItems,
			completionResult.runtimeReplacement
		);
		return deduplicateCompletionItems(completionResult.items, runtimeItemsWithReplacement);
	} catch (error) {
		connection.console.error(`onCompletion error: ${error instanceof Error ? error.message : String(error)}`);
		return [];
	}
});

connection.onHover(async (params) => {
	try {
		const document = documents.get(params.textDocument.uri);
		if (!document) {
			return undefined;
		}
		const schema = await schemaPromise;
		const offset = document.offsetAt(params.position);
		const hoverResult = createGuideNhHover(document.getText(), offset, schema, workspaceIndex, resourceIndex, semanticCache, document.uri, preferredLocale);
		if (hoverResult.hover || !hoverResult.dynamicRequest) {
			return hoverResult.hover;
		}
		const runtimeEntries = await runtimeBridgeClient.querySemanticEntries({
			capability: hoverResult.dynamicRequest.capability,
			prefix: hoverResult.dynamicRequest.prefix,
			filters: hoverResult.dynamicRequest.filters,
			limit: 20
		});
		const runtimeHover = createRuntimeSemanticHover(runtimeEntries, hoverResult.dynamicRequest.prefix);
		return runtimeHover ?? hoverResult.hover;
	} catch (error) {
		connection.console.error(`onHover error: ${error instanceof Error ? error.message : String(error)}`);
		return undefined;
	}
});

connection.onDefinition((params) => {
	const document = documents.get(params.textDocument.uri);
	if (!document) {
		return undefined;
	}
	return createGuideNhDefinition(document.getText(), document.offsetAt(params.position), workspaceIndex, resourceIndex, document.uri, preferredLocale);
});

connection.onReferences((params) => {
	const document = documents.get(params.textDocument.uri);
	if (!document) {
		return [];
	}
	const current = document.uri.slice(document.uri.lastIndexOf('/') + 1);
	return createGuideNhReferences(document.getText(), document.offsetAt(params.position), current, workspaceIndex, document.uri);
});

connection.onDocumentLinks((params): DocumentLink[] => {
	const document = documents.get(params.textDocument.uri);
	if (!document) {
		return [];
	}
	return createGuideNhDocumentLinks(document.getText(), document.uri, workspaceIndex, preferredLocale);
});

connection.onCodeAction(async (params) => {
	const document = documents.get(params.textDocument.uri);
	if (!document) {
		return [];
	}
	const schema = await schemaPromise;
	return createGuideNhCodeActions(document.uri, document.getText(), schema, params.context.diagnostics);
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
	try {
		const schema = await schemaPromise;
		const diagnostics = createGuideNhDiagnostics(document.getText(), schema, workspaceIndex, resourceIndex, document.uri, preferredLocale);
		connection.sendDiagnostics({ uri: document.uri, diagnostics });
	} catch (error) {
		connection.console.error(`publishDiagnostics error: ${error instanceof Error ? error.message : String(error)}`);
	}
}

function deduplicateCompletionItems<T extends { label: string }>(primary: T[], secondary: T[]): T[] {
	const seen = new Set(primary.map((item) => item.label));
	const merged = primary.slice();
	for (const item of secondary) {
		if (seen.has(item.label)) {
			continue;
		}
		seen.add(item.label);
		merged.push(item);
	}
	return merged;
}

async function initializeWorkspace(folders: WorkspaceFolder[]): Promise<void> {
	try {
		await indexGuideNhWorkspaceFolders(folders, workspaceIndex, resourceIndex);
		await publishWorkspaceDiagnostics(folders);
	} catch (error) {
		connection.console.warn(`GuideNH workspace scan failed: ${error instanceof Error ? error.message : String(error)}`);
	} finally {
		await refreshOpenDocumentDiagnostics();
	}
}

async function publishWorkspaceDiagnostics(folders: WorkspaceFolder[]): Promise<void> {
	const schema = await schemaPromise;
	await forEachGuideNhMarkdownDocument(folders, async (document) => {
		const diagnostics = createGuideNhDiagnostics(
			document.text,
			schema,
			workspaceIndex,
			resourceIndex,
			document.uri,
			preferredLocale
		);
		connection.sendDiagnostics({ uri: document.uri, diagnostics });
	});
}

function shouldQueryRuntimeCompletion(existingItemCount: number, filters: Record<string, string>): boolean {
	return existingItemCount === 0 || Object.keys(filters).length > 0;
}

function createRuntimeSemanticHover(
	entries: Array<{ id: string; label?: string; detail?: string }>,
	targetValue: string
) {
	const entry = entries.find((candidate) => candidate.id === targetValue) ?? entries[0];
	if (!entry) {
		return undefined;
	}
	const lines = [
		`**${entry.id}**`
	];
	if (entry.label) {
		lines.push('', entry.label);
	}
	if (entry.detail && entry.detail !== entry.id) {
		lines.push('', entry.detail);
	}
	return {
		contents: {
			kind: MarkupKind.Markdown,
			value: lines.join('\n')
		}
	};
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
