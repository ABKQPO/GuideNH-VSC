import {
	PreviewResolvePayload,
	PreviewResolveResultPayload,
	PreviewSearchPayload,
	PreviewSearchResultPayload
} from '../../common/protocol';

export interface RuntimePreviewTransport {
	search(payload: PreviewSearchPayload): Thenable<PreviewSearchResultPayload> | Promise<PreviewSearchResultPayload>;
	resolve(payload: PreviewResolvePayload): Thenable<PreviewResolveResultPayload> | Promise<PreviewResolveResultPayload>;
}

export interface ItemStackPreviewClientOptions {
	maxResolvedEntries?: number;
	maxSearchEntries?: number;
}

export class ItemStackPreviewClient {
	private readonly resolvedCache = new Map<string, PreviewResolveResultPayload>();
	private readonly searchCache = new Map<string, PreviewSearchResultPayload>();
	private readonly inflightResolved = new Map<string, Promise<PreviewResolveResultPayload>>();
	private readonly inflightSearch = new Map<string, Promise<PreviewSearchResultPayload>>();
	private readonly maxResolvedEntries: number;
	private readonly maxSearchEntries: number;

	public constructor(
		private readonly runtimePreviewClient: RuntimePreviewTransport,
		options: ItemStackPreviewClientOptions = {}
	) {
		this.maxResolvedEntries = Math.max(16, options.maxResolvedEntries ?? 128);
		this.maxSearchEntries = Math.max(8, options.maxSearchEntries ?? 64);
	}

	public async search(payload: PreviewSearchPayload): Promise<PreviewSearchResultPayload> {
		const cacheKey = createSearchCacheKey(payload);
		const cached = this.readFromCache(this.searchCache, cacheKey);
		if (cached) {
			return cached;
		}
		const existing = this.inflightSearch.get(cacheKey);
		if (existing) {
			return existing;
		}
		const request = Promise.resolve(this.runtimePreviewClient.search(payload))
			.then((result) => {
				this.writeToCache(this.searchCache, cacheKey, result, this.maxSearchEntries);
				return result;
			})
			.finally(() => {
				this.inflightSearch.delete(cacheKey);
			});
		this.inflightSearch.set(cacheKey, request);
		return request;
	}

	public async resolve(payload: PreviewResolvePayload): Promise<PreviewResolveResultPayload> {
		const cacheKey = createResolveCacheKey(payload);
		const cached = this.readFromCache(this.resolvedCache, cacheKey);
		if (cached) {
			return cached;
		}
		const existing = this.inflightResolved.get(cacheKey);
		if (existing) {
			return existing;
		}
		const request = Promise.resolve(this.runtimePreviewClient.resolve(payload))
			.then((result) => {
				this.writeToCache(this.resolvedCache, cacheKey, result, this.maxResolvedEntries);
				return result;
			})
			.finally(() => {
				this.inflightResolved.delete(cacheKey);
			});
		this.inflightResolved.set(cacheKey, request);
		return request;
	}

	public clear(): void {
		this.resolvedCache.clear();
		this.searchCache.clear();
		this.inflightResolved.clear();
		this.inflightSearch.clear();
	}

	public dispose(): void {
		this.clear();
	}

	private readFromCache<T>(cache: Map<string, T>, key: string): T | undefined {
		const value = cache.get(key);
		if (!value) {
			return undefined;
		}
		cache.delete(key);
		cache.set(key, value);
		return value;
	}

	private writeToCache<T>(cache: Map<string, T>, key: string, value: T, maxEntries: number): void {
		cache.delete(key);
		cache.set(key, value);
		while (cache.size > maxEntries) {
			const oldestKey = cache.keys().next().value as string | undefined;
			if (!oldestKey) {
				break;
			}
			cache.delete(oldestKey);
		}
	}
}

function createSearchCacheKey(payload: PreviewSearchPayload): string {
	return JSON.stringify({
		capability: payload.capability,
		cursor: payload.cursor,
		limit: payload.limit,
		prefix: payload.prefix,
		filters: sortRecord(payload.filters)
	});
}

function createResolveCacheKey(payload: PreviewResolvePayload): string {
	return JSON.stringify({
		capability: payload.capability,
		id: payload.id,
		count: payload.count ?? 1,
		nbt: payload.nbt ?? '',
		renderVariant: payload.renderVariant ?? '',
		filters: sortRecord(payload.filters ?? {})
	});
}

function sortRecord(source: Record<string, string>): Record<string, string> {
	return Object.fromEntries(
		Object.entries(source).sort(([left], [right]) => left.localeCompare(right))
	);
}
