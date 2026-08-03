import Link from "next/link";

import { StatusBadge } from "@intenttrace/ui";

import { HealthPanel } from "./health-panel";

const foundations = [
  "不可变 ETG 与版本化 EIG 契约",
  "PostgreSQL migration 与持久 SSE outbox 模型",
  "本地 filesystem ArtifactStore 与独立 Collector 边界",
  "Mock-only provider policy 与 reducer 信任边界",
  "完整 ADR、测试、运维和施工文档",
];

export default function HomePage() {
  return (
    <main>
      <header className="hero">
        <div>
          <p className="eyebrow">IntentTrace · Evidence-backed agent traces</p>
          <h1>Gate 0 工程与设计基线</h1>
          <p className="lede">
            当前是可运行的工程地基，尚未实现完整 Trace Viewer、实时 Intent Graph 或真实模型总结。
          </p>
        </div>
        <StatusBadge tone="warning">foundation_only</StatusBadge>
      </header>

      <section className="grid" aria-label="Foundation status">
        <article className="card card--wide">
          <h2>服务状态</h2>
          <HealthPanel />
          <p>即使 worker、Redis 或 provider 不可用，后续 raw trace 查询也必须保持独立可用。</p>
        </article>
        <article className="card">
          <h2>已建立</h2>
          <ul>
            {foundations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>
        <article className="card">
          <h2>尚未声称</h2>
          <ul>
            <li>没有导入真实 Codex/Claude session</li>
            <li>没有调用 OpenAI/DeepSeek</li>
            <li>没有 Graph/Gantt/Evidence 产品验收</li>
            <li>没有 HA、公网或多租户能力</li>
          </ul>
        </article>
      </section>

      <nav className="actions" aria-label="Project references">
        <Link href="/prototype">查看历史视觉原型</Link>
        <Link href="/api/status">查看实际 API 状态</Link>
      </nav>
    </main>
  );
}
