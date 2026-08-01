import Image from "next/image";
import Link from "next/link";

export default function PrototypePage() {
  return (
    <main>
      <Link className="back" href="/">
        ← 返回 Gate 0 状态
      </Link>
      <header className="hero prototype-heading">
        <div>
          <p className="eyebrow">Historical visual reference · v0.1</p>
          <h1>IntentTrace UI 原型</h1>
          <p className="lede">
            该图片只定义视觉方向；其中所有数据、模型、成本和测试结果均为 fixture。
          </p>
        </div>
      </header>
      <div className="prototype-frame">
        <Image
          src="/intenttrace_ui_preview.png"
          alt="IntentTrace 三栏布局视觉原型：Trace 列表、Intent Graph、Gantt 与 Evidence Inspector"
          width={1800}
          height={1400}
          priority
        />
      </div>
    </main>
  );
}
