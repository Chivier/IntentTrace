---
status: accepted
owner: release
last_reviewed: 2026-08-01
normative: true
milestone: Gate 0-Gate 5
---

# 质量与发布过程

本地/CI 顺序：frozen install → production dependency audit → format → lint → typecheck → unit → contract → e2e → build → docs → schema drift → Compose config/smoke → migrate twice。失败不得进入下一 Gate。生成物必须在检查前重新生成并保持工作树无 drift。

证据等级分为 authored-unexecuted、automated-verified、environment-verified、release-verified。只有在目标 Linux、锁定 Compose images、健康端点、备份恢复与 acceptance matrix 全部通过后才能声明 release-ready；fixture/mock 不能证明 provider 或真实用户 trace。

发布版本记录 schema/migration、image digests、Node/pnpm/lockfile、commit、命令和已知限制。首发明确 single-host、非 HA、loopback。
