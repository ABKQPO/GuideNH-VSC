import { matchesTagName } from '../schema/schemaLookup';

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
	{ tagName: 'ImportStructureLib', attributeName: 'controller', capability: 'structurelib' },
	{ tagName: 'SubPages', attributeName: 'id', capability: 'pages' }
];

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
