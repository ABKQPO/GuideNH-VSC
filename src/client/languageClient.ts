import * as path from 'path';
import * as vscode from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient/node';

export interface ExtensionPathResolver {
	asAbsolutePath(relativePath: string): string;
}

export function resolveGuideNhServerModule(pathResolver: ExtensionPathResolver): string {
	return pathResolver.asAbsolutePath(path.join('out', 'server.js'));
}

export function createGuideNhLanguageClient(context: vscode.ExtensionContext): LanguageClient {
	const serverModule = resolveGuideNhServerModule(context);
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
		}
	};
	return new LanguageClient('guide-vsc', 'GuideNH Language Server', serverOptions, clientOptions);
}
