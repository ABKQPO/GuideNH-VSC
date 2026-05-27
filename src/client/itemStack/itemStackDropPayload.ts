export interface ItemStackDropPayload {
	id: string;
	source: 'picker-apply' | 'picker-entry' | 'picker-preview';
}

export const GuideNhItemStackDropMime = 'application/vnd.guidenh.itemstack+json';

export function createItemStackDropPayload(id: string, source: ItemStackDropPayload['source']): string {
	return JSON.stringify({
		id,
		source
	} satisfies ItemStackDropPayload);
}

export function parseItemStackDropPayload(value: string): ItemStackDropPayload | undefined {
	try {
		const payload = JSON.parse(value) as Partial<ItemStackDropPayload>;
		if (typeof payload.id !== 'string' || payload.id.length === 0) {
			return undefined;
		}
		if (payload.source !== 'picker-apply' && payload.source !== 'picker-entry' && payload.source !== 'picker-preview') {
			return undefined;
		}
		return {
			id: payload.id,
			source: payload.source
		};
	} catch {
		return undefined;
	}
}
