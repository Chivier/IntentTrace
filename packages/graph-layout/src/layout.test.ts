import { describe, expect, it } from "vitest";

import { ElkIncrementalLayout } from "./index.js";

describe("ELK incremental layout", () => {
  it("preserves pinned and explicitly unchanged node positions", async () => {
    const result = await new ElkIncrementalLayout().layout(
      [
        { id: "a", width: 100, height: 60, pinnedPosition: { x: 12, y: 18 } },
        { id: "b", width: 100, height: 60, unchanged: true, previousPosition: { x: 220, y: 40 } },
        { id: "c", width: 100, height: 60 },
      ],
      [
        { id: "e1", source: "a", target: "b" },
        { id: "e2", source: "b", target: "c" },
      ],
    );
    expect(result[0]).toMatchObject({ x: 12, y: 18 });
    expect(result[1]).toMatchObject({ x: 220, y: 40 });
    expect(Number.isFinite(result[2]?.x)).toBe(true);
  });
});
