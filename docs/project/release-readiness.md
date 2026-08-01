---
status: current
owner: release
last_reviewed: 2026-08-01
normative: true
milestone: Gate 0-Gate 5
---

# 发布就绪

当前目标是 Gate 0 initialization，不是产品 release。状态：**NOT RELEASE READY**。

- [x] Gate 0 全部命令和 Compose/migration 环境验收完成
- [ ] Gate 1 ingestion/fixture/rotation 完成
- [ ] Gate 2 raw-only/SSE/replay 完成
- [ ] Gate 3 reducer/mock graph/a11y 完成
- [ ] Gate 4 egress/provider/security 完成
- [ ] Gate 5 backup/restore/fault/performance 完成
- [ ] 强制 acceptance matrix 每项有证据
- [ ] clean checkout 一条命令 demo
- [ ] release notes 明确 Linux single-host、loopback、no HA

Gate 0 完成后只能标记 foundation verified。历史原型、mock 数据、静态类型或成功 build 都不能单独提升此结论。
