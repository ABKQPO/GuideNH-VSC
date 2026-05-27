import { matchesTagName } from '../schema/schemaLookup';
import { GuideNhAttributeSchema } from '../../common/schema';

export interface RuntimeAttributeSource {
	tagName?: string;
	attributeName: string;
	capability: string;
}

const RuntimeAttributeSources: RuntimeAttributeSource[] = [
	{ tagName: 'ItemLink', attributeName: 'id', capability: 'items' },
	{ tagName: 'ItemLink', attributeName: 'ore', capability: 'ores' },
	{ tagName: 'ItemImage', attributeName: 'id', capability: 'items' },
	{ tagName: 'ItemImage', attributeName: 'ore', capability: 'ores' },
	{ tagName: 'BlockImage', attributeName: 'id', capability: 'items' },
	{ tagName: 'BlockImage', attributeName: 'ore', capability: 'ores' },
	{ tagName: 'Block', attributeName: 'id', capability: 'items' },
	{ tagName: 'Block', attributeName: 'ore', capability: 'ores' },
	{ tagName: 'PlaceBlock', attributeName: 'id', capability: 'items' },
	{ tagName: 'RemoveBlocks', attributeName: 'id', capability: 'items' },
	{ tagName: 'ReplaceBlock', attributeName: 'from', capability: 'items' },
	{ tagName: 'ReplaceBlock', attributeName: 'to', capability: 'items' },
	{ tagName: 'Recipe', attributeName: 'id', capability: 'recipes' },
	{ tagName: 'RecipeFor', attributeName: 'id', capability: 'recipes' },
	{ tagName: 'RecipeUsage', attributeName: 'id', capability: 'recipes' },
	{ tagName: 'RecipesFor', attributeName: 'id', capability: 'recipes' },
	{ tagName: 'QuestCard', attributeName: 'id', capability: 'quests' },
	{ tagName: 'QuestLink', attributeName: 'id', capability: 'quests' },
	{ tagName: 'KeyBind', attributeName: 'id', capability: 'keybinds' },
	{ tagName: 'KeyBind', attributeName: 'action', capability: 'keybinds' },
	{ tagName: 'CommandLink', attributeName: 'command', capability: 'commands' },
	{ tagName: 'PlaySound', attributeName: 'sound', capability: 'sounds' },
	{ tagName: 'SoundLink', attributeName: 'sound', capability: 'sounds' },
	{ tagName: 'Entity', attributeName: 'id', capability: 'entities' },
	{ tagName: 'ImportStructureLib', attributeName: 'controller', capability: 'structurelib' },
	{ tagName: 'SubPages', attributeName: 'id', capability: 'pages' }
];

const FrontmatterRuntimeCapabilities = new Map<string, string>([
	['item_ids', 'items'],
	['ore_ids', 'ores'],
	['quest_ids', 'quests'],
	['categories', 'categories'],
	['navigation.parent', 'pages'],
	['navigation.required_mods', 'mods'],
	['navigation.icon', 'items'],
	['navigation.icons', 'items']
]);

const RuntimeAttributeTypeCapabilities = new Map<GuideNhAttributeSchema['type'], string>([
	['item', 'items'],
	['ore', 'ores'],
	['page', 'pages']
]);

export function resolveRuntimeAttributeSource(
	tagName: string | undefined,
	attributeName: string
): RuntimeAttributeSource | undefined {
	return RuntimeAttributeSources.find((source) => {
		return source.attributeName === attributeName
			&& (!source.tagName || matchesTagName(source.tagName, tagName));
	});
}

export function isStructureLibOrientationAttribute(attributeName: string): boolean {
	return attributeName === 'facing' || attributeName === 'rotation' || attributeName === 'flip';
}

export function resolveFrontmatterRuntimeCapability(path: string): string | undefined {
	return FrontmatterRuntimeCapabilities.get(path);
}

export function resolveRuntimeCapability(
	tagName: string | undefined,
	attributeName: string,
	attribute: GuideNhAttributeSchema | undefined
): string | undefined {
	const explicitSource = resolveRuntimeAttributeSource(tagName, attributeName);
	if (explicitSource) {
		return explicitSource.capability;
	}
	if (!attribute) {
		return undefined;
	}
	return RuntimeAttributeTypeCapabilities.get(attribute.type);
}
