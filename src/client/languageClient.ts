import * as path from 'path';
import * as vscode from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient/node';
import { GuideNhInitializationOptions } from '../common/protocol';
import { readGuideNhDefaults } from './config';

export interface ExtensionPathResolver {
	asAbsolutePath(relativePath: string): string;
}

export function resolveGuideNhServerModule(pathResolver: ExtensionPathResolver): string {
	return pathResolver.asAbsolutePath(path.join('out', 'server.js'));
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
	const clientOptions: LanguageClientOptions = {
		documentSelector: [
			{ scheme: 'file', language: 'markdown' },
			{ scheme: 'file', language: 'guidenh-md' }
		],
		synchronize: {
			configurationSection: 'guide-vsc'
		},
		initializationOptions
	};
	return new LanguageClient('guide-vsc', 'GuideNH Language Server', serverOptions, clientOptions);
}
