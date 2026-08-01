---
status: accepted
owner: security
last_reviewed: 2026-08-01
normative: true
milestone: Gate 0
---

# ADR 0011：独立 Collector

决定：API 不读取宿主机目录。Collector CLI 只处理 `--path` 显式授权，绝不扫描 home，默认拒绝 symlink 边界；checkpoint 记录 realpath、file identity、offset 和 prefix hash，以识别 append/rotation/truncation。Gate 0 仅校验路径，不读取内容。
