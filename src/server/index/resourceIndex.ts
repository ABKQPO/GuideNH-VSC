export interface GuideNhIndexedResource {
	uri: string;
	relativePath: string;
}

export class GuideNhResourceIndex {
	private readonly resources = new Map<string, GuideNhIndexedResource>();
	private readonly resourceUriByRelativePath = new Map<string, string>();
	private sortedResources: GuideNhIndexedResource[] = [];
	private sortedKeys: string[] = [];
	private dirty = true;

	updateResource(uri: string): void {
		const relativePath = resolveGuideNhResourceRelativePath(uri);
		if (!relativePath) {
			return;
		}
		this.resources.set(uri, { uri, relativePath });
		this.resourceUriByRelativePath.set(relativePath, uri);
		this.dirty = true;
	}

	removeResource(uri: string): void {
		const resource = this.resources.get(uri);
		if (!resource) {
			return;
		}
		this.resources.delete(uri);
		this.resourceUriByRelativePath.delete(resource.relativePath);
		this.dirty = true;
	}

	findResourceByRelativePath(relativePath: string): GuideNhIndexedResource | undefined {
		const normalized = normalizeResourcePrefix(relativePath);
		const uri = this.resourceUriByRelativePath.get(normalized);
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

function resolveGuideNhResourceRelativePath(uri: string): string | undefined {
	const normalized = uri.replace(/\\/g, '/');
	const match = normalized.match(/\/guidenh\/(?:guidenh\/)?_[a-z]{2}_[a-z]{2}\/(.+)$/i);
	return match ? decodeURIComponent(match[1]) : undefined;
}

function normalizeResourcePrefix(prefix: string): string {
	return prefix.replace(/^\.\//, '').replace(/^\//, '');
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
