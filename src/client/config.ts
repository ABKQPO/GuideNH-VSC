import * as vscode from 'vscode';

export interface GuideNhExtensionDefaults {
	guideNhSourcePath: string;
	runtimeHost: string;
	runtimePort: number;
	runtimeToken: string;
}

export function isGuideNhDocumentSelector(path: string): boolean {
	const normalized = path.replace(/\\/g, '/');
	return /(^|\/)assets\/[^/]+\/guidenh\/_[^/]+\/.+\.md$/i.test(normalized);
}

export function readGuideNhDefaults(): GuideNhExtensionDefaults {
	const config = vscode.workspace.getConfiguration('guide-vsc');
	return {
		guideNhSourcePath: config.get('guideNhSourcePath', 'E:\\Github\\GuideNH'),
		runtimeHost: config.get('runtimeBridge.host', ''),
		runtimePort: config.get('runtimeBridge.port', 0),
		runtimeToken: config.get('runtimeBridge.token', '')
	};
}
