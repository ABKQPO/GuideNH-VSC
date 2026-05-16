import { SemanticEntry } from '../../common/protocol';

interface CapabilityCache {
	version: number;
	stale: boolean;
	entries: SemanticEntry[];
	keys: string[];
	labels: string[];
	details: string[];
}

export class SemanticCache {
	private static readonly defaultQueryLimit = 200;

	private readonly capabilities = new Map<string, CapabilityCache>();

	replace(capability: string, version: number, entries: SemanticEntry[]): void {
		const indexedEntries = createIndexedEntries(entries);
		this.capabilities.set(capability, {
			version,
			entries: indexedEntries,
			keys: indexedEntries.map((entry) => entry.id.toLowerCase()),
			labels: indexedEntries.map((entry) => (entry.label ?? '').toLowerCase()),
			details: indexedEntries.map((entry) => (entry.detail ?? '').toLowerCase()),
			stale: false
		});
	}

	getVersion(capability: string): number {
		return this.capabilities.get(capability)?.version ?? 0;
	}

	queryPrefix(capability: string, prefix: string, limit = SemanticCache.defaultQueryLimit): SemanticEntry[] {
		if (limit <= 0) {
			return [];
		}
		const cache = this.capabilities.get(capability);
		if (!cache) {
			return [];
		}
		if (prefix.length === 0) {
			return cache.entries.slice(0, limit);
		}
		const lowered = prefix.toLowerCase();
		const start = lowerBound(cache.keys, lowered);
		const matches: SemanticEntry[] = [];
		const seenKeys = new Set<string>();
		for (let index = start; index < cache.entries.length && matches.length < limit; index++) {
			if (!cache.keys[index].startsWith(lowered)) {
				break;
			}
			matches.push(cache.entries[index]);
			seenKeys.add(cache.keys[index]);
		}
		if (matches.length >= limit) {
			return matches;
		}
		for (let index = 0; index < cache.entries.length && matches.length < limit; index++) {
			if (seenKeys.has(cache.keys[index])) {
				continue;
			}
			if (cache.labels[index].startsWith(lowered) || cache.details[index].startsWith(lowered)) {
				matches.push(cache.entries[index]);
				seenKeys.add(cache.keys[index]);
			}
		}
		return matches;
	}

	findEntry(capability: string, query: string): SemanticEntry | undefined {
		const normalizedQuery = query.toLowerCase();
		const cache = this.capabilities.get(capability);
		if (!cache || normalizedQuery.length === 0) {
			return undefined;
		}
		for (let index = 0; index < cache.entries.length; index++) {
			if (cache.keys[index] === normalizedQuery) {
				return cache.entries[index];
			}
		}
		for (let index = 0; index < cache.entries.length; index++) {
			if (cache.labels[index] === normalizedQuery || cache.details[index] === normalizedQuery) {
				return cache.entries[index];
			}
		}
		return undefined;
	}

	markStale(): void {
		for (const cache of this.capabilities.values()) {
			cache.stale = true;
		}
	}

	isStale(capability: string): boolean {
		return this.capabilities.get(capability)?.stale ?? false;
	}
}

function createIndexedEntries(entries: SemanticEntry[]): SemanticEntry[] {
	const byKey = new Map<string, SemanticEntry>();
	for (const entry of entries) {
		const key = entry.id.toLowerCase();
		if (!byKey.has(key)) {
			byKey.set(key, entry);
		}
	}
	return Array.from(byKey.values()).sort((left, right) => {
		return left.id.localeCompare(right.id, undefined, { sensitivity: 'base' });
	});
}

function lowerBound(values: string[], target: string): number {
	let low = 0;
	let high = values.length;
	while (low < high) {
		const middle = Math.floor((low + high) / 2);
		if (values[middle] < target) {
			low = middle + 1;
		} else {
			high = middle;
		}
	}
	return low;
}
