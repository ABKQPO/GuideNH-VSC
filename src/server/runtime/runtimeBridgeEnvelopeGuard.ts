import { BridgeEnvelope, BridgeMessageType } from '../../common/protocol';

const BridgeMessageTypes = new Set<BridgeMessageType>(['request', 'response', 'event', 'error']);

export function validateBridgeEnvelope(value: unknown): BridgeEnvelope {
	if (!value || typeof value !== 'object') {
		throw new Error('Runtime bridge message must be an object.');
	}
	const candidate = value as Partial<BridgeEnvelope>;
	if (candidate.protocol !== 1) {
		throw new Error('Runtime bridge message uses an unsupported protocol.');
	}
	if (typeof candidate.type !== 'string' || !BridgeMessageTypes.has(candidate.type as BridgeMessageType)) {
		throw new Error('Runtime bridge message has an invalid type.');
	}
	if (!isBoundedText(candidate.method, 128)) {
		throw new Error('Runtime bridge message has an invalid method.');
	}
	if (candidate.id !== undefined && !isBoundedText(candidate.id, 128)) {
		throw new Error('Runtime bridge message has an invalid id.');
	}
	if (!Object.prototype.hasOwnProperty.call(candidate, 'payload')) {
		throw new Error('Runtime bridge message is missing payload.');
	}
	return candidate as BridgeEnvelope;
}

function isBoundedText(value: unknown, maxLength: number): value is string {
	return typeof value === 'string' && value.length > 0 && value.length <= maxLength;
}
