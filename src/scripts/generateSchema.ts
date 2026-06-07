import { promises as fs } from 'fs';
import * as path from 'path';
import { GuideNhAttributeSchema, GuideNhTagSchema, GuideNhTagsFile } from '../common/schema';

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
	applyRecipeEnhancements(enhanced);
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

function applyFunctionGraphEnhancements(tags: Record<string, GuideNhTagSchema>, sources: JavaSourceFile[]): void {
	const attrsSource = findSourceByClassName(sources, 'FunctionGraphAttrs');
	if (!attrsSource) {
		applyFallbackFunctionGraphEnhancements(tags);
		return;
	}
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
		'gridColor',
		'height',
		'quadrants',
		'showAxes',
		'showGrid',
		'title',
		'width',
		'xMax',
		'xMin',
		'xRange',
		'xStep',
		'yMax',
		'yMin',
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
		gridColor: { type: 'color', valueStyle: 'string' },
		height: { type: 'number', valueStyle: 'string' },
		quadrants: { type: 'string', valueStyle: 'string' },
		showAxes: { type: 'boolean', valueStyle: 'expression' },
		showGrid: { type: 'boolean', valueStyle: 'expression' },
		title: { type: 'string', valueStyle: 'string' },
		width: { type: 'number', valueStyle: 'string' },
		xMax: { type: 'string', valueStyle: 'string' },
		xMin: { type: 'string', valueStyle: 'string' },
		xRange: { type: 'string', valueStyle: 'string' },
		xStep: { type: 'string', valueStyle: 'string' },
		yMax: { type: 'string', valueStyle: 'string' },
		yMin: { type: 'string', valueStyle: 'string' },
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
		pointEveryY: { type: 'string', valueStyle: 'string' }
	};
}

function applyRecipeEnhancements(tags: Record<string, GuideNhTagSchema>): void {
	const recipeFilterAttributes: Record<string, GuideNhAttributeSchema> = {
		input: { type: 'string', valueStyle: 'string' as const },
		output: { type: 'string', valueStyle: 'string' as const }
	};
	for (const name of ['Recipe', 'RecipeFor', 'RecipeUsage', 'RecipesFor']) {
		mergeAttributes(tags[name], recipeFilterAttributes);
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
		noTooltip: { type: 'boolean', valueStyle: 'expression' },
		...tooltipCompatibilityAttributes,
		tooltip: { type: 'string', valueStyle: 'string' }
	});
	for (const name of ['ItemLink', 'QuestCard', 'QuestLink']) {
		mergeAttributes(tags[name], tooltipCompatibilityAttributes);
	}
	mergeAttributes(tags.FloatingImage, {
		height: { type: 'number', valueStyle: 'string' },
		sound: { type: 'string', valueStyle: 'string' },
		src: { type: 'resource', valueStyle: 'string' },
		trigger: { type: 'string', valueStyle: 'string' },
		volume: { type: 'number', valueStyle: 'expression' },
		wrap: { type: 'string', valueStyle: 'string' },
		width: { type: 'number', valueStyle: 'string' }
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

export async function generateSchema(guideNhRoot: string): Promise<void> {
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

function mergeTagSchema(generated: GuideNhTagSchema, existing: GuideNhTagSchema): GuideNhTagSchema {
	const preserveExistingDescription = !existing.description.startsWith('Generated from GuideNH ');
	const preserveExistingChildren = !existing.description.startsWith('Generated from GuideNH ') && generated.children.length === 0;
	const mergedChildren = preserveExistingChildren ? existing.children : mergeChildren(generated.children, existing.children);
	return {
		...generated,
		...existing,
		description: preserveExistingDescription ? existing.description : generated.description,
		attributes: mergeAttributesMap(generated.attributes, existing.attributes),
		children: mergedChildren,
		snippets: mergeChildren(generated.snippets, existing.snippets)
	};
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
	const root = process.env.GUIDENH_ROOT || 'E:\\Github\\GuideNH';
	generateSchema(root).catch((error: unknown) => {
		console.error(error);
		process.exitCode = 1;
	});
}

