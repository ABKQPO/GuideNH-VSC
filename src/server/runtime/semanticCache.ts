import { SemanticEntry } from '../../common/protocol';

interface CapabilityCache {
	version: number;
	stale: boolean;
	entries: SemanticEntry[];
	keys: string[];
	namespaces: string[];
	labels: string[];
	details: string[];
	pathKeys: string[];
	compactPathKeys: string[];
	tokenInitials: string[];
	labelInitials: string[];
	compactKeys: string[];
	compactLabels: string[];
	compactDetails: string[];
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
			namespaces: indexedEntries.map((entry) => extractSemanticNamespaceKey(entry.id)),
			labels: indexedEntries.map((entry) => (entry.label ?? '').toLowerCase()),
			details: indexedEntries.map((entry) => (entry.detail ?? '').toLowerCase()),
			pathKeys: indexedEntries.map((entry) => extractSemanticPathKey(entry.id)),
			compactPathKeys: indexedEntries.map((entry) => compactSemanticKey(extractSemanticPathKey(entry.id))),
			tokenInitials: indexedEntries.map((entry) => createTokenInitials(extractSemanticPathKey(entry.id))),
			labelInitials: indexedEntries.map((entry) => createTokenInitials((entry.label ?? '').toLowerCase())),
			compactKeys: indexedEntries.map((entry) => compactSemanticKey(entry.id)),
			compactLabels: indexedEntries.map((entry) => compactSemanticKey(entry.label ?? '')),
			compactDetails: indexedEntries.map((entry) => compactSemanticKey(entry.detail ?? '')),
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
		if (capability === 'items') {
			return querySmartItemPrefix(cache, prefix, limit);
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

function querySmartItemPrefix(cache: CapabilityCache, prefix: string, limit: number): SemanticEntry[] {
	const lowered = prefix.toLowerCase();
	const compactPrefix = compactSemanticKey(prefix);
	const matches: Array<{ entry: SemanticEntry; score: number; index: number }> = [];
	for (let index = 0; index < cache.entries.length; index++) {
		const score = resolveItemMatchScore(cache, index, lowered, compactPrefix);
		if (score === undefined) {
			continue;
		}
		matches.push({
			entry: cache.entries[index],
			score,
			index
		});
	}
	matches.sort((left, right) => {
		if (left.score !== right.score) {
			return left.score - right.score;
		}
		return left.index - right.index;
	});
	return matches.slice(0, limit).map((match) => match.entry);
}

function resolveItemMatchScore(
	cache: CapabilityCache,
	index: number,
	loweredPrefix: string,
	compactPrefix: string
): number | undefined {
	const key = cache.keys[index];
	const namespace = cache.namespaces[index];
	const label = cache.labels[index];
	const detail = cache.details[index];
	const pathKey = cache.pathKeys[index];
	const tokenInitials = cache.tokenInitials[index];
	const labelInitials = cache.labelInitials[index];
	const shortPrefix = isShortItemPrefix(loweredPrefix);
	if (label === loweredPrefix) {
		return 0;
	}
	if (key === loweredPrefix || detail === loweredPrefix) {
		return 1;
	}
	if (namespace.startsWith(loweredPrefix) && shortPrefix) {
		return 2;
	}
	if (label.startsWith(loweredPrefix)) {
		return 3;
	}
	if (matchesTokenPrefix(label, loweredPrefix)) {
		return 4;
	}
	if (key.startsWith(loweredPrefix)) {
		return 5;
	}
	if (pathKey.startsWith(loweredPrefix)) {
		return 6;
	}
	if (matchesTokenPrefix(key, loweredPrefix) || matchesTokenPrefix(pathKey, loweredPrefix)) {
		return 7;
	}
	if (detail.startsWith(loweredPrefix)) {
		return 8;
	}
	if (compactPrefix.length === 0) {
		return undefined;
	}
	if (labelInitials.startsWith(compactPrefix) && compactPrefix.length >= 2) {
		return 9;
	}
	if (tokenInitials.startsWith(compactPrefix) && compactPrefix.length >= 2) {
		return 10;
	}
	if (cache.compactLabels[index].startsWith(compactPrefix)) {
		return 11;
	}
	if (cache.compactPathKeys[index].startsWith(compactPrefix)) {
		return 12;
	}
	if (cache.compactKeys[index].startsWith(compactPrefix)) {
		return 13;
	}
	if (cache.compactDetails[index].startsWith(compactPrefix)) {
		return 14;
	}
	return undefined;
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

function extractSemanticPathKey(value: string): string {
	const lowered = value.toLowerCase();
	const separator = lowered.indexOf(':');
	return separator >= 0 ? lowered.slice(separator + 1) : lowered;
}

function extractSemanticNamespaceKey(value: string): string {
	const lowered = value.toLowerCase();
	const separator = lowered.indexOf(':');
	return separator >= 0 ? lowered.slice(0, separator) : lowered;
}

function compactSemanticKey(value: string): string {
	return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function matchesTokenPrefix(value: string, prefix: string): boolean {
	return value.split(/[^a-z0-9]+/).some((token) => token.length > 0 && token.startsWith(prefix));
}

function isShortItemPrefix(prefix: string): boolean {
	return prefix.length > 0 && prefix.length <= 4 && !prefix.includes(':');
}

function createTokenInitials(value: string): string {
	return value
		.split(/[^a-z0-9]+/)
		.filter((token) => token.length > 0)
		.map((token) => token[0])
		.join('');
}
