---
status: current
owner: desktop
last_reviewed: 2026-08-03
normative: true
milestone: macOS distribution
---

# macOS Tauri 与 DMG

`apps/desktop` 是 Tauri 2 launcher，不是另一套数据库实现。`pnpm desktop:prepare` 生成过滤后的 `intenttrace-stack.tar.gz`；bundle 首次运行把它安全释放到 app local-data，查找 Docker Desktop CLI，以固定 `docker compose -p intenttrace-desktop` 参数构建栈，再查询 Docker 动态分配的 `127.0.0.1` Web 端口并打开 `/traces`。前端没有通用 shell permission。

本地 macOS 构建：安装 Xcode Command Line Tools、Rust、Node/pnpm 和 Docker Desktop，然后执行：

```bash
pnpm install --frozen-lockfile
pnpm desktop:prepare
pnpm --filter @intenttrace/desktop tauri build --target universal-apple-darwin --bundles dmg
```

`.github/workflows/macos-dmg.yml` 提供手动 universal build。对外分发必须配置 `APPLE_CERTIFICATE`、`APPLE_CERTIFICATE_PASSWORD`、`APPLE_SIGNING_IDENTITY`、`APPLE_ID`、`APPLE_PASSWORD`、`APPLE_TEAM_ID`，并保存 codesign/notarization/staple/安装证据；无凭据产物只能作为内部未签名构建，不得称为 release。DMG 启动仍依赖 Docker Desktop，且只支持 macOS 12+、桌面宽度至少 1024px。

Linux evidence 仅覆盖 JSON/CSP、Rust formatting、Cargo dependency lock 和资源归档；Tauri WebKit native compile、DMG、Apple signature/notarization 均是 macOS 独立门禁。
