import { findOpenTagAttributeValue } from '../parser/documentModel';
import { matchesTagName } from '../schema/schemaLookup';
import { resolveRuntimeAttributeSource } from './runtimeAttributeSources';

const DynamicHoverCapabilities = new Set(['sounds', 'keybinds', 'commands', 'recipes', 'quests', 'pages']);

export interface DynamicHoverRequest {
	capability: string;
	prefix: string;
	filters: Record<string, string>;
}

export function resolveDynamicHoverRequest(
	text: string,
	offset: number,
	tagName: string | undefined,
	attributeName: string | undefined,
	attributeValue: string | undefined
): DynamicHoverRequest | undefined {
	if (!tagName || !attributeName || !attributeValue) {
		return undefined;
	}
	if (matchesTagName(tagName, 'ImportStructureLib') && attributeName === 'channel') {
		const controller = findOpenTagAttributeValue(text, offset, 'controller');
		if (!controller) {
			return undefined;
		}
		return {
			capability: 'structurelib',
			prefix: attributeValue,
			filters: {
				attribute: 'channel',
				controller
			}
		};
	}
	if (matchesTagName(tagName, 'ImportStructureLib') && isStructureLibOrientationAttribute(attributeName)) {
		const controller = findOpenTagAttributeValue(text, offset, 'controller');
		if (!controller) {
			return undefined;
		}
		const filters: Record<string, string> = {
			attribute: attributeName,
			controller
		};
		for (const siblingAttributeName of ['facing', 'rotation', 'flip']) {
			if (siblingAttributeName === attributeName) {
				continue;
			}
			const siblingValue = findOpenTagAttributeValue(text, offset, siblingAttributeName);
			if (siblingValue) {
				filters[siblingAttributeName] = siblingValue;
			}
		}
		return {
			capability: 'structurelib',
			prefix: attributeValue,
			filters
		};
	}
	const source = resolveRuntimeAttributeSource(tagName, attributeName);
	if (!source || !DynamicHoverCapabilities.has(source.capability)) {
		return undefined;
	}
	return {
		capability: source.capability,
		prefix: attributeValue,
		filters: {}
	};
}

function isStructureLibOrientationAttribute(attributeName: string): boolean {
	return attributeName === 'facing' || attributeName === 'rotation' || attributeName === 'flip';
}
