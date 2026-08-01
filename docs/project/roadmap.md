---
status: accepted
owner: program
last_reviewed: 2026-08-01
normative: false
milestone: Gate 0-Gate 5
---

# Roadmap

| Gate            | 用户可见能力                    | 工程退出信号                       |
| --------------- | ------------------------------- | ---------------------------------- |
| 0 Foundation    | 真实状态/健康页与历史原型入口   | 全部基础检查、Compose、migration×2 |
| 1 Ingest        | 四来源可显式导入/跟随           | 2k fixture、幂等、rotation         |
| 2 Raw           | raw list/inspector/Gantt/replay | raw-only degraded、durable SSE     |
| 3 Mock semantic | 可信 mock Graph/Evidence 联动   | reducer/golden/property/a11y       |
| 4 Providers     | 显式、安全的真实 provider       | egress/XSS/injection/outage        |
| 5 Harden        | human revision、恢复、性能      | acceptance matrix、release drill   |

Roadmap 不承诺日期；每 Gate 的质量证据决定进入时点。Run comparison、移动端、公网 SaaS、HA、gRPC 和 embeddings 不在 MVP roadmap。
