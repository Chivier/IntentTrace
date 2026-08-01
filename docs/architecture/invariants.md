---
status: accepted
owner: architecture
last_reviewed: 2026-08-01
normative: true
milestone: Gate 0-Gate 5
---

# 系统不变量

1. Raw event 只追加；start、end、correction、trace complete 都是新事实，禁止原地修改。
2. raw payload 只以 hash/ref 持久化；数据库 envelope 保留来源、lineage、时间、状态和 artifact refs。
3. 每个 trace 的 `ingestSeq` 由 PostgreSQL 事务单调分配；source identity + 相同 hash 幂等，不同 hash 是 `409 integrity_conflict`。
4. EIG 可删除重建；logical node/edge ID 稳定，version immutable，revision membership 复用未变化版本。
5. provider 永不写库，只能输出受 nonce、base revision、allowlist 和 schema 约束的 patch。
6. reducer 独立计算 confidence、状态、cycle、dedupe、pin 与 evidence；模型建议不是提交事实。
7. raw insert、summary command、revision commit、SSE outbox 各自在对应 PostgreSQL 事务内原子提交。
8. worker/Redis/provider 故障不破坏已入库 raw 查询；provider 失败回退 raw-only。
9. 默认无云 egress、无 home 扫描、无真实 session 自动读取、无隐藏 chain-of-thought。
10. 所有外部可达端口只绑定 loopback；该约束改变前必须增加 auth/threat-model ADR。
