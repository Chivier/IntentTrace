import Link from "next/link";

import { StatusBadge } from "@intenttrace/ui";

import { HealthPanel } from "./health-panel";

const foundations = [
  "四类 adapter、显式路径 Collector 与不可变 ETG",
  "可恢复 SSE、Raw Inspector、Agent Gantt 与 replay",
  "确定性 mock semantic pipeline 与版本化 EIG",
  "filesystem ArtifactStore、证据定位与 reducer 信任边界",
  "loopback Docker 栈与 provider egress 安全门禁",
];

export default function HomePage() {
  return (
    <main>
      <header className="hero">
        <div>
          <p className="eyebrow">IntentTrace · Evidence-backed agent traces</p>
          <h1>从执行事实到可核验证据图</h1>
          <p className="lede">
            IntentTrace 本地工作台将 raw trace、Agent 时间线、语义 revision 和 claim-level evidence
            保持在同一套稳定 ID 上；模型不可用时 raw 路径仍然可浏览。
          </p>
        </div>
        <StatusBadge tone="ok">local_mvp</StatusBadge>
      </header>

      <section className="grid" aria-label="Foundation status">
        <article className="card card--wide">
          <h2>服务状态</h2>
          <HealthPanel />
          <p>即使 worker、Redis 或 provider 不可用，后续 raw trace 查询也必须保持独立可用。</p>
        </article>
        <article className="card">
          <h2>本地能力</h2>
          <ul>
            {foundations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>
        <article className="card">
          <h2>发布边界</h2>
          <ul>
            <li>默认 mock-only，不会自动调用任何云模型</li>
            <li>真实 Codex/Claude session 只由显式路径 Collector 读取</li>
            <li>没有 HA、公网或多租户能力</li>
            <li>macOS 未签名构建仅用于本地开发验证</li>
          </ul>
        </article>
      </section>

      <nav className="actions" aria-label="Project references">
        <Link href="/traces">打开 Trace 工作台</Link>
        <Link href="/prototype">查看历史视觉原型</Link>
        <Link href="/api/status">查看实际 API 状态</Link>
      </nav>
    </main>
  );
}
