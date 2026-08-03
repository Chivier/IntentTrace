---
status: current
owner: release
last_reviewed: 2026-08-03
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

可发布范围仅限：开发者控制的本地 Linux single-host、loopback、无 auth/no HA、默认 mock provider。不得把 mock semantic 质量、合成性能、Linux Rust metadata check 或未运行的 macOS workflow描述为真实 provider 质量、生产 SLA 或已签名 DMG。
