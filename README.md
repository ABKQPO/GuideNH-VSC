<p align="center">
    <img width="690" src="./logo.png" alt="GuideNH" style="image-rendering: pixelated;">
</p>
<hr>
<p align="center">
    <img src="https://img.shields.io/badge/license-LGPL--3.0-green" alt="License">
</p>

GuideVSC is a Visual Studio Code extension for authoring GuideNH Markdown content. It provides language tooling for GuideNH MDX-style tags, project navigation data, and optional runtime semantic completion from a manually configured GuideNH client bridge.

## Features

- GuideNH Markdown language support for `.guidenh.md` files.
- Language server diagnostics for unknown GuideNH tags, unknown attributes, and required attributes.
- Completion for GuideNH tags, attributes, reusable snippets, and runtime item or ore ids when the bridge is connected.
- Hover information from the local GuideNH schema.
- Definition and reference support backed by the workspace index.
- Frontmatter support for `item_id` and `item_ids` NEI-style item expressions, including workspace indexing and semantic completion, plus `navigation.required_mod`/`required_mods` requirements and `navigation.excluded_mod`/`excluded_mods` exclusions.
- Quick fixes for unclosed GuideNH tags, including nested tag stacks.
- Schema generation from the local GuideNH Java compiler sources.
- Optional runtime semantic cache over a token-protected WebSocket bridge.

## Runtime Bridge

The runtime bridge is manual and disabled until configured. The extension does not provide default host, port, or token values.

Configure these settings only when you intentionally want to connect to a running GuideNH client bridge:

- `guide-vsc.runtimeBridge.host`
- `guide-vsc.runtimeBridge.port`
- `guide-vsc.runtimeBridge.token`
- `guide-vsc.runtimeBridge.allowRemote`

Use `GuideNH: Connect Runtime Bridge` to connect and `GuideNH: Disconnect Runtime Bridge` to stop the session. Token values are passed to the language server for the active connection request and are not shown in status messages. Non-loopback hosts are rejected unless `guide-vsc.runtimeBridge.allowRemote` is enabled.

## Schema Generation

Set `guide-vsc.guideNhSourcePath` or `GUIDENH_ROOT` to the GuideNH source repository when generating schema data.

```powershell
npm run compile
npm run generate:schema
```

Generated tag data is merged with handwritten schema entries so curated descriptions and snippets can be preserved.

## Development

```powershell
npm install
npm run verify
npm run package
npm run build
```

`npm run verify` regenerates schema data, runs lint, compiles TypeScript, and executes the VS Code extension test suite. `npm run package` creates `dist/guide-vsc.vsix`. `npm run build` runs verification before packaging.

## Security Notes

- Runtime bridge settings have no defaults.
- Runtime bridge token configuration is required before a connection request is sent.
- Runtime bridge connections are local-only by default. Remote hosts require explicit opt-in.
- Runtime semantic data is paged and cached by capability to avoid oversized synchronization messages.
- The extension can work without the runtime bridge by using the local schema and workspace index.
