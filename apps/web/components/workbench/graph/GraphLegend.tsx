const swatches: Array<{ color: string; label: string }> = [
  { color: "bg-accent", label: "Intent/work" },
  { color: "bg-red", label: "Issue" },
  { color: "bg-green", label: "Result" },
  { color: "bg-pink", label: "Handoff edge (dashed)" },
];

export function GraphLegend() {
  return (
    <div className="flex items-center gap-3 rounded-[9px] border border-line bg-panel/88 px-2.5 py-1.5 backdrop-blur">
      {swatches.map((swatch) => (
        <span key={swatch.label} className="flex items-center gap-1.5 text-micro text-muted">
          <span aria-hidden className={`size-2 rounded-sm ${swatch.color}`} />
          {swatch.label}
        </span>
      ))}
    </div>
  );
}
