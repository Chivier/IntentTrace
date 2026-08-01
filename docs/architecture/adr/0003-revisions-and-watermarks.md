---
status: accepted
owner: architecture
last_reviewed: 2026-08-01
normative: true
milestone: Gate 0
---

# ADR 0003：不可变 revision 与 watermark

决定：logical ID 与 version ID 分离；revision 保存 parent、`live|final|human` branch 和 event watermark，通过 membership 表复用版本。Replay 使用 ingest/revision commit watermark 表示当时已知，source time 只决定时间轴位置。迟到 event 使 final stale，并以新 final 纠正，不覆写历史。
