import { normalizeGuideNhReferencePath, resolveGuideNhResourceLocation } from './guideNhPaths';

export interface GuideNhIndexedResource {
	uri: string;
	relativePath: string;
	aliases: string[];
}

export class GuideNhResourceIndex {
	private readonly resources = new Map<string, GuideNhIndexedResource>();
	private readonly resourceUrisByAlias = new Map<string, string>();
	private sortedResources: GuideNhIndexedResource[] = [];
	private sortedKeys: string[] = [];
	private dirty = true;

	updateResource(uri: string): void {
		const location = resolveGuideNhResourceLocation(uri);
		if (!location) {
			return;
		}
		const relativePath = location.relativePath ?? location.aliases[0];
		this.resources.set(uri, { uri, relativePath, aliases: location.aliases });
		for (const alias of location.aliases) {
			this.resourceUrisByAlias.set(alias, uri);
		}
		this.dirty = true;
	}

	removeResource(uri: string): void {
		const resource = this.resources.get(uri);
		if (!resource) {
			return;
		}
		this.resources.delete(uri);
		for (const alias of resource.aliases) {
			this.resourceUrisByAlias.delete(alias);
		}
		this.dirty = true;
	}

	findResourceByRelativePath(relativePath: string): GuideNhIndexedResource | undefined {
		const normalized = normalizeResourcePrefix(relativePath);
		const uri = this.resourceUrisByAlias.get(normalized);
		return uri ? this.resources.get(uri) : undefined;
	}

	queryResourcesByPrefix(prefix: string, limit = 200): GuideNhIndexedResource[] {
		if (limit <= 0) {
			return [];
		}
		this.refreshSorted();
		const normalizedPrefix = normalizeResourcePrefix(prefix);
		const start = lowerBound(this.sortedKeys, normalizedPrefix);
		const matches: GuideNhIndexedResource[] = [];
		for (let index = start; index < this.sortedResources.length && matches.length < limit; index++) {
			const resource = this.sortedResources[index];
			if (!resource.relativePath.startsWith(normalizedPrefix)) {
				break;
			}
			matches.push(resource);
		}
		return matches;
	}

	private refreshSorted(): void {
		if (!this.dirty) {
			return;
		}
		this.sortedResources = Array.from(this.resources.values()).sort((left, right) => left.relativePath.localeCompare(right.relativePath));
		this.sortedKeys = this.sortedResources.map((resource) => resource.relativePath);
		this.dirty = false;
	}
}

function normalizeResourcePrefix(prefix: string): string {
	return normalizeGuideNhReferencePath(prefix);
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
