---
status: current
owner: release
last_reviewed: 2026-08-06
normative: true
milestone: Gate 0-Gate 5
---

# 发布就绪

当前结论：**LOCAL MVP CANDIDATE；MACOS DISTRIBUTION / REAL PROVIDER QUALIFICATION BLOCKED**。

- [x] Gate 0 engineering/docs/Compose/migration baseline
- [x] Gate 1 四 adapter、Collector、artifact、幂等、2,048-event fixture
- [x] Gate 2 raw list/inspector/Gantt/replay、durable SSE、raw-only degraded drill
- [x] Gate 3 reducer/mock revision/BullMQ/React Flow/ELK/evidence/a11y baseline
- [x] Gate 4 adapter code、redaction、allowlist、budget gate、outage/bad JSON raw-only tests
- [ ] Gate 4 真实 provider key/canary/账单环境证据（本轮未授权 key 或付费调用）
- [x] Gate 5 human revision/delete/backup restore/synthetic scale/one-command demo
- [ ] 稳定 DB/UI 性能 SLA（当前只有明确标注的 synthetic smoke）
- [x] macOS Tauri source、Docker service archive、dynamic loopback 和 universal DMG workflow
- [ ] 在真实 macOS 生成、安装、codesign、notarize DMG（需要 Apple environment/credentials）
- [x] source repository 的 AGPL-3.0-only、community health、synthetic screenshots、third-party notices 与公开发布清单
- [ ] GitHub 平台设置、平台端全部 refs 的 secret/privacy 复核、AGPL 网络源码入口、权利确认、最终 repository URL 和 branch protection（见 [`open-source-readiness.md`](open-source-readiness.md)）

可发布范围仅限：开发者控制的本地 Linux single-host、loopback、无 auth/no HA、默认 mock provider。源码仓库已具备开源所需文件，但在外部清单完成前不能声称 GitHub 公共发布门禁已完成。不得把 mock semantic 质量、合成性能、Linux Rust metadata check 或未运行的 macOS workflow描述为真实 provider 质量、生产 SLA 或已签名 DMG。
