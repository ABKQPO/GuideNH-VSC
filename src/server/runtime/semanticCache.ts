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
			tokenInitials: indexedEntries.map((entry) => createTokenInitials(extractRawSemanticPath(entry.id))),
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
	const familySizes = buildFamilySizes(cache.entries);
	const matches: Array<{
		entry: SemanticEntry;
		score: number;
		index: number;
		pathLength: number;
		structuredSpecificity: number;
		familySize: number;
	}> = [];
	for (let index = 0; index < cache.entries.length; index++) {
		const score = resolveItemMatchScore(cache, index, lowered, compactPrefix);
		if (score === undefined) {
			continue;
		}
		matches.push({
			entry: cache.entries[index],
			score,
			index,
			pathLength: cache.pathKeys[index].length,
			structuredSpecificity: computeStructuredMatchSpecificity(extractRawSemanticPath(cache.entries[index].id), compactPrefix, score),
			familySize: resolveFamilySize(familySizes, cache.entries[index].id)
		});
	}
	matches.sort((left, right) => {
		if (left.score !== right.score) {
			return left.score - right.score;
		}
		if (prefersLargerFamilyForScore(left.score) && left.familySize !== right.familySize) {
			return right.familySize - left.familySize;
		}
		if (prefersHigherStructuredSpecificityForScore(left.score)
			&& left.structuredSpecificity !== right.structuredSpecificity) {
			return right.structuredSpecificity - left.structuredSpecificity;
		}
		if (prefersShorterPathForScore(left.score) && left.pathLength !== right.pathLength) {
			return left.pathLength - right.pathLength;
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
	const rawPath = extractRawSemanticPath(cache.entries[index].id);
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
	if (matchesStructuredPathAbbreviation(rawPath, compactPrefix) && compactPrefix.length >= 2) {
		return 9;
	}
	if (compactPrefix.length === 0) {
		return undefined;
	}
	if (tokenInitials.startsWith(compactPrefix) && compactPrefix.length >= 2) {
		return 10;
	}
	if (cache.compactKeys[index].startsWith(compactPrefix)) {
		return 11;
	}
	if (cache.compactPathKeys[index].startsWith(compactPrefix)) {
		return 12;
	}
	if (labelInitials.startsWith(compactPrefix) && compactPrefix.length >= 2) {
		return 13;
	}
	if (cache.compactLabels[index].startsWith(compactPrefix)) {
		return 14;
	}
	if (cache.compactDetails[index].startsWith(compactPrefix)) {
		return 15;
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

function extractRawSemanticPath(value: string): string {
	const separator = value.indexOf(':');
	return separator >= 0 ? value.slice(separator + 1) : value;
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
	return splitSearchTokens(value)
		.map((token) => token[0])
		.join('');
}

function matchesStructuredPathAbbreviation(path: string, compactPrefix: string): boolean {
	if (compactPrefix.length < 2) {
		return false;
	}
	const tokens = splitSearchTokens(path);
	if (tokens.length < 2) {
		return false;
	}
	const firstToken = tokens[0];
	if (!compactPrefix.startsWith(firstToken) || compactPrefix.length <= firstToken.length) {
		return false;
	}
	let queryIndex = firstToken.length;
	for (let tokenIndex = 1; tokenIndex < tokens.length && queryIndex < compactPrefix.length; tokenIndex++) {
		if (!tokens[tokenIndex].startsWith(compactPrefix[queryIndex])) {
			return false;
		}
		queryIndex++;
	}
	return queryIndex === compactPrefix.length;
}

function prefersShorterPathForScore(score: number): boolean {
	return score === 9 || score === 10 || score === 11 || score === 12;
}

function prefersHigherStructuredSpecificityForScore(score: number): boolean {
	return score === 9;
}

function prefersLargerFamilyForScore(score: number): boolean {
	return score === 9;
}

function computeStructuredMatchSpecificity(path: string, compactPrefix: string, score: number): number {
	if (score !== 9 || compactPrefix.length < 2) {
		return 0;
	}
	const tokens = splitSearchTokens(path);
	if (tokens.length < 2) {
		return 0;
	}
	const firstToken = tokens[0];
	if (!compactPrefix.startsWith(firstToken) || compactPrefix.length <= firstToken.length) {
		return 0;
	}
	let queryIndex = firstToken.length;
	let specificity = firstToken.length;
	for (let tokenIndex = 1; tokenIndex < tokens.length && queryIndex < compactPrefix.length; tokenIndex++) {
		if (!tokens[tokenIndex].startsWith(compactPrefix[queryIndex])) {
			return 0;
		}
		specificity += tokens[tokenIndex].length;
		queryIndex++;
	}
	return queryIndex === compactPrefix.length ? specificity : 0;
}

function buildFamilySizes(entries: SemanticEntry[]): Map<string, number> {
	const familySizes = new Map<string, number>();
	for (const entry of entries) {
		const familyKey = toFamilyKey(entry.id);
		familySizes.set(familyKey, (familySizes.get(familyKey) ?? 0) + 1);
	}
	return familySizes;
}

function resolveFamilySize(familySizes: Map<string, number>, id: string): number {
	return familySizes.get(toFamilyKey(id)) ?? 0;
}

function toFamilyKey(id: string): string {
	const separator = id.indexOf(':');
	const namespace = separator >= 0 ? id.slice(0, separator + 1).toLowerCase() : '';
	let rawPath = extractRawSemanticPath(id);
	const metaSeparator = rawPath.lastIndexOf(':');
	if (metaSeparator >= 0) {
		const trailing = rawPath.slice(metaSeparator + 1);
		if (/^[0-9]+$/.test(trailing)) {
			rawPath = rawPath.slice(0, metaSeparator);
		}
	}
	return namespace + rawPath.toLowerCase();
}

function splitSearchTokens(value: string): string[] {
	const tokens: string[] = [];
	let current = '';
	for (let index = 0; index < value.length; index++) {
		const currentChar = value[index];
		if (!/[a-z0-9]/i.test(currentChar)) {
			flushToken(tokens, current);
			current = '';
			continue;
		}
		const nextChar = index + 1 < value.length ? value[index + 1] : '';
		if (shouldSplitToken(current, currentChar, nextChar)) {
			flushToken(tokens, current);
			current = '';
		}
		current += currentChar.toLowerCase();
	}
	flushToken(tokens, current);
	return tokens;
}

function shouldSplitToken(current: string, currentChar: string, nextChar: string): boolean {
	if (current.length === 0) {
		return false;
	}
	const previousChar = current[current.length - 1];
	const previousIsDigit = /[0-9]/.test(previousChar);
	const currentIsDigit = /[0-9]/.test(currentChar);
	if (previousIsDigit !== currentIsDigit) {
		return true;
	}
	if (/[a-z]/.test(previousChar) && /[A-Z]/.test(currentChar)) {
		return true;
	}
	return /[A-Z]/.test(previousChar) && /[A-Z]/.test(currentChar) && /[a-z]/.test(nextChar);
}

function flushToken(tokens: string[], token: string): void {
	if (token.length > 0) {
		tokens.push(token);
	}
}
