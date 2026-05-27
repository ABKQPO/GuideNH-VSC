import WebSocket from 'ws';
import {
	BridgeEnvelope,
	createCapabilitiesMessage,
	createPreviewResolveMessage,
	createPreviewSearchMessage,
	createRuntimeDocumentValidateMessage,
	createHelloMessage,
	createSemanticQueryMessage,
	MaxRuntimeDocumentBytes,
	PreviewResolvePayload,
	PreviewResolveResultPayload,
	PreviewSearchPayload,
	PreviewSearchResultPayload,
	RuntimeCapabilitiesPayload,
	SemanticEntry,
	SemanticQueryResultPayload,
	RuntimeDocumentValidateParams,
	RuntimeBridgeStatusParams,
	RuntimeBridgeStatusState
} from '../../common/protocol';
import { SemanticCache } from './semanticCache';
import {
	createSemanticPayloadGuardState,
	SemanticPayloadGuardState,
	validateSemanticPayload
} from './semanticPayloadGuard';
import { validateBridgeEnvelope } from './runtimeBridgeEnvelopeGuard';
import { createRuntimeBridgeWebSocketUrl, resolveRuntimeBridgeConnectionParams } from '../../common/runtimeBridgeSecurity';
import { localizeServer } from '../localization';

export interface RuntimeBridgeConnectionOptions {
	host: string;
	port: number;
	token: string;
	allowRemote: boolean;
}

export type RuntimeBridgeState = RuntimeBridgeStatusState;
export type RuntimeBridgeStatus = RuntimeBridgeStatusParams;

export interface RuntimeBridgeClientEvents {
	onStatus?: (status: RuntimeBridgeStatus) => void;
	onLog?: (message: string) => void;
}

export interface RuntimeSemanticQueryOptions {
	capability: string;
	prefix?: string;
	limit?: number;
	filters?: Record<string, string>;
}

const MaxRuntimeBridgeMessageBytes = 262144;

export class RuntimeBridgeClient {
	private static readonly preferredBootstrapCapabilities = [
		'commands',
		'sounds',
		'keybinds',
		'recipes',
		'quests',
		'entities',
		'structurelib',
		'pages'
	];

	private static readonly dynamicOnlyCapabilities = [
		'items',
		'ores',
		'categories',
		'mods'
	];

	private socket: WebSocket | undefined;
	private connected = false;
	private readonly pendingEntries = new Map<string, SemanticEntry[]>();
	private readonly pendingPayloadStates = new Map<string, SemanticPayloadGuardState>();
	private readonly pendingDocumentValidations = new Set<string>();
	private readonly pendingSemanticQueries = new Map<string, { resolve: (entries: SemanticEntry[]) => void; reject: (error: Error) => void }>();
	private readonly pendingPreviewRequests = new Map<string, {
		resolve: (payload: PreviewSearchResultPayload | PreviewResolveResultPayload) => void;
		reject: (error: Error) => void;
		method: 'preview.search' | 'preview.resolve';
	}>();
	private readonly allowedCapabilities = new Set(RuntimeBridgeClient.preferredBootstrapCapabilities);
	private readonly bootstrapCapabilities = new Set(RuntimeBridgeClient.preferredBootstrapCapabilities);
	private documentValidationSequence = 0;
	private semanticQuerySequence = 0;
	private previewRequestSequence = 0;

	public constructor(
		private readonly cache: SemanticCache,
		private readonly events: RuntimeBridgeClientEvents = {}
	) {}

	connect(options: RuntimeBridgeConnectionOptions): void {
		const resolvedOptions = resolveRuntimeBridgeConnectionParams(options);
		this.closeSocket();
		this.pendingEntries.clear();
		this.pendingPayloadStates.clear();
		const url = createRuntimeBridgeWebSocketUrl(resolvedOptions);
		this.log(`GuideNH runtime bridge connecting to ${url}`);
		this.publishStatus({ state: 'connecting' });
		const socket = new WebSocket(url, {
			maxPayload: MaxRuntimeBridgeMessageBytes
		});
		this.socket = socket;
		socket.on('open', () => {
			if (this.socket !== socket) {
				return;
			}
			this.log('GuideNH runtime bridge socket opened, sending hello.');
			this.send(createHelloMessage(resolvedOptions.token));
		});
		socket.on('message', (data) => {
			if (this.socket !== socket) {
				return;
			}
			this.handleMessage(data.toString());
		});
		socket.on('error', (error) => {
			if (this.socket !== socket) {
				return;
			}
			this.connected = false;
			this.log(`GuideNH runtime bridge socket error: ${formatRuntimeBridgeError(error)}`);
			this.publishStatus({ state: 'error', message: formatRuntimeBridgeError(error) });
		});
		socket.on('close', () => {
			if (this.socket !== socket) {
				return;
			}
			this.connected = false;
			this.pendingEntries.clear();
			this.pendingPayloadStates.clear();
			this.cache.markStale();
			this.log('GuideNH runtime bridge socket closed.');
			this.publishStatus({ state: 'disconnected' });
		});
	}

	disconnect(): void {
		this.log('GuideNH runtime bridge disconnect requested.');
		this.closeSocket();
		this.cache.markStale();
		this.publishStatus({ state: 'disconnected' });
	}

	querySemanticEntries(options: RuntimeSemanticQueryOptions): Promise<SemanticEntry[]> {
		if (!this.connected) {
			return Promise.resolve([]);
		}
		const requestId = this.createSemanticQueryRequestId();
		const capability = options.capability;
		const prefix = options.prefix ?? '';
		const limit = options.limit ?? 200;
		const filters = options.filters ?? {};
		return new Promise<SemanticEntry[]>((resolve, reject) => {
			this.pendingSemanticQueries.set(requestId, { resolve, reject });
			this.send(createSemanticQueryMessage(requestId, capability, '', limit, prefix, filters));
		});
	}

	validateDocument(document: RuntimeDocumentValidateParams): void {
		if (!this.connected) {
			const message = localizeServer('runtime.bridge.mustConnectBeforeValidation');
			this.publishStatus({ state: 'error', message });
			throw new Error(message);
		}
		const byteLength = Buffer.byteLength(document.text, 'utf8');
		if (byteLength > MaxRuntimeDocumentBytes) {
			throw new Error(localizeServer('runtime.document.payloadTooLarge', byteLength));
		}
		const requestId = this.createDocumentValidationRequestId();
		this.pendingDocumentValidations.add(requestId);
		this.send(createRuntimeDocumentValidateMessage(requestId, document));
	}

	queryPreviewSearch(payload: PreviewSearchPayload): Promise<PreviewSearchResultPayload> {
		if (!this.connected) {
			return Promise.resolve({
				capability: payload.capability,
				version: 0,
				entries: [],
				nextCursor: null
			});
		}
		const requestId = this.createPreviewRequestId('preview.search');
		return new Promise<PreviewSearchResultPayload>((resolve, reject) => {
			this.pendingPreviewRequests.set(requestId, {
				resolve: (result) => resolve(result as PreviewSearchResultPayload),
				reject,
				method: 'preview.search'
			});
			this.send(
				createPreviewSearchMessage(
					requestId,
					payload.capability,
					payload.cursor,
					payload.limit,
					payload.prefix,
					payload.filters
				)
			);
		});
	}

	queryPreviewResolve(payload: PreviewResolvePayload): Promise<PreviewResolveResultPayload> {
		if (!this.connected) {
			return Promise.reject(new Error(localizeServer('runtime.bridge.rejected')));
		}
		const requestId = this.createPreviewRequestId('preview.resolve');
		return new Promise<PreviewResolveResultPayload>((resolve, reject) => {
			this.pendingPreviewRequests.set(requestId, {
				resolve: (result) => resolve(result as PreviewResolveResultPayload),
				reject,
				method: 'preview.resolve'
			});
			this.send(createPreviewResolveMessage(requestId, payload));
		});
	}

	private send(message: BridgeEnvelope): void {
		this.socket?.send(JSON.stringify(message));
	}

	private handleMessage(data: string): void {
		if (Buffer.byteLength(data, 'utf8') > MaxRuntimeBridgeMessageBytes) {
			this.publishStatus({ state: 'error', message: localizeServer('runtime.bridge.messageTooLarge') });
			return;
		}
		const message = this.parseMessage(data);
		if (!message) {
			return;
		}
		if (message.type === 'error') {
			this.publishStatus({ state: 'error', message: localizeServer('runtime.bridge.rejected') });
			return;
		}
		if (message.method === 'hello' && message.type === 'response') {
			this.connected = true;
			this.log('GuideNH runtime bridge hello acknowledged.');
			this.publishStatus({ state: 'connected' });
			this.send(createCapabilitiesMessage());
			return;
		}
		if (message.method === 'capabilities' && message.type === 'response') {
			this.handleCapabilitiesResult(message.payload);
			return;
		}
		if (message.method === 'semantic.query' && message.type === 'response') {
			this.handleSemanticQueryResult(message.id, message.payload);
			return;
		}
		if ((message.method === 'preview.search' || message.method === 'preview.resolve') && message.type === 'response') {
			this.handlePreviewResponse(message.id, message.payload);
			return;
		}
		if (message.method === 'document.validate' && message.type === 'response') {
			this.handleDocumentValidationResult(message.id);
		}
	}

	private refreshBootstrapCapabilities(): void {
		for (const capability of this.bootstrapCapabilities) {
			this.pendingEntries.set(capability, []);
			this.pendingPayloadStates.set(capability, createSemanticPayloadGuardState());
			this.send(createSemanticQueryMessage(`semantic.${capability}.0`, capability));
		}
	}

	private handleCapabilitiesResult(value: unknown): void {
		const capabilities = this.parseCapabilities(value);
		if (!capabilities) {
			this.refreshBootstrapCapabilities();
			return;
		}
		this.allowedCapabilities.clear();
		this.bootstrapCapabilities.clear();
		for (const capability of capabilities) {
			this.allowedCapabilities.add(capability);
			if (RuntimeBridgeClient.preferredBootstrapCapabilities.includes(capability)) {
				this.bootstrapCapabilities.add(capability);
			}
		}
		for (const capability of RuntimeBridgeClient.dynamicOnlyCapabilities) {
			this.allowedCapabilities.add(capability);
		}
		this.refreshBootstrapCapabilities();
	}

	private handleSemanticQueryResult(id: string | undefined, value: unknown): void {
		if (id && this.pendingSemanticQueries.has(id)) {
			this.handleOneShotSemanticQueryResult(id, value);
			return;
		}
		let payload: SemanticQueryResultPayload;
		let nextCursor: string | undefined;
		let totalEntries: number;
		try {
			const rawCapability = typeof value === 'object' && value ? (value as Partial<SemanticQueryResultPayload>).capability : undefined;
			const capability = typeof rawCapability === 'string' ? rawCapability : '';
			const state = this.pendingPayloadStates.get(capability);
			if (!state) {
				throw new Error(localizeServer('runtime.semantic.notRequested'));
			}
			const result = validateSemanticPayload(value, this.allowedCapabilities, state);
			payload = result.payload;
			nextCursor = result.nextCursor;
			totalEntries = result.totalEntries;
			this.pendingPayloadStates.set(payload.capability, state);
		} catch (error) {
			this.publishStatus({ state: 'error', message: error instanceof Error ? error.message : localizeServer('runtime.semantic.invalidPayload') });
			return;
		}
		const existing = this.pendingEntries.get(payload.capability) ?? [];
		const entries = existing.concat(payload.entries);
		if (nextCursor) {
			this.pendingPayloadStates.get(payload.capability)?.seenCursors.add(nextCursor);
			const state = this.pendingPayloadStates.get(payload.capability);
			if (state) {
				state.totalEntries = totalEntries;
			}
			this.pendingEntries.set(payload.capability, entries);
			this.send(createSemanticQueryMessage(`semantic.${payload.capability}.${nextCursor}`, payload.capability, nextCursor));
			return;
		}
		this.pendingEntries.delete(payload.capability);
		this.pendingPayloadStates.delete(payload.capability);
		this.cache.replace(payload.capability, payload.version, entries);
	}

	private handleOneShotSemanticQueryResult(id: string, value: unknown): void {
		const pending = this.pendingSemanticQueries.get(id);
		if (!pending) {
			return;
		}
		this.pendingSemanticQueries.delete(id);
		try {
			const payload = value as Partial<SemanticQueryResultPayload>;
			if (!payload || !Array.isArray(payload.entries)) {
				throw new Error(localizeServer('runtime.semantic.invalidPayload'));
			}
			pending.resolve(payload.entries);
		} catch (error) {
			pending.reject(error instanceof Error ? error : new Error(localizeServer('runtime.semantic.invalidPayload')));
		}
	}

	private handleDocumentValidationResult(id: string | undefined): void {
		if (!id || !this.pendingDocumentValidations.has(id)) {
			this.publishStatus({ state: 'error', message: localizeServer('runtime.validation.notRequested') });
			return;
		}
		this.pendingDocumentValidations.delete(id);
	}

	private handlePreviewResponse(id: string | undefined, payload: unknown): void {
		if (!id) {
			return;
		}
		const pending = this.pendingPreviewRequests.get(id);
		if (!pending) {
			return;
		}
		this.pendingPreviewRequests.delete(id);
		try {
			if (!payload || typeof payload !== 'object') {
				throw new Error(localizeServer('runtime.bridge.invalidJson'));
			}
			pending.resolve(payload as PreviewSearchResultPayload | PreviewResolveResultPayload);
		} catch (error) {
			pending.reject(error instanceof Error ? error : new Error(localizeServer('runtime.bridge.invalidJson')));
		}
	}

	private parseMessage(data: string): BridgeEnvelope | undefined {
		try {
			return validateBridgeEnvelope(JSON.parse(data));
		} catch (error) {
			this.publishStatus({
				state: 'error',
				message: error instanceof Error ? error.message : localizeServer('runtime.bridge.invalidJson')
			});
			return undefined;
		}
	}

	private parseCapabilities(value: unknown): string[] | undefined {
		if (!value || typeof value !== 'object') {
			return undefined;
		}
		const payload = value as Partial<RuntimeCapabilitiesPayload>;
		if (!Array.isArray(payload.capabilities)) {
			return undefined;
		}
		const capabilities = payload.capabilities.filter((candidate): candidate is string => typeof candidate === 'string' && candidate.length > 0);
		return capabilities.length > 0 ? capabilities : undefined;
	}

	private publishStatus(status: RuntimeBridgeStatus): void {
		this.events.onStatus?.(status);
	}

	private log(message: string): void {
		this.events.onLog?.(message);
	}

	private closeSocket(): void {
		this.connected = false;
		this.pendingEntries.clear();
		this.pendingPayloadStates.clear();
		this.pendingDocumentValidations.clear();
		for (const pending of this.pendingSemanticQueries.values()) {
			pending.reject(new Error(localizeServer('runtime.bridge.rejected')));
		}
		this.pendingSemanticQueries.clear();
		for (const pending of this.pendingPreviewRequests.values()) {
			pending.reject(new Error(localizeServer('runtime.bridge.rejected')));
		}
		this.pendingPreviewRequests.clear();
		const socket = this.socket;
		this.socket = undefined;
		socket?.close();
	}

	private createDocumentValidationRequestId(): string {
		this.documentValidationSequence++;
		return `document.validate.${this.documentValidationSequence}`;
	}

	private createSemanticQueryRequestId(): string {
		this.semanticQuerySequence++;
		return `semantic.query.dynamic.${this.semanticQuerySequence}`;
	}

	private createPreviewRequestId(method: 'preview.search' | 'preview.resolve'): string {
		this.previewRequestSequence++;
		return `${method}.${this.previewRequestSequence}`;
	}
}

function formatRuntimeBridgeError(error: Error): string {
	if (error.message.toLowerCase().includes('max payload')) {
		return localizeServer('runtime.bridge.messageTooLarge');
	}
	return error.message;
}
