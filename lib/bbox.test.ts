import { describe, it, expect } from "vitest";
import { bboxToPixels, bboxCenter } from "./bbox";

describe("bboxToPixels", () => {
  it("converts [ymin=100, xmin=200, ymax=300, xmax=400] on 1000x1000 to {x:200, y:100, width:200, height:200}", () => {
    const result = bboxToPixels([100, 200, 300, 400], 1000, 1000);
    expect(result).toEqual({ x: 200, y: 100, width: 200, height: 200 });
  });

  it("scales correctly for non-square images", () => {
    const result = bboxToPixels([0, 0, 500, 1000], 800, 600);
    expect(result).toEqual({ x: 0, y: 0, width: 800, height: 300 });
  });

  it("handles full-image bbox", () => {
    const result = bboxToPixels([0, 0, 1000, 1000], 1920, 1080);
    expect(result).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
  });
});

describe("bboxCenter", () => {
  it("returns center of bbox", () => {
    const result = bboxCenter([0, 0, 1000, 1000], 100, 100);
    expect(result).toEqual({ x: 50, y: 50 });
  });
});
