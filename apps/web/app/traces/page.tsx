"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface TraceSummary {
  id: string;
  title: string;
  status: string;
  eventCount: string;
  latestIngestSeq: string;
  updatedAt: string;
}

export default function TraceListPage() {
  const [traces, setTraces] = useState<TraceSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void fetch("/api/v1/traces", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`API ${response.status}`);
        return (await response.json()) as { traces: TraceSummary[] };
      })
      .then((result) => setTraces(result.traces))
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : String(reason)),
      );
  }, []);
  return (
    <main className="workbench-page">
      <Link className="back" href="/">
        ← 项目状态
      </Link>
      <header className="workbench-header">
        <div>
          <p className="eyebrow">Raw-first workbench</p>
          <h1>Traces</h1>
        </div>
        <code>{traces.length} local traces</code>
      </header>
      {error ? (
        <p role="alert" className="error-panel">
          无法连接本地 API：{error}
        </p>
      ) : null}
      <section className="trace-list" aria-label="Local traces">
        {traces.map((trace) => (
          <Link className="trace-row" href={`/traces/${trace.id}`} key={trace.id}>
            <span>
              <strong>{trace.title}</strong>
              <small>{trace.id}</small>
            </span>
            <span className={`trace-status trace-status--${trace.status}`}>{trace.status}</span>
            <span>{trace.eventCount} events</span>
            <time dateTime={trace.updatedAt}>{new Date(trace.updatedAt).toLocaleString()}</time>
          </Link>
        ))}
        {!error && traces.length === 0 ? (
          <div className="empty-state">
            <h2>尚无 trace</h2>
            <p>使用 collector 导入 fixture 或向 OTLP HTTP JSON receiver 发送 span。</p>
            <code>intenttrace import --source jsonl --path ./trace.jsonl</code>
          </div>
        ) : null}
      </section>
    </main>
  );
}
