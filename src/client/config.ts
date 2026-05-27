import * as vscode from 'vscode';

export interface GuideNhExtensionDefaults {
	guideNhSourcePath: string;
	resourcePackPath?: string;
	runtimeHost: string;
	runtimePort: number;
	runtimeToken: string;
	runtimeAllowRemote: boolean;
	runtimeAutoConnectOnStartup?: boolean;
}

export function isGuideNhDocumentSelector(path: string): boolean {
	const normalized = path.replace(/\\/g, '/');
	return /(^|\/)assets\/[^/]+\/guidenh\/(?:guidenh\/)?_[^/]+\/.+\.md$/i.test(normalized);
}

export function readGuideNhDefaults(): GuideNhExtensionDefaults {
	const config = vscode.workspace.getConfiguration('guide-vsc');
	return {
		guideNhSourcePath: config.get('guideNhSourcePath', 'E:\\Github\\GuideNH'),
		resourcePackPath: config.get('resourcePackPath', 'E:\\Github\\GuideNH\\wiki\\resourcepack'),
		runtimeHost: config.get('runtimeBridge.host', ''),
		runtimePort: config.get('runtimeBridge.port', 0),
		runtimeToken: config.get('runtimeBridge.token', ''),
		runtimeAllowRemote: config.get('runtimeBridge.allowRemote', false),
		runtimeAutoConnectOnStartup: config.get('runtimeBridge.autoConnectOnStartup', false)
	};
}
