---
status: superseded
owner: security
last_reviewed: 2026-08-06
normative: true
milestone: Gate 0
---

# ADR 0011：独立 Collector

决定：API 不读取宿主机目录。Collector CLI 只处理 `--path` 显式授权，绝不扫描 home，默认拒绝 symlink 边界；checkpoint 记录 realpath、file identity、offset 和 prefix hash，以识别 append/rotation/truncation。实现对显式 file 或显式 directory 的一层 regular files 做 import；follow 只允许 Codex/Claude 单文件。

状态：独立 Collector、显式授权、API 不扫描宿主目录和 symlink 拒绝结论继续有效；“一层 regular files/直接 import”实现限制由 [`0012`](0012-guided-session-import.md) 的递归、两阶段 guided import 替代。
