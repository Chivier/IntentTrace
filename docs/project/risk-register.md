---
status: current
owner: program
last_reviewed: 2026-08-01
normative: true
milestone: Gate 0-Gate 5
---

# 风险登记

| ID  | 风险                                      | 可能性/影响 | 缓解与 Gate                                | 状态          |
| --- | ----------------------------------------- | ----------- | ------------------------------------------ | ------------- |
| R1  | semantic claim 无证据或伪完成             | 中/高       | claim evidence + reducer + eval，G3        | open          |
| R2  | at-least-once 产生重复 revision           | 中/高       | DB input hash/base/transaction，G3         | open          |
| R3  | 迟到 event 让 final 失真                  | 高/中       | watermark/stale/new final，G3              | designed      |
| R4  | session/secret 经 Collector/provider 泄漏 | 中/高       | explicit path/redaction/egress gate，G1/G4 | controlled G0 |
| R5  | stored XSS/prompt injection               | 中/高       | untrusted rendering/local validation，G4   | open          |
| R6  | Redis/worker/provider 故障阻断 raw        | 中/高       | PostgreSQL truth/raw-only tests，G2        | open          |
| R7  | 1.5k node layout 不稳定/不可用            | 中/中       | worker/ELK/local stability/perf，G3/G5     | open          |
| R8  | migration 或 artifact 删除不一致          | 低/高       | transaction choreography/restore，G1/G5    | open          |
| R9  | loopback 被误改为公网                     | 低/高       | Compose config check + ADR/auth gate       | controlled    |
| R10 | 锁定版本/image 不可获取或许可证变化       | 中/中       | images.lock、升级/license check            | monitored     |

Risk closed 需要链接测试或环境证据，不能仅以“已有设计”关闭。
