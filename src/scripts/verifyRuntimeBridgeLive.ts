import * as assert from 'assert';
import * as path from 'path';
import { GuideNhHoverResult, createGuideNhHover } from '../server/providers/hover';
import {
	DynamicCompletionRequest,
	createRuntimeSemanticCompletionItems,
	createGuideNhCompletionResult
} from '../server/providers/completion';
import { PreviewResolveResultPayload } from '../common/protocol';
import { RuntimeBridgeClient, RuntimeBridgeStatus } from '../server/runtime/runtimeBridgeClient';
import { SemanticCache } from '../server/runtime/semanticCache';
import { loadGuideNhSchema } from '../server/schema/schemaLoader';

interface CliOptions {
	host: string;
	port: number;
	token: string;
	allowRemote: boolean;
	timeoutMs: number;
}

interface VerificationSummary {
	items: {
		sampleId: string;
		sampleLabel: string;
		previewTooltipLines: number;
		iconBytes: number;
	};
	commands: {
		sampleId: string;
	};
	pages: {
		sampleId: string;
	};
	entities: {
		sampleId: string;
		dynamicCount: number;
	};
	structurelib: {
		controller: string;
		channel: string;
		facing: string;
	};
}

const RequiredBootstrapCapabilities = ['pages', 'entities'];

async function main(): Promise<void> {
	const options = parseArgs(process.argv.slice(2));
	if (!options.token) {
		throw new Error('Missing required --token value.');
	}

	const schema = await loadSchemaFromCandidates([
		path.join(__dirname, '..', 'schema'),
		path.join(__dirname, '..', '..', 'src', 'schema')
	]);

	const cache = new SemanticCache();
	const statuses: RuntimeBridgeStatus[] = [];
	const client = new RuntimeBridgeClient(cache, {
		onStatus: (status) => {
			statuses.push(status);
		}
	});

	client.connect({
		host: options.host,
		port: options.port,
		token: options.token,
		allowRemote: options.allowRemote
	});

	try {
		await waitForConnected(statuses, options.timeoutMs);
		await waitForBootstrap(cache, statuses, options.timeoutMs);
		client.validateDocument({
			uri: 'file:///guide-vsc-runtime-bridge-verify.md',
			languageId: 'markdown',
			text: '<Entity id="minecraft:player" />\n'
		});

		const itemEntry = await verifyItemCompletion(schema, cache, client);
		const itemPreview = await verifyItemPreview(client, itemEntry.id);
		const commandEntry = await verifyCommandCompletion(schema, cache, client);
		const pageEntry = verifyPageFrontmatterCompletion(schema, cache);
		const entityEntry = await verifyEntityCompletion(schema, cache, client);
		const structureLibResult = await verifyStructureLibDynamicPaths(schema, client);

		const summary: VerificationSummary = {
			items: {
				sampleId: itemEntry.id,
				sampleLabel: itemEntry.label ?? itemEntry.id,
				previewTooltipLines: itemPreview.tooltipLines.length,
				iconBytes: Buffer.from(itemPreview.iconPngBase64, 'base64').byteLength
			},
			commands: {
				sampleId: commandEntry.id
			},
			pages: {
				sampleId: pageEntry.id
			},
			entities: {
				sampleId: entityEntry.id,
				dynamicCount: cache.queryPrefix('entities', 'player').length
			},
			structurelib: {
				controller: structureLibResult.controller,
				channel: structureLibResult.channel,
				facing: structureLibResult.facing
			}
		};

		process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
	} finally {
		client.disconnect();
	}
}

function parseArgs(argv: string[]): CliOptions {
	const options: CliOptions = {
		host: '127.0.0.1',
		port: 8765,
		token: '',
		allowRemote: false,
		timeoutMs: 30000
	};
	for (let index = 0; index < argv.length; index++) {
		const arg = argv[index];
		const next = argv[index + 1];
		if (arg === '--host' && next) {
			options.host = next;
			index++;
			continue;
		}
		if (arg === '--port' && next) {
			options.port = Number(next);
			index++;
			continue;
		}
		if (arg === '--token' && next) {
			options.token = next;
			index++;
			continue;
		}
		if (arg === '--timeoutMs' && next) {
			options.timeoutMs = Number(next);
			index++;
			continue;
		}
		if (arg === '--allowRemote') {
			options.allowRemote = true;
		}
	}
	return options;
}

async function loadSchemaFromCandidates(schemaDirs: string[]) {
	let lastError: unknown;
	for (const schemaDir of schemaDirs) {
		try {
			return await loadGuideNhSchema(schemaDir);
		} catch (error) {
			lastError = error;
		}
	}
	throw lastError instanceof Error ? lastError : new Error('Unable to load GuideNH schema.');
}

async function waitForConnected(statuses: RuntimeBridgeStatus[], timeoutMs: number): Promise<void> {
	await waitFor(() => {
		const latest = statuses[statuses.length - 1];
		if (!latest) {
			return false;
		}
		if (latest.state === 'error') {
			throw new Error(latest.message ?? 'Runtime bridge connection failed.');
		}
		return latest.state === 'connected';
	}, timeoutMs, 'Timed out waiting for runtime bridge connection.');
}

async function waitForBootstrap(
	cache: SemanticCache,
	statuses: RuntimeBridgeStatus[],
	timeoutMs: number
): Promise<void> {
	await waitFor(() => {
		return RequiredBootstrapCapabilities.every((capability) => cache.getVersion(capability) > 0);
	}, timeoutMs, () => {
		const versions = RequiredBootstrapCapabilities.map((capability) => {
			return `${capability}=${cache.getVersion(capability)}`;
		}).join(', ');
		const latestStatus = statuses[statuses.length - 1];
		const statusText = latestStatus
			? `${latestStatus.state}${latestStatus.message ? ` (${latestStatus.message})` : ''}`
			: 'unknown';
		return `Timed out waiting for runtime bridge bootstrap data. Versions: ${versions}. Latest status: ${statusText}.`;
	});
}

async function verifyItemCompletion(
	schema: Awaited<ReturnType<typeof loadGuideNhSchema>>,
	cache: SemanticCache,
	client: RuntimeBridgeClient
) {
	const text = '<ItemImage id="minecraft:sto';
	const result = createGuideNhCompletionResult(text, text.length, schema, undefined, cache);
	const dynamicItems = result.dynamicRequest
		? createRuntimeSemanticCompletionItems(
			result.dynamicRequest.capability,
			await client.querySemanticEntries(result.dynamicRequest)
		)
		: [];
	const item = [...result.items, ...dynamicItems].find((candidate) => candidate.insertText === 'minecraft:stone');
	assert.ok(item, 'Expected item completion to include minecraft:stone.');
	return {
		id: 'minecraft:stone',
		label: item.label
	};
}

async function verifyCommandCompletion(
	schema: Awaited<ReturnType<typeof loadGuideNhSchema>>,
	cache: SemanticCache,
	client: RuntimeBridgeClient
) {
	const text = '<CommandLink command="/ki';
	const result = createGuideNhCompletionResult(text, text.length, schema, undefined, cache);
	assert.strictEqual(result.dynamicRequest?.capability, 'commands', 'Expected CommandLink.command to request commands capability.');
	const runtimeEntries = await client.querySemanticEntries(result.dynamicRequest as DynamicCompletionRequest);
	assert.ok(runtimeEntries.length > 0, 'Expected live command query to return entries.');
	const entry = findMatchingEntry(runtimeEntries, '/kill') ?? findMatchingEntry(runtimeEntries, 'kill') ?? runtimeEntries[0];
	assert.ok(entry, 'Expected command runtime query to return at least one command.');
	return entry;
}

async function verifyItemPreview(
	client: RuntimeBridgeClient,
	itemId: string
): Promise<PreviewResolveResultPayload> {
	const namespaceSearch = await client.queryPreviewSearch({
		capability: 'items',
		cursor: '',
		limit: 20,
		prefix: 'gr',
		filters: {
			source: 'verify'
		}
	});
	assert.ok(namespaceSearch.entries.length > 0, 'Expected short-prefix preview search to return runtime item entries.');
	assert.ok(
		namespaceSearch.entries[0]?.id.startsWith('gregtech:'),
		'Expected short-prefix preview search to prioritize gregtech namespace entries.'
	);
	const tokenInitialSearch = await client.queryPreviewSearch({
		capability: 'items',
		cursor: '',
		limit: 20,
		prefix: 'gtb',
		filters: {
			source: 'verify'
		}
	});
	assert.ok(tokenInitialSearch.entries.length > 0, 'Expected token-initial preview search to return runtime item entries.');
	assert.ok(
		tokenInitialSearch.entries[0]?.id.includes('gt.blockmachines'),
		'Expected token-initial preview search to prioritize gt.blockmachines-style entries.'
	);
	const exactSearch = await client.queryPreviewSearch({
		capability: 'items',
		cursor: '',
		limit: 20,
		prefix: itemId,
		filters: {
			source: 'verify'
		}
	});
	assert.ok(exactSearch.entries.length > 0, 'Expected exact preview search to return runtime item entries.');
	assert.strictEqual(exactSearch.entries[0]?.id, itemId, `Expected exact preview search to rank ${itemId} first.`);
	const search = await client.queryPreviewSearch({
		capability: 'items',
		cursor: '',
		limit: 20,
		prefix: itemId.includes(':') ? itemId.slice(0, itemId.indexOf(':') + 1) : itemId.slice(0, Math.min(itemId.length, 8)),
		filters: {
			source: 'verify'
		}
	});
	assert.ok(search.entries.length > 0, 'Expected preview search to return runtime item entries.');
	const preview = await client.queryPreviewResolve({
		capability: 'items',
		id: itemId,
		count: 1,
		renderVariant: 'verify',
		filters: {
			source: 'verify'
		}
	});
	assert.ok(preview.iconPngBase64.length > 0, `Expected preview resolve to include icon bytes for ${itemId}.`);
	assert.ok(preview.tooltipLines.length > 0, `Expected preview resolve to include tooltip lines for ${itemId}.`);
	return preview;
}

function verifyPageFrontmatterCompletion(schema: Awaited<ReturnType<typeof loadGuideNhSchema>>, cache: SemanticCache) {
	const text = '---\nnavigation:\n  parent: ind\n---\n';
	const offset = text.indexOf('ind') + 'ind'.length;
	const result = createGuideNhCompletionResult(text, offset, schema, undefined, cache);
	assert.ok(result.items.some((candidate) => candidate.label === 'index.md'), 'Expected navigation.parent completion to include index.md.');
	return assertCacheEntry(cache, 'pages', 'index');
}

async function verifyEntityCompletion(
	schema: Awaited<ReturnType<typeof loadGuideNhSchema>>,
	cache: SemanticCache,
	client: RuntimeBridgeClient
) {
	const text = '<Entity id="player';
	const result = createGuideNhCompletionResult(text, text.length, schema, undefined, cache);
	assert.strictEqual(result.dynamicRequest?.capability, 'entities', 'Expected Entity.id to request entities capability.');
	const runtimeEntries = await client.querySemanticEntries(result.dynamicRequest as DynamicCompletionRequest);
	assert.ok(runtimeEntries.length > 0, 'Expected live entity query to return entries.');
	const entry = findMatchingEntry(runtimeEntries, 'player');
	assert.ok(entry, 'Expected entity runtime query to return a player-like entry.');
	verifyEntityHover(schema, cache, entry.id);
	return entry;
}

function verifyEntityHover(
	schema: Awaited<ReturnType<typeof loadGuideNhSchema>>,
	cache: SemanticCache,
	entityId: string
): void {
	const text = `<Entity id="${entityId}" />`;
	const hoverResult = createGuideNhHover(text, findAttributeValueOffset(text, entityId), schema, undefined, undefined, cache);
	const hoverText = extractHoverText(hoverResult);
	assert.ok(hoverText?.includes(entityId), `Expected entity hover to mention ${entityId}.`);
}

async function verifyStructureLibDynamicPaths(
	schema: Awaited<ReturnType<typeof loadGuideNhSchema>>,
	client: RuntimeBridgeClient
): Promise<{ controller: string; channel: string; facing: string }> {
	const controller = await selectStructureLibController(client);
	const channelEntry = await verifyStructureLibChannelCompletion(schema, client, controller);
	const facingEntry = await verifyStructureLibFacingHover(schema, client, controller);
	return {
		controller,
		channel: channelEntry.id,
		facing: facingEntry.id
	};
}

async function selectStructureLibController(client: RuntimeBridgeClient): Promise<string> {
	const controllers = await client.querySemanticEntries({
		capability: 'structurelib',
		prefix: '',
		filters: {},
		limit: 50
	});
	for (const controller of controllers) {
		const channelEntries = await client.querySemanticEntries({
			capability: 'structurelib',
			prefix: '',
			filters: {
				attribute: 'channel',
				controller: controller.id
			}
		});
		if (channelEntries.length === 0) {
			continue;
		}
		const facingEntries = await client.querySemanticEntries({
			capability: 'structurelib',
			prefix: '',
			filters: {
				attribute: 'facing',
				controller: controller.id
			}
		});
		if (facingEntries.length > 0) {
			return controller.id;
		}
	}
	throw new Error('Unable to find a StructureLib controller that supports both channel and facing queries.');
}

async function verifyStructureLibChannelCompletion(
	schema: Awaited<ReturnType<typeof loadGuideNhSchema>>,
	client: RuntimeBridgeClient,
	controller: string
) {
	const firstPass = await client.querySemanticEntries({
		capability: 'structurelib',
		prefix: '',
		filters: {
			attribute: 'channel',
			controller
		}
	});
	assert.ok(firstPass.length > 0, `Expected StructureLib channel query to return entries for ${controller}.`);
	const channel = firstPass[0];
	const prefix = channel.id.slice(0, 1);
	const text = `<ImportStructureLib controller="${controller}" channel="${prefix}" />`;
	const offset = findAttributeValueOffset(text, prefix);
	const result = createGuideNhCompletionResult(text, offset, schema, undefined);
	assert.strictEqual(result.dynamicRequest?.capability, 'structurelib', 'Expected StructureLib channel completion to use live bridge query.');
	assert.deepStrictEqual(result.dynamicRequest?.filters, {
		attribute: 'channel',
		controller
	});
	const secondPass = await client.querySemanticEntries(result.dynamicRequest as DynamicCompletionRequest);
	assert.ok(secondPass.some((entry) => entry.id === channel.id), `Expected StructureLib completion query to include channel ${channel.id}.`);
	return channel;
}

async function verifyStructureLibFacingHover(
	schema: Awaited<ReturnType<typeof loadGuideNhSchema>>,
	client: RuntimeBridgeClient,
	controller: string
) {
	const firstPass = await client.querySemanticEntries({
		capability: 'structurelib',
		prefix: '',
		filters: {
			attribute: 'facing',
			controller
		}
	});
	assert.ok(firstPass.length > 0, `Expected StructureLib facing query to return entries for ${controller}.`);
	const facing = firstPass[0];
	const text = `<ImportStructureLib controller="${controller}" facing="${facing.id}" />`;
	const offset = findAttributeValueOffset(text, facing.id);
	const hoverResult = createGuideNhHover(text, offset, schema);
	assert.strictEqual(hoverResult.dynamicRequest?.capability, 'structurelib', 'Expected StructureLib facing hover to use live bridge query.');
	assert.deepStrictEqual(hoverResult.dynamicRequest?.filters, {
		attribute: 'facing',
		controller
	});
	const runtimeEntries = await client.querySemanticEntries(hoverResult.dynamicRequest as DynamicCompletionRequest);
	assert.ok(runtimeEntries.some((entry) => entry.id === facing.id), `Expected StructureLib hover query to include facing ${facing.id}.`);
	const runtimeHover = createRuntimeHoverText(runtimeEntries, facing.id);
	assert.ok(runtimeHover?.includes(facing.id), `Expected StructureLib runtime hover to mention ${facing.id}.`);
	return facing;
}

function assertCacheEntry(cache: SemanticCache, capability: string, prefix: string) {
	const entry = cache.queryPrefix(capability, prefix)[0];
	assert.ok(entry, `Expected ${capability} bootstrap cache to contain ${prefix}.`);
	return entry;
}

function findAttributeValueOffset(text: string, value: string): number {
	const index = text.lastIndexOf(value);
	assert.ok(index >= 0, `Expected to find attribute value ${value}.`);
	return index + 1;
}

function findMatchingEntry(
	entries: Array<{ id: string; label?: string; detail?: string }>,
	query: string
) {
	const loweredQuery = query.toLowerCase();
	return entries.find((entry) => {
		return entry.id.toLowerCase().includes(loweredQuery)
			|| entry.label?.toLowerCase().includes(loweredQuery)
			|| entry.detail?.toLowerCase().includes(loweredQuery);
	});
}

function extractHoverText(result: GuideNhHoverResult): string | undefined {
	if (!result.hover) {
		return undefined;
	}
	if (typeof result.hover.contents === 'string') {
		return result.hover.contents;
	}
	if (Array.isArray(result.hover.contents)) {
		return result.hover.contents
			.map((content) => {
				return typeof content === 'string' ? content : ('value' in content ? content.value : '');
			})
			.join('\n');
	}
	return result.hover.contents.value;
}

function createRuntimeHoverText(
	entries: Array<{ id: string; label?: string; detail?: string }>,
	targetValue: string
): string | undefined {
	const entry = entries.find((candidate) => candidate.id === targetValue) ?? entries[0];
	if (!entry) {
		return undefined;
	}
	const lines = [`**${entry.id}**`];
	if (entry.label) {
		lines.push('', entry.label);
	}
	if (entry.detail && entry.detail !== entry.id) {
		lines.push('', entry.detail);
	}
	return lines.join('\n');
}

async function waitFor(
	predicate: () => boolean,
	timeoutMs: number,
	timeoutMessage: string | (() => string)
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() <= deadline) {
		if (predicate()) {
			return;
		}
		await sleep(100);
	}
	throw new Error(typeof timeoutMessage === 'function' ? timeoutMessage() : timeoutMessage);
}

async function sleep(timeoutMs: number): Promise<void> {
	await new Promise((resolve) => {
		setTimeout(resolve, timeoutMs);
	});
}

main().catch((error) => {
	process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
	process.exitCode = 1;
});
