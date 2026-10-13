import type { Metadata } from "../domain/types";
export function position(
  values: Float64Array,
  atom: number,
  axis: number,
  meta: Metadata,
): number {
  return (
    values[atom * 3 + axis] *
    (meta.coordinates === "fractional" ? meta.cell[axis] : 1)
  );
}
export function distance(
  values: Float64Array,
  a: number,
  b: number,
  meta: Metadata,
): number {
  let sum = 0;
  for (let axis = 0; axis < 3; axis++) {
    let d = position(values, a, axis, meta) - position(values, b, axis, meta);
    if (meta.periodic) d -= Math.round(d / meta.cell[axis]) * meta.cell[axis];
    sum += d * d;
  }
  return Math.sqrt(sum);
}
export function linearFit(points: [number, number][]): {
  slope: number;
  intercept: number;
  r2: number | null;
} {
  if (points.length < 3)
    throw new Error("Fit requires at least three time points.");
  const mx = points.reduce((s, p) => s + p[0], 0) / points.length;
  const my = points.reduce((s, p) => s + p[1], 0) / points.length;
  let xx = 0,
    xy = 0,
    yy = 0;
  for (const [x, y] of points) {
    xx += (x - mx) ** 2;
    xy += (x - mx) * (y - my);
    yy += (y - my) ** 2;
  }
  if (xx === 0) throw new Error("Fit times must differ.");
  const slope = xy / xx;
  return {
    slope,
    intercept: my - slope * mx,
    r2: yy === 0 ? null : (xy * xy) / (xx * yy),
  };
}
