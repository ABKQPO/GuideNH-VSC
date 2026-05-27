export interface SerializedMinecraftTooltipLine {
	html: string;
	plain: string;
}

interface MinecraftTextStyle {
	color?: string;
	bold: boolean;
	italic: boolean;
	underline: boolean;
	strikethrough: boolean;
}

const MinecraftColorMap: Record<string, string> = {
	'0': '#000000',
	'1': '#0000aa',
	'2': '#00aa00',
	'3': '#00aaaa',
	'4': '#aa0000',
	'5': '#aa00aa',
	'6': '#ffaa00',
	'7': '#aaaaaa',
	'8': '#555555',
	'9': '#5555ff',
	a: '#55ff55',
	b: '#55ffff',
	c: '#ff5555',
	d: '#ff55ff',
	e: '#ffff55',
	f: '#ffffff'
};

export function stripMinecraftFormatting(value: string | undefined): string {
	if (!value) {
		return '';
	}
	let result = '';
	for (let index = 0; index < value.length; index++) {
		const current = value[index];
		if (current === '\u00a7' && index + 1 < value.length) {
			index++;
			continue;
		}
		result += current;
	}
	return result;
}

export function renderMinecraftFormattingHtml(value: string | undefined): string {
	if (!value) {
		return '';
	}
	let html = '';
	let buffer = '';
	let style = createDefaultStyle();
	for (let index = 0; index < value.length; index++) {
		const current = value[index];
		if (current === '\u00a7' && index + 1 < value.length) {
			html += renderStyledHtml(buffer, style);
			buffer = '';
			style = applyMinecraftFormatCode(style, value[index + 1]);
			index++;
			continue;
		}
		buffer += current;
	}
	html += renderStyledHtml(buffer, style);
	return html.length > 0 ? html : escapeHtml(value);
}

export function serializeMinecraftTooltipLines(lines: string[]): SerializedMinecraftTooltipLine[] {
	return lines.map((line) => ({
		html: renderMinecraftFormattingHtml(line),
		plain: stripMinecraftFormatting(line)
	}));
}

function createDefaultStyle(): MinecraftTextStyle {
	return {
		bold: false,
		italic: false,
		underline: false,
		strikethrough: false
	};
}

function applyMinecraftFormatCode(style: MinecraftTextStyle, code: string): MinecraftTextStyle {
	const normalizedCode = code.toLowerCase();
	const color = MinecraftColorMap[normalizedCode];
	if (color) {
		return {
			color,
			bold: false,
			italic: false,
			underline: false,
			strikethrough: false
		};
	}
	switch (normalizedCode) {
		case 'l':
			return { ...style, bold: true };
		case 'm':
			return { ...style, strikethrough: true };
		case 'n':
			return { ...style, underline: true };
		case 'o':
			return { ...style, italic: true };
		case 'r':
			return createDefaultStyle();
		default:
			return style;
	}
}

function renderStyledHtml(value: string, style: MinecraftTextStyle): string {
	if (value.length === 0) {
		return '';
	}
	const cssRules: string[] = [];
	if (style.color) {
		cssRules.push(`color:${style.color}`);
	}
	if (style.bold) {
		cssRules.push('font-weight:700');
	}
	if (style.italic) {
		cssRules.push('font-style:italic');
	}
	const decorations: string[] = [];
	if (style.underline) {
		decorations.push('underline');
	}
	if (style.strikethrough) {
		decorations.push('line-through');
	}
	if (decorations.length > 0) {
		cssRules.push(`text-decoration:${decorations.join(' ')}`);
	}
	const escapedValue = escapeHtml(value).replace(/\r?\n/g, '<br/>');
	if (cssRules.length === 0) {
		return escapedValue;
	}
	return `<span style="${cssRules.join(';')}">${escapedValue}</span>`;
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}
