import { GuideNhAttributeSchema, GuideNhSchemaBundle, GuideNhTagSchema } from '../../common/schema';

export function findTagSchema(schema: GuideNhSchemaBundle, tagName: string | undefined): GuideNhTagSchema | undefined {
	if (!tagName) {
		return undefined;
	}
	const normalizedTagName = tagName.toLowerCase();
	return Object.values(schema.tags.tags).find((tag) => tag.name.toLowerCase() === normalizedTagName);
}

export function findAttributeSchema(
	schema: GuideNhSchemaBundle,
	tagName: string | undefined,
	attributeName: string | undefined
): GuideNhAttributeSchema | undefined {
	if (!attributeName) {
		return undefined;
	}
	const tag = findTagSchema(schema, tagName);
	if (!tag) {
		return undefined;
	}
	return Object.entries(tag.attributes)
		.find(([name]) => name.toLowerCase() === attributeName.toLowerCase())?.[1];
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

