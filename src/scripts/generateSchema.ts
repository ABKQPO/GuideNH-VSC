import { existsSync, promises as fs } from 'fs';
import * as path from 'path';
import {
	GuideNhAttributeSchema,
	GuideNhMarkdownExtensionsFile,
	GuideNhSnippetsFile,
	GuideNhTagSchema,
	GuideNhTagsFile
} from '../common/schema';

export function extractTagNamesFromJavaSource(source: string): string[] {
	return scanJavaCompilerSource(source).tagNames;
}

export interface JavaCompilerScanResult {
	tagNames: string[];
	tags: Record<string, GuideNhTagSchema>;
}

interface JavaSourceFile {
	path: string;
	text: string;
}

interface ChartChildTagDefinition {
	name: string;
	description: string;
	attributes: Record<string, GuideNhAttributeSchema>;
	children: string[];
}

export function scanJavaCompilerSource(source: string): JavaCompilerScanResult {
	const tagNames = extractCompilerTagNames(source);
	const attributes = extractCompilerAttributes(source);
	const tags: Record<string, GuideNhTagSchema> = {};
	for (const tagName of tagNames) {
		tags[tagName] = {
			name: tagName,
			kind: inferTagKind(source),
			description: `Generated from GuideNH ${tagName} compiler source.`,
			attributes,
			children: [],
			snippets: []
		};
	}
	return { tagNames, tags };
}

export function enhanceGeneratedTagsFromJavaSources(
	tags: Record<string, GuideNhTagSchema>,
	sources: JavaSourceFile[]
): Record<string, GuideNhTagSchema> {
	const enhanced = { ...tags };
	applyChartAttributeEnhancements(enhanced, sources);
	applyChartChildTagEnhancements(enhanced, sources);
	applyContentTabsEnhancements(enhanced);
	applyDetailsEnhancements(enhanced);
	applyMermaidEnhancements(enhanced);
	applyFunctionGraphEnhancements(enhanced, sources);
	applySceneTagEnhancements(enhanced, sources);
	applyStructureLibOptionTagEnhancements(enhanced, sources);
	applyRecipeEnhancements(enhanced);
	applyContributorEnhancements(enhanced, sources);
	applyReferenceEnhancements(enhanced);
	return enhanced;
}

function extractCompilerTagNames(source: string): string[] {
	const names = new Set<string>();
	const stringConstants = extractStringConstants(source);
	const stringCollections = extractStringCollections(source, stringConstants);
	for (const match of source.matchAll(/["']([A-Z][A-Za-z0-9]*)["']\s*,\s*new\s+[A-Za-z0-9_]+Compiler/g)) {
		names.add(match[1]);
	}
	for (const body of extractGetTagNamesBodies(source)) {
		for (const name of extractQuotedStrings(body)) {
			names.add(name);
		}
		for (const name of extractResolvedTagNameConstants(body, stringConstants, stringCollections)) {
			names.add(name);
		}
	}
	return Array.from(names).sort();
}

function extractStringConstants(source: string): Map<string, string> {
	const constants = new Map<string, string>();
	const declarations = Array.from(source.matchAll(/\b(?:(?:public|private|protected|static|final)\s+)*String\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([^;]+);/g));
	let changed = true;
	while (changed) {
		changed = false;
		for (const match of declarations) {
			if (constants.has(match[1])) {
				continue;
			}
			const value = resolveStringExpression(match[2], constants);
			if (value) {
				constants.set(match[1], value);
				changed = true;
			}
		}
	}
	return constants;
}

function extractStringCollections(source: string, constants: Map<string, string>): Map<string, string[]> {
	const collections = new Map<string, string[]>();
	for (const match of source.matchAll(/\b(?:(?:public|private|protected|static|final)\s+)*(?:Set|List|Collection)\s*<\s*String\s*>\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([^;]+);/gs)) {
		collections.set(match[1], resolveStringListExpression(match[2], constants));
	}
	for (const match of source.matchAll(/\b(?:(?:public|private|protected|static|final)\s+)*String\s*\[\]\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([^;]+);/gs)) {
		collections.set(match[1], resolveStringListExpression(match[2], constants));
	}
	return collections;
}

function extractResolvedTagNameConstants(
	body: string,
	constants: Map<string, string>,
	collections: Map<string, string[]>
): string[] {
	const names = new Set<string>();
	for (const value of extractMethodReturnExpressions(body)) {
		for (const name of resolveStringListExpression(value, constants)) {
			names.add(name);
		}
		for (const name of extractResolvedStringCollections(value, collections)) {
			names.add(name);
		}
		const collection = collections.get(value.trim());
		if (collection) {
			for (const name of collection) {
				names.add(name);
			}
		}
	}
	return Array.from(names);
}

function extractResolvedStringCollections(value: string, collections: Map<string, string[]>): string[] {
	const names = new Set<string>();
	for (const identifier of value.matchAll(/\b[A-Za-z_][A-Za-z0-9_]*\b/g)) {
		const resolved = collections.get(identifier[0]);
		if (!resolved) {
			continue;
		}
		for (const name of resolved) {
			names.add(name);
		}
	}
	return Array.from(names);
}

function extractMethodReturnExpressions(body: string): string[] {
	const expressions: string[] = [];
	for (const match of body.matchAll(/\breturn\s+([^;]+);/gs)) {
		expressions.push(match[1].trim());
	}
	return expressions;
}

function resolveStringListExpression(value: string, constants: Map<string, string>): string[] {
	return [
		...extractQuotedStrings(value),
		...extractResolvedStringConstants(value, constants)
	];
}

function extractResolvedStringConstants(value: string, constants: Map<string, string>): string[] {
	const names = new Set<string>();
	for (const identifier of value.matchAll(/\b[A-Za-z_][A-Za-z0-9_]*\b/g)) {
		const resolved = constants.get(identifier[0]);
		if (resolved) {
			names.add(resolved);
		}
	}
	return Array.from(names);
}

function resolveStringExpression(value: string, constants: Map<string, string>): string | undefined {
	const parts = value.split('+').map((part) => part.trim());
	let resolved = '';
	for (const part of parts) {
		const quoted = part.match(/^"([^"]*)"$/);
		if (quoted) {
			resolved += quoted[1];
			continue;
		}
		const constant = constants.get(part);
		if (constant !== undefined) {
			resolved += constant;
			continue;
		}
		return undefined;
	}
	return resolved;
}

function extractGetTagNamesBodies(source: string): string[] {
	const bodies: string[] = [];
	const matcher = /getTagNames\s*\(\s*\)\s*\{/g;
	for (const match of source.matchAll(matcher)) {
		const openBrace = match.index === undefined ? -1 : source.indexOf('{', match.index);
		if (openBrace >= 0) {
			const closeBrace = findMatchingBrace(source, openBrace);
			if (closeBrace > openBrace) {
				bodies.push(source.slice(openBrace + 1, closeBrace));
			}
		}
	}
	return bodies;
}

function findMatchingBrace(source: string, openBrace: number): number {
	let depth = 0;
	for (let index = openBrace; index < source.length; index++) {
		const char = source[index];
		if (char === '{') {
			depth++;
		} else if (char === '}') {
			depth--;
			if (depth === 0) {
				return index;
			}
		}
	}
	return -1;
}

function extractCompilerAttributes(source: string): Record<string, GuideNhAttributeSchema> {
	const attributes: Record<string, GuideNhAttributeSchema> = {};
	for (const match of source.matchAll(/MdxAttrs\s*\.\s*([A-Za-z0-9_]+)\([^;]*?"([^"]+)"[^;]*?\)/gs)) {
		const attribute = mapMdxAttrReaderSchema(match[1]);
		if (attribute) {
			attributes[match[2]] = attribute;
		}
	}
	for (const match of source.matchAll(/MdxAttrs\s*\.\s*getRequiredItemStack(?:AndId)?\s*\([^;]*?\)/gs)) {
		attributes.id = { type: 'item', valueStyle: 'string' };
		attributes.ore = { type: 'ore', valueStyle: 'string' };
	}
	for (const attribute of extractFallbackAttributes(source)) {
		if (!attributes[attribute.name]) {
			attributes[attribute.name] = createAttributeSchema(attribute.type, attribute.reader);
		}
	}
	return sortAttributes(attributes);
}

function extractFallbackAttributes(source: string): Array<{ name: string; type: GuideNhAttributeSchema['type']; reader: string }> {
	const attributes: Array<{ name: string; type: GuideNhAttributeSchema['type']; reader: string }> = [];
	for (const match of source.matchAll(/getAttributeString\(\s*"([^"]+)"/g)) {
		attributes.push({ name: match[1], type: 'string', reader: 'getAttributeString' });
	}
	for (const match of source.matchAll(/getAttribute(?:Value)?\(\s*"([^"]+)"/g)) {
		attributes.push({ name: match[1], type: 'string', reader: 'getAttributeValue' });
	}
	for (const match of source.matchAll(/getAttributeBoolean\(\s*"([^"]+)"/g)) {
		attributes.push({ name: match[1], type: 'boolean', reader: 'getAttributeBoolean' });
	}
	for (const match of source.matchAll(/getOptionalBoolean\([^;]*?"([^"]+)"/g)) {
		attributes.push({ name: match[1], type: 'boolean', reader: 'getOptionalBoolean' });
	}
	for (const match of source.matchAll(/getAttribute(?:Int|Integer|Float|Double)\(\s*"([^"]+)"/g)) {
		attributes.push({ name: match[1], type: 'number', reader: match[0].includes('Float') || match[0].includes('Double') ? 'getAttributeFloat' : 'getAttributeInt' });
	}
	return attributes;
}

function mapMdxAttrReaderSchema(reader: string): GuideNhAttributeSchema | undefined {
	if (reader.includes('Item')) {
		return { type: 'item', valueStyle: 'string' };
	}
	if (reader.includes('Block')) {
		return { type: 'item', valueStyle: 'string' };
	}
	if (reader.includes('Ore')) {
		return { type: 'ore', valueStyle: 'string' };
	}
	if (reader.includes('Color')) {
		return { type: 'color', valueStyle: 'string' };
	}
	if (reader.includes('Vector')) {
		return { type: 'string', valueStyle: 'string' };
	}
	if (reader.includes('Resource')) {
		return { type: 'resource', valueStyle: 'string' };
	}
	if (reader.includes('Page')) {
		return { type: 'page', valueStyle: 'string' };
	}
	if (reader.includes('Boolean')) {
		return { type: 'boolean', valueStyle: 'expression' };
	}
	if (reader.includes('Int')) {
		return { type: 'number', valueStyle: 'string' };
	}
	if (reader.includes('Float') || reader.includes('Double')) {
		return { type: 'number', valueStyle: 'expression' };
	}
	if (reader.includes('Enum')) {
		return { type: 'enum', valueStyle: 'string' };
	}
	if (reader.includes('String')) {
		return { type: 'string', valueStyle: 'string' };
	}
	return undefined;
}

function createAttributeSchema(type: GuideNhAttributeSchema['type'], reader: string): GuideNhAttributeSchema {
	if (type === 'boolean') {
		return { type, valueStyle: 'expression' };
	}
	if (type === 'number' && (reader.includes('Float') || reader.includes('Double'))) {
		return { type, valueStyle: 'expression' };
	}
	return { type, valueStyle: 'string' };
}

function inferTagKind(source: string): GuideNhTagSchema['kind'] {
	if (source.includes('extends FlowTagCompiler')) {
		return 'inline';
	}
	if (source.includes('chart')) {
		return 'chart';
	}
	if (source.includes('extends BlockTagCompiler')) {
		return 'block';
	}
	return 'any';
}

function applyChartAttributeEnhancements(tags: Record<string, GuideNhTagSchema>, sources: JavaSourceFile[]): void {
	const commonChartAttributes = collectAttributesFromClass(sources, 'CommonChartAttrs');
	const axisAttributesBySource = collectChartAxisAttributesBySource(sources);
	for (const source of sources) {
		const scan = scanJavaCompilerSource(source.text);
		if (!source.text.includes('CommonChartAttrs.apply')) {
			continue;
		}
		for (const tagName of scan.tagNames) {
			mergeAttributes(tags[tagName], commonChartAttributes);
			mergeAttributes(tags[tagName], axisAttributesBySource.get(source.path) ?? {});
		}
	}
}

function applyChartChildTagEnhancements(tags: Record<string, GuideNhTagSchema>, sources: JavaSourceFile[]): void {
	const chartChildParser = findSourceByClassName(sources, 'ChartChildParser');
	if (!chartChildParser) {
		return;
	}
	for (const definition of createChartChildTagDefinitions(chartChildParser.text)) {
		const existing = tags[definition.name];
		if (existing) {
			mergeAttributes(existing, definition.attributes);
			existing.children = mergeChildren(existing.children, definition.children);
			continue;
		}
		tags[definition.name] = {
			name: definition.name,
			kind: 'chart',
			description: definition.description,
			attributes: sortAttributes(definition.attributes),
			children: definition.children,
			snippets: []
		};
	}
	applyChartParentChildren(tags);
}

function applyContentTabsEnhancements(tags: Record<string, GuideNhTagSchema>): void {
	tags.ContentTabs = {
		name: 'ContentTabs',
		kind: 'block',
		description: 'Generated from GuideNH ContentTabs compiler source.',
		attributes: sortAttributes({
			color: { type: 'color', valueStyle: 'string' },
			default: { type: 'string', valueStyle: 'string' },
			defaultIndex: { type: 'number', valueStyle: 'string' },
			icon: { type: 'string', valueStyle: 'string' },
			iconItem: { type: 'item', valueStyle: 'string' },
			iconPng: { type: 'string', valueStyle: 'string' },
			icon_item: { type: 'item', valueStyle: 'string' },
			icon_png: { type: 'string', valueStyle: 'string' },
			title: { type: 'string', valueStyle: 'string' },
			width: { type: 'number', valueStyle: 'string' },
			height: { type: 'number', valueStyle: 'string' }
		}),
		children: ['Tab'],
		snippets: []
	};
	tags.Tab = {
		name: 'Tab',
		kind: 'block',
		description: 'Generated from GuideNH ContentTabs tab child support.',
		attributes: sortAttributes({
			title: { type: 'string', valueStyle: 'string' }
		}),
		children: [],
		snippets: []
	};
}

function applySceneTagEnhancements(tags: Record<string, GuideNhTagSchema>, sources: JavaSourceFile[]): void {
	const sceneTagCompiler = findSourceByClassName(sources, 'SceneTagCompiler');
	if (!sceneTagCompiler) {
		applySceneDocumentationEnhancements(tags);
		applyStructureLibConditionEnhancements(tags);
		syncSceneAlias(tags);
		return;
	}
	applySceneChildren(tags, sceneTagCompiler.text, sources);
	applySceneBlockStatsTags(tags);
	applySceneDocumentationEnhancements(tags);
	applyStructureLibConditionEnhancements(tags);
	syncSceneAlias(tags);
}

function applyDetailsEnhancements(tags: Record<string, GuideNhTagSchema>): void {
	tags.summary = {
		name: 'summary',
		kind: 'block',
		description: 'Generated from GuideNH details summary support.',
		attributes: {},
		children: [],
		snippets: []
	};
}

function applyMermaidEnhancements(tags: Record<string, GuideNhTagSchema>): void {
	tags.NodeContent = {
		name: 'NodeContent',
		kind: 'block',
		description: 'Generated from GuideNH Mermaid rich node content support.',
		attributes: {
			id: {
				type: 'string',
				valueStyle: 'string'
			}
		},
		children: [],
		snippets: []
	};
	setChildren(tags.Mermaid, ['NodeContent']);
}

function applySceneChildren(tags: Record<string, GuideNhTagSchema>, source: string, sources: JavaSourceFile[]): void {
	const sceneChildren = mergeChildren(
		extractSceneElementNames(source),
		extractRegisteredSceneElementNames(sources)
	);
	setChildren(tags.GameScene, sceneChildren);
}

function syncSceneAlias(tags: Record<string, GuideNhTagSchema>): void {
	if (!tags.GameScene || !tags.Scene) {
		return;
	}
	tags.Scene.children = mergeChildren(tags.GameScene.children, tags.Scene.children);
}

function extractSceneElementNames(source: string): string[] {
	const names = new Set<string>();
	for (const match of source.matchAll(/"([A-Z][A-Za-z0-9]*)"\.equals\(name\)/g)) {
		if (match[1] !== 'BlockStat') {
			names.add(match[1]);
		}
	}
	for (const match of source.matchAll(/s\.add\("([A-Z][A-Za-z0-9]*)"\)/g)) {
		if (match[1] !== 'GameScene' && match[1] !== 'Scene') {
			names.add(match[1]);
		}
	}
	for (const match of source.matchAll(/Collections\.singleton\("([A-Z][A-Za-z0-9]*)"\)/g)) {
		if (match[1] !== 'GameScene' && match[1] !== 'Scene') {
			names.add(match[1]);
		}
	}
	return Array.from(names).sort((left, right) => left.localeCompare(right));
}

function extractRegisteredSceneElementNames(sources: JavaSourceFile[]): string[] {
	const defaultExtensions = findSourceByClassName(sources, 'DefaultExtensions');
	if (!defaultExtensions) {
		return [];
	}
	const classNames = new Set<string>();
	for (const match of defaultExtensions.text.matchAll(/new\s+([A-Za-z0-9_]+ElementCompiler)\s*\(\)/g)) {
		classNames.add(match[1]);
	}
	const tagNames = new Set<string>();
	for (const className of classNames) {
		const source = findSourceByClassName(sources, className);
		if (!source) {
			continue;
		}
		for (const tagName of scanJavaCompilerSource(source.text).tagNames) {
			if (tagName !== 'BlockStat' && tagName !== 'GameScene' && tagName !== 'Scene') {
				tagNames.add(tagName);
			}
		}
	}
	return Array.from(tagNames).sort((left, right) => left.localeCompare(right));
}

function applySceneBlockStatsTags(tags: Record<string, GuideNhTagSchema>): void {
	tags.BlockStats = {
		name: 'BlockStats',
		kind: 'block',
		description: 'Generated from GuideNH scene block stats configuration.',
		attributes: sortAttributes({
			buttonEnabled: { type: 'boolean', valueStyle: 'expression' },
			corner: { type: 'string', valueStyle: 'string' },
			dock: { type: 'string', valueStyle: 'string' },
			filter: { type: 'string', valueStyle: 'string' },
			filterMode: { type: 'string', valueStyle: 'string' },
			maxHeight: { type: 'number', valueStyle: 'string' },
			maxWidth: { type: 'number', valueStyle: 'string' },
			mode: { type: 'string', valueStyle: 'string' },
			showNames: { type: 'boolean', valueStyle: 'expression' },
			visible: { type: 'boolean', valueStyle: 'expression' }
		}),
		children: ['BlockStat'],
		snippets: []
	};
	tags.BlockStat = {
		name: 'BlockStat',
		kind: 'block',
		description: 'Generated from GuideNH manual block stats entry.',
		attributes: sortAttributes({
			count: { type: 'number', valueStyle: 'expression' },
			id: { type: 'item', valueStyle: 'string' },
			item: { type: 'item', valueStyle: 'string' },
			ore: { type: 'ore', valueStyle: 'string' }
		}),
		children: [],
		snippets: []
	};
	mergeAttributes(tags.PlaySound, {
		cooldown: { type: 'number', valueStyle: 'string' },
		minVolume: { type: 'number', valueStyle: 'expression' },
		pitch: { type: 'number', valueStyle: 'expression' },
		radius: { type: 'number', valueStyle: 'expression' },
		sound: { type: 'string', valueStyle: 'string' },
		src: { type: 'resource', valueStyle: 'string' },
		volume: { type: 'number', valueStyle: 'expression' },
		x: { type: 'number', valueStyle: 'expression' },
		y: { type: 'number', valueStyle: 'expression' },
		z: { type: 'number', valueStyle: 'expression' }
	});
}

function applySceneDocumentationEnhancements(tags: Record<string, GuideNhTagSchema>): void {
	mergeAttributes(tags.Block, {
		formed: {
			type: 'boolean',
			valueStyle: 'expression',
			description: 'Whether placed controller previews should be treated as formed during preview sync. Defaults to false.'
		}
	});
	mergeAttributes(tags.ImportStructure, {
		formed: {
			type: 'boolean',
			valueStyle: 'expression',
			description: 'Whether imported structure controllers should be treated as formed during preview sync. Defaults to false.'
		}
	});
	mergeAttributes(tags.ImportStructureLib, {
		formed: {
			type: 'boolean',
			valueStyle: 'expression',
			description: 'Whether imported StructureLib controllers should be treated as formed during preview sync. Defaults to false.'
		}
	});
	mergeAttributes(tags.PlaceBlock, {
		formed: {
			type: 'boolean',
			valueStyle: 'expression',
			description: 'Whether placed controllers should be treated as formed during preview sync. Defaults to false.'
		}
	});
	mergeAttributes(tags.ReplaceBlock, {
		formed: {
			type: 'boolean',
			valueStyle: 'expression',
			description: 'Whether replacement result controllers should be treated as formed during preview sync. Defaults to false.'
		}
	});
	mergeAttributes(tags.Entity, {
		baby: { type: 'boolean', valueStyle: 'expression' },
		capeRotation: { type: 'string', valueStyle: 'string' },
		headRotation: { type: 'string', valueStyle: 'string' },
		leftArmRotation: { type: 'string', valueStyle: 'string' },
		leftLegRotation: { type: 'string', valueStyle: 'string' },
		rightArmRotation: { type: 'string', valueStyle: 'string' },
		rightLegRotation: { type: 'string', valueStyle: 'string' },
		showCape: { type: 'boolean', valueStyle: 'expression' },
		showName: { type: 'boolean', valueStyle: 'expression' }
	});
	mergeAttributes(tags.LineAnnotation, {
		arrow: { type: 'string', valueStyle: 'string' },
		pointColor: { type: 'color', valueStyle: 'string' },
		points: { type: 'string', valueStyle: 'string' },
		pointSize: { type: 'number', valueStyle: 'expression' },
		showPoints: { type: 'boolean', valueStyle: 'expression' }
	});
	tags.LinePoint = {
		name: 'LinePoint',
		kind: 'any',
		description: 'Generated from GuideNH line annotation point styling support.',
		attributes: sortAttributes({
			color: { type: 'color', valueStyle: 'string' },
			index: { type: 'number', valueStyle: 'string' },
			show: { type: 'boolean', valueStyle: 'bare' },
			size: { type: 'number', valueStyle: 'expression' }
		}),
		children: [],
		snippets: []
	};
	if (tags.LineAnnotation) {
		tags.LineAnnotation.children = [];
	}
}

function applyStructureLibConditionEnhancements(tags: Record<string, GuideNhTagSchema>): void {
	const structureLibConditionAttributes = {
		showWhenChannels: { type: 'string', valueStyle: 'string' },
		showWhenStructure: { type: 'string', valueStyle: 'string' },
		showWhenTier: { type: 'string', valueStyle: 'string' }
	} satisfies Record<string, GuideNhAttributeSchema>;
	for (const tagName of [
		'BlockAnnotation',
		'BlockAnnotationTemplate',
		'BoxAnnotation',
		'DiamondAnnotation',
		'LineAnnotation',
		'PlaySound',
		'TextAnnotation'
	]) {
		mergeAttributes(tags[tagName], structureLibConditionAttributes);
	}
	mergeAttributes(tags.ImportStructureLib, {
		name: { type: 'string', valueStyle: 'string' }
	});
}

function applyStructureLibOptionTagEnhancements(tags: Record<string, GuideNhTagSchema>, sources: JavaSourceFile[]): void {
	const parser = findSourceByClassName(sources, 'StructureLibSceneOptionParser');
	if (!parser) {
		return;
	}
	const optionNames = new Set<string>();
	for (const match of parser.text.matchAll(/case\s+"([A-Z][A-Za-z0-9]*)"\s*:/g)) {
		optionNames.add(match[1]);
	}
	const definitions: Record<string, Omit<GuideNhTagSchema, 'name'>> = {
		Tier: {
			kind: 'any',
			description: 'Generated from GuideNH StructureLib tier option support.',
			attributes: {
				expr: { type: 'number', valueStyle: 'string' },
				tier: { type: 'number', valueStyle: 'string' },
				value: { type: 'number', valueStyle: 'string' }
			},
			children: [],
			snippets: []
		},
		Channel: {
			kind: 'any',
			description: 'Generated from GuideNH StructureLib channel option support.',
			attributes: {
				expr: { type: 'number', valueStyle: 'string' },
				id: { type: 'string', valueStyle: 'string' },
				name: { type: 'string', valueStyle: 'string' },
				tier: { type: 'number', valueStyle: 'string' },
				value: { type: 'number', valueStyle: 'string' }
			},
			children: [],
			snippets: []
		},
		Facing: createStructureLibTextOptionDefinition('facing'),
		Rotation: createStructureLibTextOptionDefinition('rotation'),
		Flip: createStructureLibTextOptionDefinition('flip'),
		Orientation: createStructureLibTextOptionDefinition('orientation'),
		GregTechActiveController: createStructureLibFlagOptionDefinition('GregTech active controller'),
		GtActiveController: createStructureLibFlagOptionDefinition('GregTech active controller'),
		GregTechPlaceHatches: createStructureLibFlagOptionDefinition('GregTech hatch placement'),
		GtPlaceHatches: createStructureLibFlagOptionDefinition('GregTech hatch placement')
	};
	const children: string[] = [];
	for (const name of Array.from(optionNames).sort((left, right) => left.localeCompare(right))) {
		const definition = definitions[name];
		if (!definition) {
			continue;
		}
		tags[name] = { name, ...definition, attributes: sortAttributes(definition.attributes) };
		children.push(name);
	}
	setChildren(tags.ImportStructureLib, children);
}

function createStructureLibTextOptionDefinition(option: string): Omit<GuideNhTagSchema, 'name'> {
	return {
		kind: 'any',
		description: `Generated from GuideNH StructureLib ${option} option support.`,
		attributes: {
			expr: { type: 'string', valueStyle: 'string' },
			name: { type: 'string', valueStyle: 'string' },
			value: { type: 'string', valueStyle: 'string' }
		},
		children: [],
		snippets: []
	};
}

function createStructureLibFlagOptionDefinition(option: string): Omit<GuideNhTagSchema, 'name'> {
	return {
		kind: 'any',
		description: `Generated from GuideNH ${option} option support.`,
		attributes: {},
		children: [],
		snippets: []
	};
}

function applyFunctionGraphEnhancements(tags: Record<string, GuideNhTagSchema>, sources: JavaSourceFile[]): void {
	const attrsSource = findSourceByClassName(sources, 'FunctionGraphAttrs');
	if (!attrsSource) {
		applyFallbackFunctionGraphEnhancements(tags);
	} else {
		const attributeMap = extractFunctionGraphAttributes(attrsSource.text);
		mergeAttributes(tags.FunctionGraph, attributeMap.container);
		mergeAttributes(tags.Function, attributeMap.container);
		mergeAttributes(tags.Function, attributeMap.plot);
		tags.Plot = {
			name: 'Plot',
			kind: 'block',
			description: 'Generated from GuideNH function graph plot support.',
			attributes: sortAttributes(attributeMap.plot),
			children: [],
			snippets: []
		};
	}
	// GuideNH reads `label` for all three; the general schema merge retains a historical `name` unless it is
	// removed after that merge, which applyGeneratedTagFixups does.
	setChildren(tags.FunctionGraph, ['Plot', 'Function', 'Point']);
}

function applyFallbackFunctionGraphEnhancements(tags: Record<string, GuideNhTagSchema>): void {
	const container = createFallbackFunctionGraphContainerAttributes();
	const plot = createFallbackFunctionPlotAttributes();
	mergeAttributes(tags.FunctionGraph, container);
	mergeAttributes(tags.Function, {
		...container,
		...plot
	});
	tags.Plot = {
		name: 'Plot',
		kind: 'block',
		description: 'Generated from GuideNH function graph plot support.',
		attributes: sortAttributes(plot),
		children: [],
		snippets: []
	};
	setChildren(tags.FunctionGraph, ['Plot', 'Function', 'Point']);
}

function extractFunctionGraphAttributes(source: string): {
	container: Record<string, GuideNhAttributeSchema>;
	plot: Record<string, GuideNhAttributeSchema>;
} {
	const container: Record<string, GuideNhAttributeSchema> = {};
	const plot: Record<string, GuideNhAttributeSchema> = {};
	for (const match of source.matchAll(/MdxAttrs\.getString\(compiler,\s*sink,\s*el,\s*"([^"]+)"\s*,/g)) {
		const name = match[1];
		if (isFunctionContainerAttribute(name)) {
			container[name] = { type: resolveFunctionStringAttributeType(name), valueStyle: 'string' };
		} else {
			plot[name] = { type: resolveFunctionStringAttributeType(name), valueStyle: 'string' };
		}
	}
	for (const match of source.matchAll(/MdxAttrs\.getInt\(compiler,\s*sink,\s*el,\s*"([^"]+)"\s*,/g)) {
		const name = match[1];
		container[name] = { type: 'number', valueStyle: 'string' };
	}
	for (const match of source.matchAll(/MdxAttrs\.getBoolean\(compiler,\s*sink,\s*el,\s*"([^"]+)"\s*,/g)) {
		const name = match[1];
		if (isFunctionContainerAttribute(name)) {
			container[name] = { type: 'boolean', valueStyle: 'expression' };
		} else {
			plot[name] = { type: 'boolean', valueStyle: 'expression' };
		}
	}
	return {
		container: sortAttributes({
			...createFallbackFunctionGraphContainerAttributes(),
			...container
		}),
		plot: sortAttributes({
			...createFallbackFunctionPlotAttributes(),
			...plot
		})
	};
}

function isFunctionContainerAttribute(name: string): boolean {
	return [
		'axisColor',
		'background',
		'border',
		'cornerLegend',
		'cornerLegendBackground',
		'cornerLegendHeight',
		'cornerLegendWidth',
		'domain',
		'gridColor',
		'height',
		'quadrants',
		'showAxes',
		'showGrid',
		'title',
		'width',
		'xLabel',
		'xMax',
		'xMin',
		'xRange',
		'xStep',
		'yMax',
		'yMin',
		'yLabel',
		'yRange',
		'yStep'
	].includes(name);
}

function resolveFunctionStringAttributeType(name: string): GuideNhAttributeSchema['type'] {
	return name.toLowerCase().includes('color') ? 'color' : 'string';
}

function createFallbackFunctionGraphContainerAttributes(): Record<string, GuideNhAttributeSchema> {
	return {
		axisColor: { type: 'color', valueStyle: 'string' },
		background: { type: 'color', valueStyle: 'string' },
		border: { type: 'color', valueStyle: 'string' },
		cornerLegend: { type: 'string', valueStyle: 'string' },
		cornerLegendBackground: { type: 'color', valueStyle: 'string' },
		cornerLegendHeight: { type: 'number', valueStyle: 'string' },
		cornerLegendWidth: { type: 'number', valueStyle: 'string' },
		domain: { type: 'string', valueStyle: 'string' },
		gridColor: { type: 'color', valueStyle: 'string' },
		height: { type: 'number', valueStyle: 'string' },
		quadrants: { type: 'string', valueStyle: 'string' },
		showAxes: { type: 'boolean', valueStyle: 'expression' },
		showGrid: { type: 'boolean', valueStyle: 'expression' },
		title: { type: 'string', valueStyle: 'string' },
		width: { type: 'number', valueStyle: 'string' },
		xLabel: { type: 'string', valueStyle: 'string' },
		xMax: { type: 'string', valueStyle: 'string' },
		xMin: { type: 'string', valueStyle: 'string' },
		xRange: { type: 'string', valueStyle: 'string' },
		xStep: { type: 'string', valueStyle: 'string' },
		yMax: { type: 'string', valueStyle: 'string' },
		yMin: { type: 'string', valueStyle: 'string' },
		yLabel: { type: 'string', valueStyle: 'string' },
		yRange: { type: 'string', valueStyle: 'string' },
		yStep: { type: 'string', valueStyle: 'string' }
	};
}

function createFallbackFunctionPlotAttributes(): Record<string, GuideNhAttributeSchema> {
	return {
		autoPointColor: { type: 'color', valueStyle: 'string' },
		autoPointLabel: { type: 'string', valueStyle: 'string' },
		color: { type: 'color', valueStyle: 'string' },
		domain: { type: 'string', valueStyle: 'string' },
		expr: { type: 'string', valueStyle: 'string' },
		inverse: { type: 'boolean', valueStyle: 'expression' },
		label: { type: 'string', valueStyle: 'string' },
		pointEveryX: { type: 'string', valueStyle: 'string' },
		pointEveryY: { type: 'string', valueStyle: 'string' },
		showFunction: { type: 'boolean', valueStyle: 'expression' },
		showValues: { type: 'boolean', valueStyle: 'expression' },
		tooltip: { type: 'string', valueStyle: 'string' }
	};
}

function applyRecipeEnhancements(tags: Record<string, GuideNhTagSchema>): void {
	const recipeFilterAttributes: Record<string, GuideNhAttributeSchema> = {
		input: { type: 'string', valueStyle: 'string' as const },
		output: { type: 'string', valueStyle: 'string' as const }
	};
	const blockLayoutAttributes: Record<string, GuideNhAttributeSchema> = {
		align: { type: 'string', valueStyle: 'string' },
		float: { type: 'string', valueStyle: 'string' },
		wrap: { type: 'string', valueStyle: 'string' }
	};
	for (const name of ['Recipe', 'Usage', 'RecipeFor', 'RecipeUsage', 'RecipesFor', 'RecipesUsage']) {
		mergeAttributes(tags[name], recipeFilterAttributes);
		mergeAttributes(tags[name], blockLayoutAttributes);
	}
}

function applyReferenceEnhancements(tags: Record<string, GuideNhTagSchema>): void {
	const tooltipCompatibilityAttributes: Record<string, GuideNhAttributeSchema> = {
		showTooltip: { type: 'boolean', valueStyle: 'string' },
		show_tooltip: { type: 'boolean', valueStyle: 'string' }
	};
	mergeAttributes(tags.Block, {
		ore: { type: 'ore', valueStyle: 'string' }
	});
	for (const name of ['GameScene', 'Scene']) {
		delete tags[name]?.attributes.background;
	}
	if (tags.Block?.attributes.id) {
		tags.Block.attributes.id.requiredWhenMissing = ['ore'];
	}
	mergeAttributes(tags.BlockImage, {
		ore: { type: 'ore', valueStyle: 'string' }
	});
	if (tags.BlockImage?.attributes.id) {
		tags.BlockImage.attributes.id.requiredWhenMissing = ['ore'];
	}
	if (tags.ItemImage?.attributes.id && tags.ItemImage.attributes.ore) {
		tags.ItemImage.attributes.id.requiredWhenMissing = ['ore'];
	}
	for (const name of ['BlockImage', 'Recipe', 'Column']) {
		mergeAttributes(tags[name], {
			align: { type: 'string', valueStyle: 'string' },
			wrap: { type: 'string', valueStyle: 'string' }
		});
	}
	mergeAttributes(tags.ItemImage, {
		align: { type: 'string', valueStyle: 'string' },
		nbt: { type: 'string', valueStyle: 'string' },
		noTooltip: { type: 'boolean', valueStyle: 'expression' },
		...tooltipCompatibilityAttributes,
		tooltip: { type: 'string', valueStyle: 'string' }
	});
	for (const name of ['ItemLink', 'QuestCard', 'QuestLink']) {
		mergeAttributes(tags[name], tooltipCompatibilityAttributes);
	}
	mergeAttributes(tags.br, {
		clear: {
			type: 'enum',
			valueStyle: 'string',
			values: ['none', 'left', 'right', 'all']
		}
	});
	mergeAttributes(tags.ItemLink, {
		showIcon: {
			type: 'string',
			valueStyle: 'string',
			description: 'Icon side, or a truthy value for the right side.'
		}
	});
	mergeAttributes(tags.FloatingImage, {
		alt: { type: 'string', valueStyle: 'string' },
		displayHeight: { type: 'number', valueStyle: 'string' },
		displayWidth: { type: 'number', valueStyle: 'string' },
		h: { type: 'number', valueStyle: 'string' },
		height: { type: 'number', valueStyle: 'string' },
		scaleX: { type: 'number', valueStyle: 'string' },
		scaleY: { type: 'number', valueStyle: 'string' },
		sound: { type: 'string', valueStyle: 'string' },
		soundSrc: { type: 'resource', valueStyle: 'string' },
		src: { type: 'resource', valueStyle: 'string' },
		trigger: { type: 'string', valueStyle: 'string' },
		volume: { type: 'number', valueStyle: 'expression' },
		w: { type: 'number', valueStyle: 'string' },
		wrap: { type: 'string', valueStyle: 'string' },
		width: { type: 'number', valueStyle: 'string' },
		x: { type: 'number', valueStyle: 'string' },
		y: { type: 'number', valueStyle: 'string' }
	});
	mergeAttributes(tags.SoundLink, {
		cooldown: { type: 'number', valueStyle: 'string' },
		minVolume: { type: 'number', valueStyle: 'expression' },
		pitch: { type: 'number', valueStyle: 'expression' },
		radius: { type: 'number', valueStyle: 'expression' },
		sound: { type: 'string', valueStyle: 'string' },
		src: { type: 'resource', valueStyle: 'string' },
		volume: { type: 'number', valueStyle: 'expression' },
		x: { type: 'number', valueStyle: 'expression' },
		y: { type: 'number', valueStyle: 'expression' },
		z: { type: 'number', valueStyle: 'expression' }
	});
	tags.ImageAnnotation = {
		name: 'ImageAnnotation',
		kind: 'block',
		description: 'Generated from GuideNH floating image annotation support.',
		attributes: sortAttributes({
			border: { type: 'boolean', valueStyle: 'bare' },
			borderColor: { type: 'color', valueStyle: 'string' },
			borderThickness: { type: 'number', valueStyle: 'string' },
			h: { type: 'number', valueStyle: 'string' },
			sound: { type: 'string', valueStyle: 'string' },
			src: { type: 'resource', valueStyle: 'string' },
			trigger: { type: 'string', valueStyle: 'string' },
			volume: { type: 'number', valueStyle: 'expression' },
			w: { type: 'number', valueStyle: 'string' },
			x: { type: 'number', valueStyle: 'string' },
			y: { type: 'number', valueStyle: 'string' }
		}),
		children: [],
		snippets: []
	};
	tags.SoundArea = {
		name: 'SoundArea',
		kind: 'block',
		description: 'Generated from GuideNH floating image sound area support.',
		attributes: sortAttributes({
			cooldown: { type: 'number', valueStyle: 'string' },
			h: { type: 'number', valueStyle: 'string' },
			minVolume: { type: 'number', valueStyle: 'expression' },
			pitch: { type: 'number', valueStyle: 'expression' },
			radius: { type: 'number', valueStyle: 'expression' },
			sound: { type: 'string', valueStyle: 'string' },
			src: { type: 'resource', valueStyle: 'string' },
			trigger: { type: 'string', valueStyle: 'string' },
			volume: { type: 'number', valueStyle: 'expression' },
			w: { type: 'number', valueStyle: 'string' },
			x: { type: 'number', valueStyle: 'string' },
			y: { type: 'number', valueStyle: 'string' }
		}),
		children: [],
		snippets: []
	};
	setChildren(tags.FloatingImage, ['ImageAnnotation', 'SoundArea']);
}

function collectAttributesFromClass(sources: JavaSourceFile[], className: string): Record<string, GuideNhAttributeSchema> {
	const source = findSourceByClassName(sources, className);
	return source ? extractCompilerAttributes(source.text) : {};
}

function collectChartAxisAttributesBySource(sources: JavaSourceFile[]): Map<string, Record<string, GuideNhAttributeSchema>> {
	const result = new Map<string, Record<string, GuideNhAttributeSchema>>();
	for (const source of sources) {
		const attributes: Record<string, GuideNhAttributeSchema> = {};
		for (const call of source.text.matchAll(/parseAxisOptions\([^;]*?"([^"]+)"\s*,\s*"([^"]+)"\s*,\s*"([^"]+)"/gs)) {
			Object.assign(attributes, createAxisAttributes(call[1], call[2], call[3]));
		}
		if (Object.keys(attributes).length > 0) {
			result.set(source.path, sortAttributes(attributes));
		}
	}
	return result;
}

function createAxisAttributes(prefix: string, gridFlagAttr: string, gridColorAttr: string): Record<string, GuideNhAttributeSchema> {
	return {
		[`${prefix}Label`]: { type: 'string', valueStyle: 'string' },
		[`${prefix}Min`]: { type: 'number', valueStyle: 'expression' },
		[`${prefix}Max`]: { type: 'number', valueStyle: 'expression' },
		[`${prefix}Step`]: { type: 'number', valueStyle: 'expression' },
		[`${prefix}Unit`]: { type: 'string', valueStyle: 'string' },
		[`${prefix}TickFormat`]: { type: 'string', valueStyle: 'string' },
		[gridFlagAttr]: { type: 'boolean', valueStyle: 'expression' },
		[gridColorAttr]: { type: 'string', valueStyle: 'string' }
	};
}

function createChartChildTagDefinitions(source: string): ChartChildTagDefinition[] {
	const definitions: ChartChildTagDefinition[] = [];
	if (source.includes('"Series"')) {
		definitions.push({
			name: 'Series',
			description: 'Generated from GuideNH Series chart child parser source.',
			attributes: {
				color: { type: 'string', valueStyle: 'string' },
				data: { type: 'string', valueStyle: 'string' },
				icon: { type: 'string', valueStyle: 'string' },
				iconImage: { type: 'string', valueStyle: 'string' },
				name: { type: 'string', valueStyle: 'string' },
				points: { type: 'string', valueStyle: 'string' },
				tooltip: { type: 'string', valueStyle: 'string' }
			},
			children: ['Point']
		});
	}
	if (source.includes('"LineSeries"')) {
		definitions.push({
			name: 'LineSeries',
			description: 'Generated from GuideNH LineSeries chart child parser source.',
			attributes: {
				color: { type: 'string', valueStyle: 'string' },
				data: { type: 'string', valueStyle: 'string' },
				icon: { type: 'string', valueStyle: 'string' },
				iconImage: { type: 'string', valueStyle: 'string' },
				name: { type: 'string', valueStyle: 'string' },
				tooltip: { type: 'string', valueStyle: 'string' }
			},
			children: []
		});
	}
	if (source.includes('"Slice"')) {
		definitions.push({
			name: 'Slice',
			description: 'Generated from GuideNH Slice chart child parser source.',
			attributes: {
				color: { type: 'string', valueStyle: 'string' },
				icon: { type: 'string', valueStyle: 'string' },
				iconImage: { type: 'string', valueStyle: 'string' },
				label: { type: 'string', valueStyle: 'string' },
				name: { type: 'string', valueStyle: 'string' },
				tooltip: { type: 'string', valueStyle: 'string' },
				value: { type: 'number', valueStyle: 'expression' }
			},
			children: []
		});
	}
	if (source.includes('"PieInset"')) {
		definitions.push({
			name: 'PieInset',
			description: 'Generated from GuideNH PieInset chart child parser source.',
			attributes: {
				direction: { type: 'string', valueStyle: 'string' },
				height: { type: 'number', valueStyle: 'expression' },
				position: { type: 'string', valueStyle: 'string' },
				size: { type: 'number', valueStyle: 'expression' },
				startAngleDeg: { type: 'number', valueStyle: 'expression' },
				title: { type: 'string', valueStyle: 'string' },
				titleColor: { type: 'string', valueStyle: 'string' },
				width: { type: 'number', valueStyle: 'expression' }
			},
			children: ['Slice']
		});
	}
	definitions.push({
		name: 'Point',
		description: 'Generated from GuideNH point child parser source.',
		attributes: {
			atX: { type: 'number', valueStyle: 'expression' },
			atY: { type: 'number', valueStyle: 'expression' },
			color: { type: 'string', valueStyle: 'string' },
			label: { type: 'string', valueStyle: 'string' },
			plot: { type: 'number', valueStyle: 'expression' },
			x: { type: 'number', valueStyle: 'expression' },
			y: { type: 'number', valueStyle: 'expression' }
		},
		children: []
	});
	return definitions;
}

function applyChartParentChildren(tags: Record<string, GuideNhTagSchema>): void {
	for (const name of ['ColumnChart', 'BarChart']) {
		setChildren(tags[name], ['Series', 'LineSeries', 'PieInset']);
	}
	for (const name of ['LineChart', 'ScatterChart']) {
		setChildren(tags[name], ['Series']);
	}
	setChildren(tags.PieChart, ['Slice']);
	setChildren(tags.FunctionGraph, ['Plot', 'Function', 'Point']);
}

function setChildren(tag: GuideNhTagSchema | undefined, children: string[]): void {
	if (!tag) {
		return;
	}
	tag.children = mergeChildren(tag.children, children);
}

function mergeChildren(existing: string[], incoming: string[]): string[] {
	return Array.from(new Set([...existing, ...incoming])).sort((left, right) => left.localeCompare(right));
}

function findSourceByClassName(sources: JavaSourceFile[], className: string): JavaSourceFile | undefined {
	return sources.find((source) => {
		return source.path.replace(/\\/g, '/').endsWith(`/${className}.java`);
	});
}

function mergeAttributes(tag: GuideNhTagSchema | undefined, attributes: Record<string, GuideNhAttributeSchema>): void {
	if (!tag) {
		return;
	}
	tag.attributes = sortAttributes({
		...tag.attributes,
		...attributes
	});
}

function extractQuotedStrings(value: string): string[] {
	return Array.from(value.matchAll(/"([^"]+)"/g)).map((match) => match[1]);
}

function sortAttributes(attributes: Record<string, GuideNhAttributeSchema>): Record<string, GuideNhAttributeSchema> {
	return Object.fromEntries(Object.entries(attributes).sort(([left], [right]) => left.localeCompare(right)));
}

async function collectJavaFiles(root: string): Promise<string[]> {
	const result: string[] = [];
	async function visit(dir: string): Promise<void> {
		const entries = await fs.readdir(dir, { withFileTypes: true });
		for (const entry of entries) {
			const fullPath = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				await visit(fullPath);
			} else if (entry.name.endsWith('.java')) {
				result.push(fullPath);
			}
		}
	}
	await visit(path.join(root, 'src', 'main', 'java'));
	return result;
}

interface ContributorAttribute {
	name: string;
	schema: GuideNhAttributeSchema;
}

/**
 * Merges the syntax declared by GuideNH syntax contributors.
 *
 * Compiler sources only describe the tags a compiler owns. Attributes that shared parsers or the scene
 * runtime read, container children and tags a compiler accepts but authors never write live in a
 * `SyntaxContributor` instead. That data is declarative - `sink.attributes("Tag",
 * AttributeSyntax.of("name", SyntaxValueKind.KIND))` plus shared
 * `private static final AttributeSyntax NAME = AttributeSyntax.of(...)` declarations - so it can be read
 * the same way compiler sources are. Reading it keeps this schema in step with the mod, including
 * anything a third-party mod contributes.
 */
function applyContributorEnhancements(tags: Record<string, GuideNhTagSchema>, sources: JavaSourceFile[]): void {
	for (const source of sources) {
		if (!source.text.includes('SyntaxContributor')) {
			continue;
		}
		const shared = extractDeclaredAttributes(source.text);
		for (const name of extractContributorTagNames(source.text)) {
			ensureContributorTag(tags, name);
		}
		for (const call of extractContributorAttributeCalls(source.text, shared)) {
			const tag = ensureContributorTag(tags, call.tag);
			for (const attribute of call.attributes) {
				tag.attributes[attribute.name] = attribute.schema;
			}
		}
		for (const child of extractContributorChildren(source.text)) {
			const tag = ensureContributorTag(tags, child.parent);
			// Replaced rather than merged: the contributor is the whole declaration for this container, and
			// merging would keep a child the mod has since stopped allowing.
			if (child.preferred) {
				tag.preferredChildren = Array.from(new Set(child.children));
				tag.children = [];
			} else {
				tag.children = Array.from(new Set(child.children)).sort();
				delete tag.preferredChildren;
			}
		}
		for (const tagName of extractContributorForwardedAttributeTags(source.text)) {
			ensureContributorTag(tags, tagName).forwardsAttributes = true;
		}
	}
}

function ensureContributorTag(tags: Record<string, GuideNhTagSchema>, name: string): GuideNhTagSchema {
	const existingKey = Object.keys(tags).find((key) => key.toLowerCase() === name.toLowerCase());
	if (existingKey) {
		return tags[existingKey];
	}
	const created: GuideNhTagSchema = {
		name,
		kind: 'any',
		description: 'Declared by the GuideNH syntax registry.',
		attributes: {},
		children: [],
		snippets: []
	};
	tags[name] = created;
	return created;
}

/** Reads `private static final AttributeSyntax NAME = AttributeSyntax.of("attr", SyntaxValueKind.KIND, ...)`. */
function extractDeclaredAttributes(source: string): Map<string, ContributorAttribute> {
	const declared = new Map<string, ContributorAttribute>();
	const pattern =
		/AttributeSyntax\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*AttributeSyntax\s*\.\s*of\(\s*"([^"]+)"\s*,\s*SyntaxValueKind\s*\.\s*([A-Z0-9_]+)(?:\s*,\s*([\s\S]*?))?\)\s*;/g;
	for (const match of source.matchAll(pattern)) {
		declared.set(match[1], {
			name: match[2],
			schema: contributorAttributeSchema(match[3], extractQuotedValues(match[4] ?? ''))
		});
	}
	return declared;
}

/** Reads the tag names a contributor announces: `sink.tags(...)` and `sink.containerTags(...)`. */
function extractContributorTagNames(source: string): string[] {
	const names: string[] = [];
	for (const match of source.matchAll(/sink\s*\.\s*(?:tags|containerTags)\(([\s\S]*?)\)\s*;/g)) {
		for (const argument of splitTopLevelArguments(match[1])) {
			// A tag name may be written as a constant, as the include-control tags are.
			const resolved = resolveContributorTagName(argument, source);
			if (resolved) {
				names.push(resolved);
			}
		}
	}
	return names;
}

/**
 * Reads `sink.attributes("Tag", AttributeSyntax.of(...) | SHARED_NAME, ...)`.
 *
 * A contributor may declare the same attributes for several tags with
 * `for (String tag : new String[] { "Lower", "Upper" }) { sink.attributes(tag, VALUE); }`, which is how the
 * string-function family is written. The loop variable is expanded here so those tags keep their attributes;
 * a declaration the reader cannot resolve is skipped rather than guessed at.
 */
function extractContributorAttributeCalls(
	source: string,
	shared: Map<string, ContributorAttribute>
): Array<{ tag: string; attributes: ContributorAttribute[] }> {
	const calls: Array<{ tag: string; attributes: ContributorAttribute[] }> = [];
	const loops = extractStringArrayLoops(source);
	for (const match of source.matchAll(/sink\s*\.\s*attributes\(\s*([^,]+?)\s*,([\s\S]*?)\)\s*;/g)) {
		const tagArgument = match[1].trim();
		const tags = resolveAttributeTagNames(tagArgument, source, loops);
		if (tags.length === 0) {
			continue;
		}
		const attributes: ContributorAttribute[] = [];
		for (const argument of splitTopLevelArguments(match[2])) {
			const inline =
				/^AttributeSyntax\s*\.\s*of\(\s*"([^"]+)"\s*,\s*SyntaxValueKind\s*\.\s*([A-Z0-9_]+)(?:\s*,\s*([\s\S]*))?\)$/.exec(
					argument
				);
			if (inline) {
				attributes.push({
					name: inline[1],
					schema: contributorAttributeSchema(inline[2], extractQuotedValues(inline[3] ?? ''))
				});
				continue;
			}
			const declared = shared.get(argument.trim());
			if (declared) {
				attributes.push(declared);
			}
		}
		if (attributes.length > 0) {
			for (const tag of tags) {
				calls.push({ tag, attributes });
			}
		}
	}
	return calls;
}

/** Reads `sink.forwardsAttributes("Tag", ...)`, which marks a tag as accepting any attribute. */
function extractContributorForwardedAttributeTags(source: string): string[] {
	const names: string[] = [];
	for (const match of source.matchAll(/sink\s*\.\s*forwardsAttributes\(([\s\S]*?)\)\s*;/g)) {
		for (const argument of splitTopLevelArguments(match[1])) {
			const resolved = resolveContributorTagName(argument, source);
			if (resolved) {
				names.push(resolved);
			}
		}
	}
	return names;
}

/** Maps each `for (String x : new String[] { ... })` loop variable to the strings it iterates. */
function extractStringArrayLoops(source: string): Map<string, string[]> {
	const loops = new Map<string, string[]>();
	const pattern = /for\s*\(\s*String\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*new\s+String\[\]\s*\{([\s\S]*?)\}\s*\)/g;
	for (const match of source.matchAll(pattern)) {
		const values = extractQuotedValues(match[2]);
		if (values.length > 0) {
			loops.set(match[1], values);
		}
	}
	return loops;
}

/** The tag names an attribute declaration applies to: a literal, a loop variable, or a String constant. */
function resolveAttributeTagNames(
	argument: string,
	source: string,
	loops: Map<string, string[]>
): string[] {
	const literal = extractQuotedValues(argument);
	if (literal.length > 0) {
		return [literal[0]];
	}
	const identifier = argument.trim();
	if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
		return [];
	}
	const loop = loops.get(identifier);
	if (loop) {
		return loop;
	}
	const constant = resolveContributorTagName(identifier, source);
	return constant ? [constant] : [];
}

/**
 * Reads `sink.children("Parent", "Child", ...)` and `sink.preferredChildren(...)`.
 *
 * The child list is optional: a container whose body takes any block content declares itself with no
 * children at all, and that declaration has to survive as an empty preferred list rather than being
 * dropped, because validation treats a container with no declaration as unrestricted.
 */
function extractContributorChildren(source: string): Array<{ parent: string; children: string[]; preferred: boolean }> {
	const calls: Array<{ parent: string; children: string[]; preferred: boolean }> = [];
	const pattern = /sink\s*\.\s*(preferredChildren|children)\(\s*([\s\S]*?)\)\s*;/g;
	for (const match of source.matchAll(pattern)) {
		const arguments_ = splitTopLevelArguments(match[2]);
		if (arguments_.length === 0) {
			continue;
		}
		const parent = resolveContributorTagName(arguments_[0], source);
		if (!parent) {
			continue;
		}
		const children = arguments_
			.slice(1)
			.flatMap((argument) => extractQuotedValues(argument))
			.filter((child) => child.length > 0);
		calls.push({ parent, children, preferred: match[1] === 'preferredChildren' });
	}
	return calls;
}

/** Resolves a contributor tag name, following a `private static final String` constant when one is used. */
function resolveContributorTagName(argument: string, source: string): string | undefined {
	const literal = extractQuotedValues(argument);
	if (literal.length > 0) {
		return literal[0];
	}
	const constant = argument.trim();
	if (!/^[A-Za-z_][A-Za-z0-9_.]*$/.test(constant)) {
		return undefined;
	}
	const simple = constant.includes('.') ? constant.slice(constant.lastIndexOf('.') + 1) : constant;
	const declaration = source.match(
		new RegExp(`String\\s+${simple}\\s*=\\s*"([^"]+)"`)
	);
	return declaration ? declaration[1] : undefined;
}

function contributorAttributeSchema(kind: string, values: string[]): GuideNhAttributeSchema {
	const enumerated = values.length > 0 ? { values } : {};
	switch (kind) {
		case 'INT':
		case 'FLOAT':
			return { type: 'number', valueStyle: 'string' };
		case 'BOOLEAN':
			return { type: 'boolean', valueStyle: 'string' };
		case 'COLOR':
			return { type: 'color' };
		case 'ENUM':
			return { type: 'enum', ...enumerated };
		case 'ITEM_ID':
		case 'BLOCK_ID':
			return { type: 'item' };
		case 'ORE_DICT':
			return { type: 'ore' };
		case 'PAGE_PATH':
			return { type: 'page' };
		case 'FILE_PATH':
			return { type: 'resource' };
		case 'SNBT':
		case 'VECTOR3':
			return { type: 'string', valueStyle: 'string' };
		default:
			return { type: 'string' };
	}
}

function extractQuotedValues(text: string): string[] {
	return Array.from(text.matchAll(/"([^"\n]*)"/g)).map((match) => match[1]);
}

/**
 * Splits an argument list on commas that are not nested inside parentheses or strings.
 *
 * A backslash escapes the character after it inside a string, so a comma or a quote written as `\"`
 * inside a Java literal does not end the argument.
 */
function splitTopLevelArguments(text: string): string[] {
	const parts: string[] = [];
	let depth = 0;
	let inString = false;
	let escaped = false;
	let current = '';
	for (const character of text) {
		if (inString && escaped) {
			escaped = false;
			current += character;
			continue;
		}
		if (inString && character === '\\') {
			escaped = true;
			current += character;
			continue;
		}
		if (character === '"') {
			inString = !inString;
		}
		if (!inString) {
			if (character === '(') {
				depth++;
			} else if (character === ')') {
				depth--;
			} else if (character === ',' && depth === 0) {
				parts.push(current.trim());
				current = '';
				continue;
			}
		}
		current += character;
	}
	if (current.trim().length > 0) {
		parts.push(current.trim());
	}
	return parts;
}

interface ContributorInlineMarker {
	name: string;
	open: string;
	close: string;
	description: string;
}

interface GeneratedFenceLanguage {
	name: string;
	description: string;
}

/**
 * Merges the markdown syntax declared by the GuideNH sources into markdownExtensions.json.
 *
 * Inline markers come from the contributor's paired `MarkdownSnippet.inline(...)` calls: a snippet whose
 * replacement text is its own trigger twice wraps the selection in that marker. Fence names come from
 * `sink.fenceLanguages(...)`, resolving literal names, constants read from the class that declares them
 * and the entries of the code block language registry. A third-party contributor is read exactly like
 * the built-in one, so a syntax it adds reaches this schema without editing it.
 *
 * Descriptions already curated in the file win over generated ones, so generation only fills gaps.
 */
async function mergeMarkdownExtensions(sources: JavaSourceFile[]): Promise<void> {
	const schemaPath = path.join(__dirname, '..', '..', 'src', 'schema', 'markdownExtensions.json');
	const existing = JSON.parse(await fs.readFile(schemaPath, 'utf8')) as GuideNhMarkdownExtensionsFile;
	const inlineMarkers = { ...existing.inlineMarkers };
	for (const marker of collectInlineMarkers(sources)) {
		inlineMarkers[marker.name] = inlineMarkers[marker.name] ?? {
			open: marker.open,
			close: marker.close,
			description: marker.description
		};
	}
	const fencedCodeBlocks = { ...existing.fencedCodeBlocks };
	for (const fence of collectFenceLanguages(sources)) {
		fencedCodeBlocks[fence.name] = fencedCodeBlocks[fence.name] ?? { description: fence.description };
	}
	const merged: GuideNhMarkdownExtensionsFile = { ...existing, inlineMarkers, fencedCodeBlocks };
	await fs.writeFile(schemaPath, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
}

/** Reads paired `MarkdownSnippet.inline("trigger", "label", "replacement", caretOffset)` declarations. */
function collectInlineMarkers(sources: JavaSourceFile[]): ContributorInlineMarker[] {
	const markers: ContributorInlineMarker[] = [];
	for (const source of sources) {
		if (!source.text.includes('MarkdownSnippet')) {
			continue;
		}
		for (const match of source.text.matchAll(/MarkdownSnippet\s*\.\s*inline\(\s*"([^"]*)"\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"/g)) {
			const trigger = match[1];
			if (trigger.length === 0 || match[3] !== trigger + trigger) {
				continue;
			}
			markers.push({ name: markerKey(match[2]), open: trigger, close: trigger, description: `${match[2]}.` });
		}
	}
	return markers;
}

/** Turns a snippet label such as `Wavy underline` into the `wavyUnderline` key the schema uses. */
function markerKey(label: string): string {
	return label
		.split(/[^A-Za-z0-9]+/)
		.filter((word) => word.length > 0)
		.map((word, index) => (index === 0 ? word.toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()))
		.join('');
}

/** Reads every name passed to `sink.fenceLanguages(...)`, including names held by constants. */
function collectFenceLanguages(sources: JavaSourceFile[]): GeneratedFenceLanguage[] {
	const fences: GeneratedFenceLanguage[] = [];
	for (const source of sources) {
		for (const match of source.text.matchAll(/sink\s*\.\s*fenceLanguages\(\s*([\s\S]*?)\)\s*;/g)) {
			for (const argument of splitTopLevelArguments(match[1])) {
				fences.push(...resolveFenceArgument(argument, sources));
			}
		}
	}
	return fences;
}

function resolveFenceArgument(argument: string, sources: JavaSourceFile[]): GeneratedFenceLanguage[] {
	const literals = extractQuotedStrings(argument);
	if (literals.length > 0) {
		return literals.map((name) => ({ name, description: fenceDescription(name) }));
	}
	const constant = /^([A-Za-z0-9_]+)\s*\.\s*([A-Z0-9_]+)\b/.exec(argument);
	if (constant) {
		const values = readStringConstant(sources, constant[1], constant[2]);
		if (values.length > 0) {
			return values.map((name) => ({ name, description: fenceDescription(name) }));
		}
	}
	const call = /^([A-Za-z0-9_]+)\s*\.\s*([A-Za-z0-9_]+)/.exec(argument);
	return call ? readRegisteredLanguages(sources, call[1], call[2]) : [];
}

/** Reads `static final List<String> NAME = List.of("a", "b");` from the class that declares it. */
function readStringConstant(sources: JavaSourceFile[], className: string, constantName: string): string[] {
	const source = findSourceByClassName(sources, className);
	if (!source) {
		return [];
	}
	const declaration = new RegExp(`\\b${constantName}\\b\\s*=\\s*([^;]+);`).exec(source.text);
	return declaration ? extractQuotedStrings(declaration[1]) : [];
}

/**
 * Reads the fence names a registry class exposes. A method that announces aliases answers with the
 * alias names it maps, written as `registerAlias(result, "languageId", "alias", ...)`; any other method
 * answers with the registered languages, written as `new CodeBlockLanguage("id", "Label")`.
 */
function readRegisteredLanguages(
	sources: JavaSourceFile[],
	className: string,
	methodName: string
): GeneratedFenceLanguage[] {
	const source = findSourceByClassName(sources, className);
	if (!source) {
		return [];
	}
	if (/alias/i.test(methodName)) {
		const aliases: string[] = [];
		for (const match of source.text.matchAll(/registerAlias\s*\(\s*[A-Za-z0-9_]+,\s*([^;]*)\)\s*;/g)) {
			for (const alias of extractQuotedStrings(match[1]).slice(1)) {
				if (!aliases.includes(alias)) {
					aliases.push(alias);
				}
			}
		}
		return aliases.map((name) => ({ name, description: fenceDescription(name) }));
	}
	const languages: GeneratedFenceLanguage[] = [];
	for (const match of source.text.matchAll(/new\s+[A-Za-z0-9_]*Language\s*\(\s*"([^"]+)"\s*(?:,\s*"([^"]+)")?/g)) {
		languages.push({
			name: match[1],
			description: match[2] ? `${match[2]} fenced code block.` : fenceDescription(match[1])
		});
	}
	return languages;
}

function fenceDescription(name: string): string {
	return `${name} fenced code block.`;
}

export /**
 * Merges the insert templates the GuideNH sources declare into snippets.json.
 *
 * A contributor declares the text a tag completes as with `InsertTemplate.caretAfter(tag, text, marker)`,
 * `InsertTemplate.of(tag, text)` or `new InsertTemplate(tag, text, caretOffset)`. Exporting them lets the
 * editor insert the same form, with the caret at the same place, using `$0` as the final tab stop.
 * Descriptions and bodies already curated in the file win over generated ones.
 */
async function mergeInsertTemplateSnippets(sources: JavaSourceFile[]): Promise<void> {
	const schemaPath = path.join(__dirname, '..', '..', 'src', 'schema', 'snippets.json');
	const existing = JSON.parse(await fs.readFile(schemaPath, 'utf8')) as GuideNhSnippetsFile;
	const snippets = { ...existing.snippets };
	for (const template of collectInsertTemplates(sources)) {
		const key = `guidenh.${lowerFirst(template.tagName)}`;
		const current = snippets[key];
		if (current && !isGeneratedTemplateSnippet(current)) {
			// A hand written snippet keeps its own body and placeholders.
			continue;
		}
		snippets[key] = {
			prefix: template.tagName,
			body: withFinalTabStop(template.text, template.caretOffset).split('\n'),
			description: `Insert a <${template.tagName}> tag.`
		};
	}
	const merged: GuideNhSnippetsFile = { ...existing, snippets };
	await fs.writeFile(schemaPath, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
}

/** True for a snippet this generator wrote, so a changed template replaces it instead of being kept. */
function isGeneratedTemplateSnippet(snippet: { description: string }): boolean {
	return snippet.description.startsWith('Insert a <') && snippet.description.endsWith('> tag.');
}

interface InsertTemplateDeclaration {
	tagName: string;
	text: string;
	caretOffset: number;
}

/** Reads every `sink.insertTemplates(...)` declaration of the given sources. */
function collectInsertTemplates(sources: JavaSourceFile[]): InsertTemplateDeclaration[] {
	const templates: InsertTemplateDeclaration[] = [];
	for (const source of sources) {
		if (!source.text.includes('InsertTemplate')) {
			continue;
		}
		for (const match of source.text.matchAll(/sink\s*\.\s*insertTemplates\(\s*([\s\S]*?)\)\s*;/g)) {
			for (const argument of splitTopLevelArguments(match[1])) {
				const declaration = readInsertTemplate(argument);
				if (declaration) {
					templates.push(declaration);
				}
			}
		}
	}
	return templates;
}

function readInsertTemplate(argument: string): InsertTemplateDeclaration | undefined {
	const caretAfter = /InsertTemplate\s*\.\s*caretAfter\(\s*"([^"]+)"\s*,\s*"((?:[^"\\]|\\.)*)"\s*,\s*"((?:[^"\\]|\\.)*)"\s*\)/.exec(
		argument
	);
	if (caretAfter) {
		const text = unescapeJava(caretAfter[2]);
		const marker = unescapeJava(caretAfter[3]);
		const index = marker.length > 0 ? text.indexOf(marker) : -1;
		return { tagName: caretAfter[1], text, caretOffset: index >= 0 ? index + marker.length : text.length };
	}
	const plain = /InsertTemplate\s*\.\s*of\(\s*"([^"]+)"\s*,\s*"((?:[^"\\]|\\.)*)"\s*\)/.exec(argument);
	if (plain) {
		const text = unescapeJava(plain[2]);
		return { tagName: plain[1], text, caretOffset: text.length };
	}
	const constructed = /new\s+InsertTemplate\(\s*"([^"]+)"\s*,\s*"((?:[^"\\]|\\.)*)"\s*,\s*(\d+)\s*\)/.exec(argument);
	if (constructed) {
		return { tagName: constructed[1], text: unescapeJava(constructed[2]), caretOffset: Number(constructed[3]) };
	}
	return undefined;
}

/** Resolves the escapes a Java string literal carries, so the exported snippet keeps its line breaks. */
function unescapeJava(text: string): string {
	return text
		.replace(/\\n/g, '\n')
		.replace(/\\t/g, '\t')
		.replace(/\\"/g, '"')
		.replace(/\\\\/g, '\\');
}

/** Inserts the final tab stop of a snippet at the caret position the template declares. */
function withFinalTabStop(text: string, caretOffset: number): string {
	const offset = Math.max(0, Math.min(caretOffset, text.length));
	return text.slice(0, offset) + '$0' + text.slice(offset);
}

function lowerFirst(value: string): string {
	return value.length > 0 ? value.charAt(0).toLowerCase() + value.slice(1) : value;
}

async function generateSchema(guideNhRoot: string): Promise<void> {
	const javaFiles = await collectJavaFiles(guideNhRoot);
	const tagNames = new Set<string>();
	const generatedTags: Record<string, GuideNhTagSchema> = {};
	const sources: JavaSourceFile[] = [];
	for (const file of javaFiles) {
		const text = await fs.readFile(file, 'utf8');
		sources.push({ path: file, text });
		const scan = scanJavaCompilerSource(text);
		for (const tag of scan.tagNames) {
			tagNames.add(tag);
		}
		Object.assign(generatedTags, scan.tags);
	}
	await mergeGeneratedTags(enhanceGeneratedTagsFromJavaSources(generatedTags, sources));
	await mergeMarkdownExtensions(sources);
	await mergeInsertTemplateSnippets(sources);
	console.log(`GuideNH schema scan found ${tagNames.size} explicit tag names`);
}

async function mergeGeneratedTags(generatedTags: Record<string, GuideNhTagSchema>): Promise<void> {
	const schemaPath = path.join(__dirname, '..', '..', 'src', 'schema', 'tags.json');
	const existing = JSON.parse(await fs.readFile(schemaPath, 'utf8')) as GuideNhTagsFile;
	const mergedTags = mergeTagMaps(generatedTags, existing.tags);
	applyGeneratedTagFixups(mergedTags, generatedTags, existing.tags);
	const gameScene = mergedTags.GameScene;
	const sceneAlias = mergedTags.Scene;
	if (gameScene && sceneAlias) {
		sceneAlias.children = mergeChildren(gameScene.children, sceneAlias.children);
	}
	const merged: GuideNhTagsFile = {
		...existing,
		tags: mergedTags
	};
	await fs.writeFile(schemaPath, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
}

function mergeTagMaps(
	generatedTags: Record<string, GuideNhTagSchema>,
	existingTags: Record<string, GuideNhTagSchema>
): Record<string, GuideNhTagSchema> {
	const mergedNames = new Set([...Object.keys(generatedTags), ...Object.keys(existingTags)]);
	const merged: Record<string, GuideNhTagSchema> = {};
	for (const name of Array.from(mergedNames).sort((left, right) => left.localeCompare(right))) {
		const generated = generatedTags[name];
		const existing = existingTags[name];
		if (!generated) {
			merged[name] = existing;
			continue;
		}
		if (!existing) {
			merged[name] = generated;
			continue;
		}
		merged[name] = mergeTagSchema(generated, existing);
	}
	return merged;
}

/** True for the description wordings the generator itself writes. */
function isGeneratedDescription(description: string): boolean {
	return description.startsWith('Generated from GuideNH ') || description.startsWith('Declared by the GuideNH ');
}

function mergeTagSchema(generated: GuideNhTagSchema, existing: GuideNhTagSchema): GuideNhTagSchema {
	// An entry the generator wrote is fully replaceable. The marker is not one prefix: tags created from the
	// syntax registry carry their own wording, and treating those as hand-written kept a stale allowlist that
	// hid a new preferred-children declaration.
	const preserveExistingDescription = !isGeneratedDescription(existing.description);
	// GuideNH is the source of truth for which tags a container accepts. Merging would make a declaration
	// impossible to withdraw: once a child was recorded it stayed forever, so a container whose body accepts
	// any block content kept a stale allowlist that reported valid pages as errors. Hand-written entries are
	// still preserved, since those are not derived from the mod.
	const preserveExistingChildren = !isGeneratedDescription(existing.description);
	const merged: GuideNhTagSchema = {
		...generated,
		...existing,
		description: preserveExistingDescription ? existing.description : generated.description,
		attributes: mergeAttributesMap(generated.attributes, existing.attributes),
		children: preserveExistingChildren ? existing.children : generated.children,
		snippets: mergeChildren(generated.snippets, existing.snippets)
	};
	if (preserveExistingChildren ? existing.preferredChildren : generated.preferredChildren) {
		merged.preferredChildren = preserveExistingChildren ? existing.preferredChildren : generated.preferredChildren;
	} else {
		delete merged.preferredChildren;
	}
	if (generated.forwardsAttributes || (preserveExistingChildren && existing.forwardsAttributes)) {
		merged.forwardsAttributes = true;
	} else {
		delete merged.forwardsAttributes;
	}
	return merged;
}

function mergeAttributesMap(
	generated: Record<string, GuideNhAttributeSchema>,
	existing: Record<string, GuideNhAttributeSchema>
): Record<string, GuideNhAttributeSchema> {
	const names = new Set([...Object.keys(generated), ...Object.keys(existing)]);
	const merged: Record<string, GuideNhAttributeSchema> = {};
	for (const name of Array.from(names).sort((left, right) => left.localeCompare(right))) {
		merged[name] = {
			...(generated[name] ?? {}),
			...(existing[name] ?? {})
		} as GuideNhAttributeSchema;
	}
	return merged;
}

function applyGeneratedTagFixups(
	mergedTags: Record<string, GuideNhTagSchema>,
	generatedTags: Record<string, GuideNhTagSchema>,
	existingTags: Record<string, GuideNhTagSchema>
): void {
	overwriteGeneratedTag(mergedTags, generatedTags, existingTags, 'ContentTabs');
	overwriteGeneratedTag(mergedTags, generatedTags, existingTags, 'Tab');
	// FunctionGraph curves use label exclusively. The general schema merge retains historical
	// fields unless they are explicitly removed after that merge.
	delete mergedTags.Plot?.attributes.name;
	delete mergedTags.Function?.attributes.name;
	delete mergedTags.Point?.attributes.name;
	delete mergedTags.GameScene?.attributes.background;
	delete mergedTags.Scene?.attributes.background;
}

function overwriteGeneratedTag(
	mergedTags: Record<string, GuideNhTagSchema>,
	generatedTags: Record<string, GuideNhTagSchema>,
	existingTags: Record<string, GuideNhTagSchema>,
	tagName: string
): void {
	const generated = generatedTags[tagName];
	if (!generated) {
		return;
	}
	const existing = existingTags[tagName];
	mergedTags[tagName] = {
		...generated,
		snippets: mergeChildren(generated.snippets, existing?.snippets ?? [])
	};
}

if (require.main === module) {
	const root = resolveGuideNhRoot();
	generateSchema(root).catch((error: unknown) => {
		console.error(error);
		process.exitCode = 1;
	});
}

/**
 * The GuideNH checkout the schema is generated from. An explicit GUIDENH_ROOT wins; otherwise the usual
 * sibling checkouts are probed so a build does not depend on one machine's directory layout, and a wrong
 * guess fails loudly here instead of silently regenerating from a stale tree.
 */
function resolveGuideNhRoot(): string {
	if (process.env.GUIDENH_ROOT) {
		return process.env.GUIDENH_ROOT;
	}
	const candidates = [
		path.resolve(__dirname, '..', '..', '..', 'GuideNH-NH'),
		path.resolve(__dirname, '..', '..', '..', 'GuideNH'),
		'E:\\Github\\GuideNH-NH',
		'E:\\Github\\GuideNH'
	];
	for (const candidate of candidates) {
		if (existsSync(path.join(candidate, 'src', 'main', 'java'))) {
			return candidate;
		}
	}
	throw new Error(
		`Could not locate a GuideNH checkout. Set GUIDENH_ROOT to the repository root. Tried: ${candidates.join(', ')}`
	);
}

