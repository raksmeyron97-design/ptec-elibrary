export type ChartCoordinate = { x: number; y: number };
export type CubicSegment = {
  start: ChartCoordinate;
  control1: ChartCoordinate;
  control2: ChartCoordinate;
  end: ChartCoordinate;
};

function finitePoints(points: readonly ChartCoordinate[]): void {
  for (let index = 0; index < points.length; index++) {
    const point = points[index];
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      throw new Error(`Chart point ${index} must be finite`);
    }
    if (index > 0 && point.x <= points[index - 1].x) {
      throw new Error("Chart x coordinates must be strictly increasing");
    }
  }
}

function endpointSlope(h0: number, h1: number, delta0: number, delta1: number): number {
  let slope = ((2 * h0 + h1) * delta0 - h0 * delta1) / (h0 + h1);
  if (Math.sign(slope) !== Math.sign(delta0)) return 0;
  if (Math.sign(delta0) !== Math.sign(delta1) && Math.abs(slope) > Math.abs(3 * delta0)) {
    slope = 3 * delta0;
  }
  return slope;
}

/** Piecewise-cubic Hermite interpolation with shape-preserving PCHIP slopes. */
export function monotoneSegments(points: readonly ChartCoordinate[]): CubicSegment[] {
  finitePoints(points);
  if (points.length < 2) return [];

  const intervals = points.slice(1).map((point, index) => point.x - points[index].x);
  const secants = points.slice(1).map(
    (point, index) => (point.y - points[index].y) / intervals[index],
  );
  const slopes = new Array<number>(points.length);

  if (points.length === 2) {
    slopes[0] = secants[0];
    slopes[1] = secants[0];
  } else {
    slopes[0] = endpointSlope(intervals[0], intervals[1], secants[0], secants[1]);
    const last = points.length - 1;
    slopes[last] = endpointSlope(
      intervals[last - 1],
      intervals[last - 2],
      secants[last - 1],
      secants[last - 2],
    );
    for (let index = 1; index < last; index++) {
      const before = secants[index - 1];
      const after = secants[index];
      if (before === 0 || after === 0 || Math.sign(before) !== Math.sign(after)) {
        slopes[index] = 0;
      } else {
        const beforeWidth = intervals[index - 1];
        const afterWidth = intervals[index];
        const weight1 = 2 * afterWidth + beforeWidth;
        const weight2 = afterWidth + 2 * beforeWidth;
        slopes[index] = (weight1 + weight2) / (weight1 / before + weight2 / after);
      }
    }
  }

  return points.slice(1).map((end, index) => {
    const start = points[index];
    const width = end.x - start.x;
    return {
      start,
      control1: { x: start.x + width / 3, y: start.y + (slopes[index] * width) / 3 },
      control2: { x: end.x - width / 3, y: end.y - (slopes[index + 1] * width) / 3 },
      end,
    };
  });
}

function number(value: number): string {
  const rounded = Math.round(value * 1_000) / 1_000;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

export function monotonePath(points: readonly ChartCoordinate[]): string {
  finitePoints(points);
  if (points.length === 0) return "";
  const start = points[0];
  const segments = monotoneSegments(points);
  return [
    `M${number(start.x)},${number(start.y)}`,
    ...segments.map(
      (segment) =>
        `C${number(segment.control1.x)},${number(segment.control1.y)} ` +
        `${number(segment.control2.x)},${number(segment.control2.y)} ` +
        `${number(segment.end.x)},${number(segment.end.y)}`,
    ),
  ].join(" ");
}

export function monotoneAreaPath(points: readonly ChartCoordinate[], baselineY: number): string {
  if (points.length === 0) return "";
  return `${monotonePath(points)} L${number(points.at(-1)!.x)},${number(baselineY)} ` +
    `L${number(points[0].x)},${number(baselineY)} Z`;
}

export function niceChartMaximum(maximum: number): number {
  const safe = Math.max(1, maximum);
  const roughStep = safe / 4;
  const power = 10 ** Math.floor(Math.log10(roughStep));
  const scaled = roughStep / power;
  const niceStep = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
  return Math.max(4, niceStep * power * 4);
}

export type ChartGeometry = {
  width: number;
  height: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  innerWidth: number;
  innerHeight: number;
  maximum: number;
  x: (index: number, count: number) => number;
  y: (value: number) => number;
  ticks: Array<{ value: number; y: number }>;
};

export function createChartGeometry(input: {
  width: number;
  height: number;
  maximum: number;
  left?: number;
  right?: number;
  top?: number;
  bottom?: number;
}): ChartGeometry {
  const left = input.left ?? 42;
  const right = input.right ?? 12;
  const top = input.top ?? 14;
  const bottom = input.bottom ?? 30;
  const innerWidth = Math.max(1, input.width - left - right);
  const innerHeight = Math.max(1, input.height - top - bottom);
  const maximum = niceChartMaximum(input.maximum);
  const x = (index: number, count: number) =>
    left + (count > 1 ? (index / (count - 1)) * innerWidth : innerWidth / 2);
  const y = (value: number) => top + innerHeight - (Math.max(0, value) / maximum) * innerHeight;
  const ticks = Array.from({ length: 5 }, (_, index) => {
    const value = (maximum * index) / 4;
    return { value, y: y(value) };
  });
  return {
    width: input.width,
    height: input.height,
    left,
    right,
    top,
    bottom,
    innerWidth,
    innerHeight,
    maximum,
    x,
    y,
    ticks,
  };
}

/** Evenly sample interactive markers while retaining both endpoints. */
export function visiblePointIndexes(pointCount: number, maximum: number): number[] {
  if (pointCount <= 0 || maximum <= 0) return [];
  if (pointCount <= maximum) return Array.from({ length: pointCount }, (_, index) => index);
  const indexes = new Set<number>();
  for (let slot = 0; slot < maximum; slot++) {
    indexes.add(Math.round((slot * (pointCount - 1)) / (maximum - 1)));
  }
  return [...indexes].sort((a, b) => a - b);
}
