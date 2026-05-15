import { RuntimeBridgeConnectParams } from './protocol';

export function validateRuntimeBridgeConnectionParams(params: RuntimeBridgeConnectParams): void {
	if (!params.host || !params.port || !params.token) {
		throw new Error('Runtime bridge host, port, and token must be configured explicitly');
	}
	if (!Number.isSafeInteger(params.port) || params.port < 1 || params.port > 65535) {
		throw new Error('Runtime bridge port must be between 1 and 65535');
	}
	if (!params.allowRemote && !isLoopbackHost(params.host)) {
		throw new Error('Runtime bridge host must be local unless remote access is explicitly enabled');
	}
}

export function isLoopbackHost(host: string): boolean {
	const normalized = host.trim().toLowerCase();
	return normalized === 'localhost'
		|| normalized === '127.0.0.1'
		|| normalized === '::1'
		|| normalized === '[::1]';
}
