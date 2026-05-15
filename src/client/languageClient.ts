import * as path from 'path';
import * as vscode from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient/node';

export function createGuideNhLanguageClient(context: vscode.ExtensionContext): LanguageClient {
	const serverModule = context.asAbsolutePath(path.join('out', 'server', 'server.js'));
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
