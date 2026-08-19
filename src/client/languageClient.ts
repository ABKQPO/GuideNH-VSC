import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient/node';
import { GuideNhInitializationOptions } from '../common/protocol';
import { readGuideNhDefaults } from './config';

export interface ExtensionPathResolver {
	asAbsolutePath(relativePath: string): string;
}

export function resolveGuideNhServerModule(pathResolver: ExtensionPathResolver): string {
	const bundled = pathResolver.asAbsolutePath(path.join('out', 'server.js'));
	const compiled = pathResolver.asAbsolutePath(path.join('out', 'server', 'server.js'));
	if (fs.existsSync(bundled)) {
		return bundled;
	}
	return compiled;
}

export function createGuideNhLanguageClient(context: vscode.ExtensionContext): LanguageClient {
	const serverModule = resolveGuideNhServerModule(context);
	const defaults = readGuideNhDefaults();
	const initializationOptions: GuideNhInitializationOptions = {
		locale: vscode.env.language,
		resourcePackPath: defaults.resourcePackPath
	};
	const serverOptions: ServerOptions = {
		run: { module: serverModule, transport: TransportKind.ipc },
		debug: { module: serverModule, transport: TransportKind.ipc }
	};
	const assetWatcher = vscode.workspace.createFileSystemWatcher('**/assets/**/*');
	context.subscriptions.push(assetWatcher);
	const clientOptions: LanguageClientOptions = {
		documentSelector: [
			{ scheme: 'file', language: 'markdown' },
			{ scheme: 'file', language: 'guidenh-md' }
		],
		synchronize: {
			configurationSection: 'guide-vsc',
			fileEvents: assetWatcher
		},
		initializationOptions
	};
	return new LanguageClient('guide-vsc', 'GuideNH Language Server', serverOptions, clientOptions);
}
