import { LanguageClient } from 'vscode-languageclient/node';
import {
	PreviewResolvePayload,
	PreviewResolveResultPayload,
	PreviewSearchPayload,
	PreviewSearchResultPayload,
	RuntimePreviewResolveRequest,
	RuntimePreviewSearchRequest
} from '../common/protocol';

export class RuntimePreviewClient {
	public constructor(private readonly languageClient: LanguageClient) {}

	public search(payload: PreviewSearchPayload): Thenable<PreviewSearchResultPayload> {
		return this.languageClient.sendRequest<PreviewSearchResultPayload>(RuntimePreviewSearchRequest, payload);
	}

	public resolve(payload: PreviewResolvePayload): Thenable<PreviewResolveResultPayload> {
		return this.languageClient.sendRequest<PreviewResolveResultPayload>(RuntimePreviewResolveRequest, payload);
	}
}
