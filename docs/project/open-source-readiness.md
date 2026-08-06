---
status: current
owner: maintainers
last_reviewed: 2026-08-06
normative: true
milestone: public repository preparation
---

# 开源发布准备

本文区分 **repository-complete** 与 **external-required**。前者可由当前工作树与自动化验证证明；后者依赖 GitHub 设置、权利人确认或发布环境，不能仅凭代码勾选。

## Repository-complete

- [x] 根目录包含 GNU AGPL v3.0 官方全文与 `NOTICE`；npm/Cargo manifests 使用 `AGPL-3.0-only`。`private: true` 继续保留，防止 monorepo package 被误发布到 registry。许可证正文来自 GNU 官方 HTTPS 地址，SHA-256 为 `0d96a4ff68ad6d4b6f1f30f713b18d5184912ba8dd389f86aa7710db079abcb0`。
- [x] README 描述能力、架构、快速开始、安全边界、平台状态、限制、验证命令与贡献入口。
- [x] README 产品截图来自固定 seed 的 synthetic six-agent fixture；`pnpm screenshots:readme` 会把 trace list 响应过滤到该 fixture，避免本地真实 session 出现在截图。
- [x] `CONTRIBUTING.md`、DCO、`CODE_OF_CONDUCT.md`、`SECURITY.md`、`SUPPORT.md`、PR 模板与结构化 Issue 模板齐备。
- [x] `CODEOWNERS`、Dependabot（pnpm/Cargo/GitHub Actions/Docker）与 least-privilege CI 已配置。
- [x] `THIRD_PARTY_NOTICES.md` 记录 Inter OFL 以及 EPL/LGPL/MPL/CC-BY 等分发关注项；生产依赖 inventory 可由 `pnpm licenses list --prod` 重建。
- [x] `.gitignore` 排除 `.env`、artifact/checkpoint、database-like runtime state、build/test output 与 desktop generated bundle。
- [x] 2026-08-06 使用官方 gitleaks `v8.30.1` 扫描唯一的本地 ref `main` 全历史，以及由 tracked + 未忽略 untracked 文件组成的待发布快照（含归档递归深度 2），两次均为 `0 leaks`；release tarball SHA-256 已按官方 checksums 文件校验。敏感文件名检查只发现 `.env.example`，真实 `.env`/key/certificate 不存在；tracked `.jsonl` 均位于 synthetic/privacy adapter fixtures。扫描不覆盖 GitHub 端尚不存在的 PR refs，也不能证明字符串之外的业务隐私已全部清除。

## External-required before making the repository public

- [ ] **权利确认**：仓库 owner 确认有权以 `AGPL-3.0-only` 授权全部源码、文档、图标、截图与原始设计包；确认历史贡献不存在 employer/client/third-party assignment 冲突。原设计包虽由仓库保留，也必须纳入该确认。
- [ ] **历史扫描**：对全部 refs（branch/tag/PR refs）运行 GitHub secret scanning 与 gitleaks/trufflehog；如发现 secret，先撤销/轮换，再用 `git filter-repo` 清理历史。仅删除当前文件不够。
- [ ] **隐私审阅**：人工检查 commit author 邮箱、commit message、历史 diff、图片 metadata、设计包、fixtures 和 `docs/project/progress.md`，确保没有不希望公开的邮箱、真实 session 正文、私有项目路径、用户名、内部 host、其他个人信息或客户数据。必要时在公开前重写历史。
- [ ] **AGPL 网络源码入口**：确认最终 owner/repository slug 后，在 Web/desktop 的适当显著位置提供对应源代码入口，确保修改版本通过网络交互时满足 AGPLv3 第 13 节；发布 source archive 必须包含构建、安装和运行所需的 Corresponding Source。
- [ ] **仓库 URL/身份**：确认最终 owner/repository slug；若不是 `chivier/IntentTrace`，更新 README badges 与 `.github/ISSUE_TEMPLATE/config.yml` 链接。配置仓库 description、topics、social preview 与 website。
- [ ] **GitHub 安全设置**：启用 private vulnerability reporting、secret scanning/push protection、Dependabot alerts/security updates 和 dependency graph。
- [ ] **分支保护**：保护 `main`，要求 PR、CI required checks、conversation resolution、禁止 force push/deletion；按维护规模决定 required review 与 CODEOWNERS review。
- [ ] **社区入口**：启用 Discussions（如计划提供社区支持），确认行为准则私密联系人可用，并设置 Issue/PR moderation 权限。
- [ ] **Actions 供应链**：首次正式 release 前，将第三方 GitHub Actions 从 major tag 固定到审核过的 commit SHA，并配置最小 permissions；Dependabot PR 必须审阅 action provenance。
- [ ] **发布版本**：确定首个 SemVer（建议先使用 `0.x`），把 `0.0.0`/`development` 更新为真实版本与 commit provenance，整理 changelog，创建 signed/annotated tag 和 GitHub Release。
- [ ] **容器/制品**：若发布 OCI image，确定 registry、SBOM/provenance/signing、multi-arch policy、第三方 license bundle、漏洞扫描和 digest retention；当前仓库只提供本地 build，不宣称已有官方镜像。
- [ ] **macOS**：公开 DMG 前在 macOS 12+ 完成 universal build、Apple codesign/notarization/staple、安装/升级演练和 release-specific third-party compliance review。
- [ ] **真实 provider**：只有在获得测试 key、预算和网络授权后，才能把 OpenAI/DeepSeek canary、usage/cost 与 raw-only failure 记录为 release evidence；不得在公开 CI 使用长期 provider key。

## Recommended publication sequence

1. 冻结准备 commit，记录 `git status`、commit SHA、Node/pnpm 与 image digests。
2. 完成所有 refs 的 secret/privacy/license ownership 审阅；先轮换凭据，再决定是否重写历史。
3. 在临时私有 fork 或 GitHub draft 环境验证 CI、Issue forms、Dependabot 与链接。
4. 运行 AGENTS 要求的九项门禁，并补充 `pnpm audit --prod`、`pnpm licenses list --prod`、`pnpm docker:check` 与 migration-twice。
5. 配置 branch protection/security settings 后再切换 visibility；切换后立即检查 README 图片、badges、文档链接和 vulnerability report 入口。
6. 先发布 source-only `0.x` prerelease；官方 image/DMG 等二进制产物分别通过其独立供应链和许可证门禁后再附加。

## Non-claims

开源许可证不等于 SaaS production readiness。公开仓库也不证明 auth、多租户、HA、性能 SLA、真实 provider 质量或已签名 macOS 分发。相关状态只认 [`release-readiness.md`](release-readiness.md) 与 [`progress.md`](progress.md) 中分级记录的证据。
