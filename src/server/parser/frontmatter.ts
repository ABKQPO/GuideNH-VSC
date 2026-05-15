export interface FrontmatterBlock {
	text: string;
	start: number;
	end: number;
}

export function extractFrontmatter(text: string): FrontmatterBlock | undefined {
	if (!text.startsWith('---')) {
		return undefined;
	}
	const end = text.indexOf('\n---', 3);
	if (end < 0) {
		return undefined;
	}
	const closeEnd = text.indexOf('\n', end + 4);
	const blockEnd = closeEnd < 0 ? text.length : closeEnd + 1;
	return {
		text: text.slice(0, blockEnd),
		start: 0,
		end: blockEnd
	};
}
