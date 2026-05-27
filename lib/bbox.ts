// Gemini returns [ymin, xmin, ymax, xmax] in 0-1000 normalized space.
// Convert to pixel rectangle for canvas drawing.
export function bboxToPixels(
  bbox: [number, number, number, number],
  imgWidth: number,
  imgHeight: number
) {
  const [ymin, xmin, ymax, xmax] = bbox;
  return {
    x: (xmin / 1000) * imgWidth,
    y: (ymin / 1000) * imgHeight,
    width: ((xmax - xmin) / 1000) * imgWidth,
    height: ((ymax - ymin) / 1000) * imgHeight,
  };
}

export function bboxCenter(
  bbox: [number, number, number, number],
  imgWidth: number,
  imgHeight: number
) {
  const r = bboxToPixels(bbox, imgWidth, imgHeight);
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}
