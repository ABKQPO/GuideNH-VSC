import { findOpenTagAttributeValue } from '../parser/documentModel';
import { GuideNhAttributeSchema } from '../../common/schema';
import { matchesTagName } from '../schema/schemaLookup';
import { resolveRuntimeCapability, resolveRuntimeAttributeSource } from './runtimeAttributeSources';

const DynamicHoverCapabilities = new Set([
	'items',
	'ores',
	'categories',
	'mods',
	'sounds',
	'keybinds',
	'commands',
	'recipes',
	'quests',
	'pages',
	'entities'
]);

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
	attributeValue: string | undefined,
	attribute?: GuideNhAttributeSchema
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
	const capability = source?.capability ?? resolveRuntimeCapability(tagName, attributeName, attribute);
	if (!capability || !DynamicHoverCapabilities.has(capability)) {
		return undefined;
	}
	return {
		capability,
		prefix: attributeValue,
		filters: {}
	};
}

function isStructureLibOrientationAttribute(attributeName: string): boolean {
	return attributeName === 'facing' || attributeName === 'rotation' || attributeName === 'flip';
}
