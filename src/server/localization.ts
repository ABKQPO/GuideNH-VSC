type LocaleKey =
	| 'runtime.bridge.mustConnectBeforeValidation'
	| 'runtime.document.payloadTooLarge'
	| 'runtime.bridge.messageTooLarge'
	| 'runtime.bridge.rejected'
	| 'runtime.semantic.notRequested'
	| 'runtime.semantic.invalidPayload'
	| 'runtime.validation.notRequested'
	| 'runtime.bridge.invalidJson'
	| 'runtime.schema.loadFailed'
	| 'diagnostic.closingTagMismatch'
	| 'diagnostic.unknownTag'
	| 'diagnostic.tagNotAllowed'
	| 'diagnostic.unknownAttribute'
	| 'diagnostic.attributeExpects'
	| 'diagnostic.missingAttribute'
	| 'diagnostic.unclosedTag'
	| 'diagnostic.unknownPage'
	| 'diagnostic.unknownFrontmatterKey'
	| 'diagnostic.frontmatterExpects';

type LocaleMessages = Record<LocaleKey, string>;

const EnglishMessages: LocaleMessages = {
	'runtime.bridge.mustConnectBeforeValidation': 'Runtime bridge must be connected before document validation.',
	'runtime.document.payloadTooLarge': 'Runtime document validation payload is too large: {0} bytes',
	'runtime.bridge.messageTooLarge': 'Runtime bridge message is too large.',
	'runtime.bridge.rejected': 'Runtime bridge rejected the request.',
	'runtime.semantic.notRequested': 'Runtime semantic payload was not requested.',
	'runtime.semantic.invalidPayload': 'Runtime semantic payload is invalid.',
	'runtime.validation.notRequested': 'Runtime document validation response was not requested.',
	'runtime.bridge.invalidJson': 'Runtime bridge returned invalid JSON.',
	'runtime.schema.loadFailed': 'GuideNH schema could not be loaded.',
	'diagnostic.closingTagMismatch': 'Closing tag {0} does not match {1}',
	'diagnostic.unknownTag': 'Unknown GuideNH tag {0}',
	'diagnostic.tagNotAllowed': 'Tag {0} is not allowed inside {1}',
	'diagnostic.unknownAttribute': 'Unknown attribute {0} on {1}',
	'diagnostic.attributeExpects': 'Attribute {0} on {1} expects {2} value',
	'diagnostic.missingAttribute': 'Missing required attribute {0} on {1}',
	'diagnostic.unclosedTag': 'Unclosed GuideNH tag {0}',
	'diagnostic.unknownPage': 'Unknown GuideNH page {0}',
	'diagnostic.unknownFrontmatterKey': 'Unknown frontmatter key {0}',
	'diagnostic.frontmatterExpects': 'Frontmatter key {0} expects {1} value'
};

const ChineseMessages: LocaleMessages = {
	'runtime.bridge.mustConnectBeforeValidation': '运行时桥接必须先连接，然后才能进行文档校验。',
	'runtime.document.payloadTooLarge': '运行时文档校验负载过大：{0} 字节',
	'runtime.bridge.messageTooLarge': '运行时桥接消息过大。',
	'runtime.bridge.rejected': '运行时桥接拒绝了请求。',
	'runtime.semantic.notRequested': '运行时语义负载未被请求。',
	'runtime.semantic.invalidPayload': '运行时语义负载无效。',
	'runtime.validation.notRequested': '运行时文档校验响应未被请求。',
	'runtime.bridge.invalidJson': '运行时桥接返回了无效 JSON。',
	'runtime.schema.loadFailed': '无法加载 GuideNH schema。',
	'diagnostic.closingTagMismatch': '闭合标签 {0} 与 {1} 不匹配',
	'diagnostic.unknownTag': '未知 GuideNH 标签 {0}',
	'diagnostic.tagNotAllowed': '标签 {0} 不允许出现在 {1} 内',
	'diagnostic.unknownAttribute': '{1} 上存在未知属性 {0}',
	'diagnostic.attributeExpects': '{1} 上的属性 {0} 需要 {2} 值',
	'diagnostic.missingAttribute': '{1} 缺少必填属性 {0}',
	'diagnostic.unclosedTag': 'GuideNH 标签 {0} 未闭合',
	'diagnostic.unknownPage': '未知 GuideNH 页面 {0}',
	'diagnostic.unknownFrontmatterKey': '未知 frontmatter 键 {0}',
	'diagnostic.frontmatterExpects': 'Frontmatter 键 {0} 需要 {1} 值'
};

let activeMessages = EnglishMessages;

export function setServerLocale(locale: string | undefined): void {
	activeMessages = locale?.toLowerCase().startsWith('zh') ? ChineseMessages : EnglishMessages;
}

export function localizeServer(key: LocaleKey, ...args: Array<string | number>): string {
	const template = activeMessages[key] ?? EnglishMessages[key];
	return args.reduce<string>((message, value, index) => {
		return message.replace(new RegExp(`\\{${index}\\}`, 'g'), String(value));
	}, template);
}
