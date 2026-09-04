<p align="center">
    <img width="690" src="./logo.png" alt="GuideNH" style="image-rendering: pixelated;">
</p>
<hr>
<p align="center">
    <img src="https://img.shields.io/badge/license-LGPL--3.0-green" alt="License">
</p>

GuideVSC 是用于编写 GuideNH Markdown 内容的 Visual Studio Code 插件。它提供 GuideNH MDX 风格标签、项目导航数据，以及可选的运行时语义补全能力。

## 功能

- 为 `.guidenh.md` 文件提供 GuideNH Markdown 语言支持。
- 通过语言服务器检查未知 GuideNH 标签、未知属性和必填属性。
- 支持 GuideNH 标签、属性、可复用代码片段，以及运行时桥接后的物品或矿辞 id 补全。
- 基于本地 GuideNH schema 提供悬停说明。
- 基于工作区索引提供定义跳转和引用查找。
- 支持 `item_id` 与 `item_ids` 的 NEI 风格物品表达式，包括工作区索引和语义补全；同时支持导航模组需求/排除条件，以及 `navigation.keyword`/`keywords` 搜索别名。
- 为未闭合的 GuideNH 标签提供快速修复，支持嵌套标签栈。
- 可以从本地 GuideNH Java compiler 源码生成 schema。
- 支持可选的、带 token 保护的 WebSocket 运行时语义缓存。

## 运行时桥

运行时桥必须手动配置。插件不会提供默认 host、port 或 token。

只有在明确需要连接正在运行的 GuideNH 客户端桥接服务时，才配置以下选项：

- `guide-vsc.runtimeBridge.host`
- `guide-vsc.runtimeBridge.port`
- `guide-vsc.runtimeBridge.token`
- `guide-vsc.runtimeBridge.allowRemote`

使用 `GuideNH: Connect Runtime Bridge` 建立连接，使用 `GuideNH: Disconnect Runtime Bridge` 断开连接。token 只会用于当前连接请求，不会显示在状态消息中。默认只允许连接本机地址，非本机地址必须显式启用 `guide-vsc.runtimeBridge.allowRemote`。

## Schema 生成

生成 schema 时，可以通过 `guide-vsc.guideNhSourcePath` 或 `GUIDENH_ROOT` 指定 GuideNH 源码仓库。

```powershell
npm run compile
npm run generate:schema
```

生成的标签数据会和手写 schema 合并，因此可以保留人工维护的说明和代码片段。

## 开发

```powershell
npm install
npm run verify
npm run package
npm run build
```

`npm run verify` 会重新生成 schema、运行 lint、编译 TypeScript，并执行 VS Code 插件测试套件。`npm run package` 会生成 `dist/guide-vsc.vsix`。`npm run build` 会先验证再打包。

## 安全说明

- 运行时桥没有默认配置。
- 连接运行时桥之前必须显式配置 token。
- 运行时桥默认只允许本机连接，远程地址需要显式启用。
- 运行时语义数据按 capability 分页并缓存，避免同步消息过大。
- 不连接运行时桥时，插件仍然可以基于本地 schema 和工作区索引工作。
