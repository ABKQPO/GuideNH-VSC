import { SemanticEntry } from '../../common/protocol';

interface CapabilityCache {
	version: number;
	stale: boolean;
	entries: SemanticEntry[];
}

export class SemanticCache {
	private readonly capabilities = new Map<string, CapabilityCache>();

	replace(capability: string, version: number, entries: SemanticEntry[]): void {
		this.capabilities.set(capability, { version, entries, stale: false });
	}

	getVersion(capability: string): number {
		return this.capabilities.get(capability)?.version ?? 0;
	}

	queryPrefix(capability: string, prefix: string): SemanticEntry[] {
		const lowered = prefix.toLowerCase();
		return (this.capabilities.get(capability)?.entries ?? []).filter((entry) => entry.id.toLowerCase().startsWith(lowered));
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
