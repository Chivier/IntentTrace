---
status: accepted
owner: program
last_reviewed: 2026-08-03
normative: false
milestone: Gate 0-Gate 5
---

# Roadmap

| Gate            | 状态            | 用户可见能力                            |
| --------------- | --------------- | --------------------------------------- |
| 0 Foundation    | complete        | 状态/健康、契约、Compose                |
| 1 Ingest        | complete        | 四来源显式导入/跟随                     |
| 2 Raw           | complete        | raw list/inspector/Gantt/replay/SSE     |
| 3 Mock semantic | complete        | reducer-backed Graph/Evidence/ELK       |
| 4 Providers     | code complete   | 显式 provider；真实 key canary 未执行   |
| 5 Harden        | local candidate | human revision、恢复、synthetic scale   |
| macOS release   | external gate   | Tauri workflow；待 signed/notarized DMG |

后续优先级是 macOS signed/notarized install drill、用户授权的 provider canary、稳定 DB/UI benchmark。Run comparison、移动端、公网 SaaS、HA、gRPC 和 embeddings 不在 MVP roadmap。
