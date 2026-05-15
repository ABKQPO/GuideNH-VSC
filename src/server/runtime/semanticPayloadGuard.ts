import { SemanticEntry, SemanticQueryResultPayload } from '../../common/protocol';

export interface SemanticPayloadGuardLimits {
	pageEntries: number;
	totalEntries: number;
	entryTextLength: number;
	cursorLength: number;
}

export const DefaultSemanticPayloadGuardLimits: SemanticPayloadGuardLimits = {
	pageEntries: 500,
	totalEntries: 5000,
	entryTextLength: 512,
	cursorLength: 128
};

export interface SemanticPayloadGuardState {
	seenCursors: Set<string>;
	totalEntries: number;
}

export interface SemanticPayloadValidationResult {
	payload: SemanticQueryResultPayload;
	nextCursor?: string;
	totalEntries: number;
}

export function createSemanticPayloadGuardState(): SemanticPayloadGuardState {
	return {
		seenCursors: new Set<string>(),
		totalEntries: 0
	};
}

export function validateSemanticPayload(
	value: unknown,
	allowedCapabilities: ReadonlySet<string>,
	state: SemanticPayloadGuardState,
	limits: SemanticPayloadGuardLimits = DefaultSemanticPayloadGuardLimits
): SemanticPayloadValidationResult {
	if (!value || typeof value !== 'object') {
		throw new Error('Runtime semantic payload must be an object.');
	}
	const candidate = value as Partial<SemanticQueryResultPayload>;
	if (typeof candidate.capability !== 'string' || !allowedCapabilities.has(candidate.capability)) {
		throw new Error('Runtime semantic payload has an unsupported capability.');
	}
	const version = candidate.version;
	if (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 0) {
		throw new Error('Runtime semantic payload has an invalid version.');
	}
	if (!Array.isArray(candidate.entries) || candidate.entries.length > limits.pageEntries) {
		throw new Error('Runtime semantic payload entry page is too large.');
	}
	const rawEntries = candidate.entries;
	const nextTotal = state.totalEntries + rawEntries.length;
	if (nextTotal > limits.totalEntries) {
		throw new Error('Runtime semantic payload entry total is too large.');
	}
	const entries = rawEntries.map((entry) => validateSemanticEntry(entry, limits.entryTextLength));
	const nextCursor = validateNextCursor(candidate.nextCursor, state, limits.cursorLength);
	return {
		payload: {
			capability: candidate.capability,
			version,
			entries,
			nextCursor: nextCursor ?? null
		},
		nextCursor,
		totalEntries: nextTotal
	};
}

function validateSemanticEntry(value: unknown, textLength: number): SemanticEntry {
	if (!value || typeof value !== 'object') {
		throw new Error('Runtime semantic entry must be an object.');
	}
	const candidate = value as Partial<SemanticEntry>;
	if (!isBoundedText(candidate.id, textLength)) {
		throw new Error('Runtime semantic entry id is invalid.');
	}
	if (candidate.label !== undefined && !isBoundedText(candidate.label, textLength)) {
		throw new Error('Runtime semantic entry label is invalid.');
	}
	if (candidate.detail !== undefined && !isBoundedText(candidate.detail, textLength)) {
		throw new Error('Runtime semantic entry detail is invalid.');
	}
	return {
		id: candidate.id,
		label: candidate.label,
		detail: candidate.detail
	};
}

function validateNextCursor(
	value: SemanticQueryResultPayload['nextCursor'],
	state: SemanticPayloadGuardState,
	cursorLength: number
): string | undefined {
	if (value === undefined || value === null || value === '') {
		return undefined;
	}
	if (!isBoundedText(value, cursorLength)) {
		throw new Error('Runtime semantic payload cursor is invalid.');
	}
	if (state.seenCursors.has(value)) {
		throw new Error('Runtime semantic payload cursor repeated.');
	}
	return value;
}

function isBoundedText(value: unknown, maxLength: number): value is string {
	return typeof value === 'string' && value.length > 0 && value.length <= maxLength;
}
