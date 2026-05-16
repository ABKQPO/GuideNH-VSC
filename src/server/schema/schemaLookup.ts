import { GuideNhAttributeSchema, GuideNhSchemaBundle, GuideNhTagSchema } from '../../common/schema';

interface CachedTagSchema {
	tag: GuideNhTagSchema;
	attributesByLowerName: Map<string, GuideNhAttributeSchema>;
}

interface CachedSchemaLookup {
	tags: GuideNhTagSchema[];
	tagsByLowerName: Map<string, CachedTagSchema>;
}

const SchemaLookupCache = new WeakMap<GuideNhSchemaBundle, CachedSchemaLookup>();

export function findTagSchema(schema: GuideNhSchemaBundle, tagName: string | undefined): GuideNhTagSchema | undefined {
	if (!tagName) {
		return undefined;
	}
	return getCachedSchemaLookup(schema).tagsByLowerName.get(tagName.toLowerCase())?.tag;
}

export function findAttributeSchema(
	schema: GuideNhSchemaBundle,
	tagName: string | undefined,
	attributeName: string | undefined
): GuideNhAttributeSchema | undefined {
	if (!attributeName) {
		return undefined;
	}
	const cachedTag = tagName ? getCachedSchemaLookup(schema).tagsByLowerName.get(tagName.toLowerCase()) : undefined;
	if (!cachedTag) {
		return undefined;
	}
	return cachedTag.attributesByLowerName.get(attributeName.toLowerCase());
}

export function isChildTagAllowed(
	schema: GuideNhSchemaBundle,
	parentTagName: string | undefined,
	childTagName: string
): boolean {
	if (!parentTagName) {
		return true;
	}
	const parentTag = findTagSchema(schema, parentTagName);
	if (!parentTag || parentTag.children.length === 0) {
		return true;
	}
	const normalizedChildName = childTagName.toLowerCase();
	return parentTag.children.some((allowed) => allowed.toLowerCase() === normalizedChildName);
}

export function matchesTagName(left: string | undefined, right: string | undefined): boolean {
	if (!left || !right) {
		return false;
	}
	return left.toLowerCase() === right.toLowerCase();
}

export function hasAttributeValue(
	attributes: Record<string, string | true>,
	attributeName: string
): boolean {
	const normalizedAttributeName = attributeName.toLowerCase();
	return Object.keys(attributes).some((name) => name.toLowerCase() === normalizedAttributeName);
}

export function listTagSchemas(schema: GuideNhSchemaBundle): GuideNhTagSchema[] {
	return getCachedSchemaLookup(schema).tags;
}

function getCachedSchemaLookup(schema: GuideNhSchemaBundle): CachedSchemaLookup {
	const cached = SchemaLookupCache.get(schema);
	if (cached) {
		return cached;
	}
	const tags = Object.values(schema.tags.tags);
	const tagsByLowerName = new Map<string, CachedTagSchema>();
	for (const tag of tags) {
		tagsByLowerName.set(tag.name.toLowerCase(), {
			tag,
			attributesByLowerName: new Map(
				Object.entries(tag.attributes).map(([name, attribute]) => [name.toLowerCase(), attribute])
			)
		});
	}
	const lookup = {
		tags,
		tagsByLowerName
	};
	SchemaLookupCache.set(schema, lookup);
	return lookup;
}
