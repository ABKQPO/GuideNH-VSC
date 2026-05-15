import { RuntimeBridgeConnectParams } from './protocol';

export interface ValidatedRuntimeBridgeConnectionParams extends RuntimeBridgeConnectParams {
	host: string;
}

export function validateRuntimeBridgeConnectionParams(params: RuntimeBridgeConnectParams): void {
	resolveRuntimeBridgeConnectionParams(params);
}

export function resolveRuntimeBridgeConnectionParams(params: RuntimeBridgeConnectParams): ValidatedRuntimeBridgeConnectionParams {
	if (!params.host || !params.port || !params.token) {
		throw new Error('Runtime bridge host, port, and token must be configured explicitly');
	}
	if (!Number.isSafeInteger(params.port) || params.port < 1 || params.port > 65535) {
		throw new Error('Runtime bridge port must be between 1 and 65535');
	}
	const host = normalizeRuntimeBridgeHost(params.host);
	if (!params.allowRemote && !isLoopbackHost(host)) {
		throw new Error('Runtime bridge host must be local unless remote access is explicitly enabled');
	}
	return {
		...params,
		host
	};
}

export function createRuntimeBridgeWebSocketUrl(params: RuntimeBridgeConnectParams): string {
	const resolved = resolveRuntimeBridgeConnectionParams(params);
	return `ws://${resolved.host}:${resolved.port}`;
}

export function normalizeRuntimeBridgeHost(host: string): string {
	const normalized = host.trim().toLowerCase();
	if (!normalized || normalized.length > 253) {
		throw new Error('Runtime bridge host is invalid');
	}
	if (/[\s/@?#\\]/.test(normalized) || normalized.includes('://')) {
		throw new Error('Runtime bridge host must be a host name or IP address only');
	}
	if (normalized === '::1') {
		return '[::1]';
	}
	if (normalized.startsWith('[') || normalized.endsWith(']')) {
		return normalizeBracketedIpv6Host(normalized);
	}
	if (normalized.includes(':')) {
		throw new Error('Runtime bridge IPv6 host must be bracketed');
	}
	if (!isHostnameOrIpv4(normalized)) {
		throw new Error('Runtime bridge host is invalid');
	}
	return normalized;
}

export function isLoopbackHost(host: string): boolean {
	const normalized = normalizeRuntimeBridgeHost(host);
	return normalized === 'localhost'
		|| normalized === '127.0.0.1'
		|| normalized === '[::1]';
}

function normalizeBracketedIpv6Host(host: string): string {
	if (!host.startsWith('[') || !host.endsWith(']')) {
		throw new Error('Runtime bridge IPv6 host must be bracketed');
	}
	const body = host.slice(1, -1);
	if (!body || body.length > 45 || !/^[0-9a-f:.]+$/.test(body) || !body.includes(':')) {
		throw new Error('Runtime bridge IPv6 host is invalid');
	}
	return `[${body}]`;
}

function isHostnameOrIpv4(host: string): boolean {
	return host.split('.').every((label) => {
		return label.length > 0
			&& label.length <= 63
			&& /^[a-z0-9-]+$/.test(label)
			&& !label.startsWith('-')
			&& !label.endsWith('-');
	});
}
