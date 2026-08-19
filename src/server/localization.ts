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
	| 'diagnostic.unknownResource'
	| 'diagnostic.unknownFrontmatterKey'
	| 'diagnostic.frontmatterExpects'
	| 'diagnostic.layoutIndentation'
	| 'codeAction.addClosingTag'
	| 'codeAction.addClosingTagAfterTag'
	| 'codeAction.closeNestedTags'
	| 'codeAction.closeNestedTagsAfterTag'
	| 'codeAction.insertMissingClosures'
	| 'codeAction.normalizeIndentation';

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
	'diagnostic.unknownResource': 'Unknown GuideNH resource {0}',
	'diagnostic.unknownFrontmatterKey': 'Unknown frontmatter key {0}',
	'diagnostic.frontmatterExpects': 'Frontmatter key {0} expects {1} value',
	'diagnostic.layoutIndentation': 'GuideNH content has residual indentation that Markdown may parse as an indented code block',
	'codeAction.addClosingTag': 'Add closing tag </{0}>',
	'codeAction.addClosingTagAfterTag': 'Add closing tag </{0}> after </{1}>',
	'codeAction.closeNestedTags': 'Close unclosed tags through </{0}>',
	'codeAction.closeNestedTagsAfterTag': 'Close unclosed tags through </{0}> after </{1}>',
	'codeAction.insertMissingClosures': 'Insert missing closing tags before </{0}>',
	'codeAction.normalizeIndentation': 'Normalize GuideNH content indentation'
};

const ChineseMessages: LocaleMessages = {
	'runtime.bridge.mustConnectBeforeValidation': 'Runtime bridge 必须先连接后才能验证文档。',
	'runtime.document.payloadTooLarge': 'Runtime 文档验证负载过大: {0} 字节',
	'runtime.bridge.messageTooLarge': 'Runtime bridge 消息过大。',
	'runtime.bridge.rejected': 'Runtime bridge 拒绝了该请求。',
	'runtime.semantic.notRequested': 'Runtime 语义负载并非已请求的数据。',
	'runtime.semantic.invalidPayload': 'Runtime 语义负载无效。',
	'runtime.validation.notRequested': 'Runtime 文档验证响应并非已请求的数据。',
	'runtime.bridge.invalidJson': 'Runtime bridge 返回了无效 JSON。',
	'runtime.schema.loadFailed': '无法加载 GuideNH schema。',
	'diagnostic.closingTagMismatch': '结束标签 {0} 与 {1} 不匹配',
	'diagnostic.unknownTag': '未知 GuideNH 标签 {0}',
	'diagnostic.tagNotAllowed': '标签 {0} 不允许出现在 {1} 内部',
	'diagnostic.unknownAttribute': '{1} 上存在未知属性 {0}',
	'diagnostic.attributeExpects': '{1} 上的属性 {0} 需要 {2} 类型的值',
	'diagnostic.missingAttribute': '{1} 缺少必填属性 {0}',
	'diagnostic.unclosedTag': '未闭合的 GuideNH 标签 {0}',
	'diagnostic.unknownPage': '未知 GuideNH 页面 {0}',
	'diagnostic.unknownResource': '未知 GuideNH 资源 {0}',
	'diagnostic.unknownFrontmatterKey': '未知 frontmatter 键 {0}',
	'diagnostic.frontmatterExpects': 'frontmatter 键 {0} 需要 {1} 类型的值',
	'diagnostic.layoutIndentation': 'GuideNH 标签内容存在多余缩进，Markdown 可能会将其解析为缩进代码块',
	'codeAction.addClosingTag': '添加结束标签 </{0}>',
	'codeAction.addClosingTagAfterTag': '在 </{1}> 后添加结束标签 </{0}>',
	'codeAction.closeNestedTags': '补齐未闭合标签，直到 </{0}>',
	'codeAction.closeNestedTagsAfterTag': '在 </{1}> 后补齐未闭合标签，直到 </{0}>',
	'codeAction.insertMissingClosures': '在 </{0}> 前补齐缺失的结束标签',
	'codeAction.normalizeIndentation': '规范 GuideNH 标签内容缩进'
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
