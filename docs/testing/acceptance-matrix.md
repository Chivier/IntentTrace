---
status: draft
owner: quality
last_reviewed: 2026-08-01
normative: true
milestone: Gate 1-Gate 5
---

# 强制验收矩阵

| 场景                            | 最晚 Gate | 关键断言                              |
| ------------------------------- | --------- | ------------------------------------- |
| 重复/乱序/迟到 event            | 1/3       | 幂等、sequence、final stale/new final |
| file append/rotation/truncation | 1         | checkpoint 无丢失、无越界读取         |
| worker 崩溃与重投               | 3         | 单一 revision、无重复 outbox          |
| 恶意 patch/prompt injection     | 3/4       | 整体拒绝、无 proposed 泄漏            |
| SSE gap/过期 cursor             | 2         | 补发或 410 + snapshot                 |
| Redis/worker/provider outage    | 2/4       | raw browse 可用、ingest 不阻塞        |
| secret/stored XSS               | 4         | egress/log/UI 均不泄漏/执行           |
| backup restore                  | 5         | hash/count/revision 一致              |
| 10k raw / 1.5k nodes            | 5         | 达到已记录预算                        |
| keyboard/200%/reduced motion    | 3/5       | WCAG 交互基线                         |

矩阵每一格需链接自动测试或环境演练产物；只有计划文字时状态为 planned。
