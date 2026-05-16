import * as vscode from 'vscode';

export function localize(message: string, ...args: Array<string | number>): string {
	return vscode.l10n.t(message, ...args);
}
