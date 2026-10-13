import type { Dataset, Metadata, Parameters, Result } from "../domain/types";
import { distance, position, linearFit } from "../numerics/geometry";

const indices = (data: Dataset, name: string): number[] => {
  if (name === "*") return Array.from({ length: data.atomCount }, (_, i) => i);
  const s = data.species.find((s) => s.name === name);
  if (!s) throw new Error(`Unknown species: ${name}.`);
  return Array.from({ length: s.end - s.start + 1 }, (_, i) => s.start + i);
};
export function runAnalysis(
  data: Dataset,
  meta: Metadata,
  p: Parameters,
  progress: (value: number) => void = () => {},
): Result {
  if (!meta.confirmed)
    throw new Error(
      "Confirm coordinate interpretation, length unit, and orthorhombic cell before analysis.",
    );
  if (
    meta.cell.length !== 3 ||
    meta.cell.some((v) => !Number.isFinite(v) || v <= 0 || v > 1e9)
  )
    throw new Error(
      "Cell lengths must be finite, positive, and at most 1e9 in the chosen unit.",
    );
  if (
    !["fractional", "cartesian"].includes(meta.coordinates) ||
    !["Å", "nm"].includes(meta.lengthUnit)
  )
    throw new Error("Unsupported coordinate metadata.");
  if (
    !Number.isInteger(p.start) ||
    !Number.isInteger(p.end) ||
    p.start < 0 ||
    p.end >= data.frames.length ||
    p.end < p.start
  )
    throw new Error("Invalid inclusive frame range.");
  if (p.module === "viewer") throw new Error("Choose an analysis module.");
  const frames = data.frames.slice(p.start, p.end + 1);
  const A = indices(data, p.first),
    B = indices(data, p.second);
  const result: Result = {
    module: p.module,
    title: "",
    method: "",
    version: "atomviz-replacement-1.0",
    columns: [],
    rows: [],
    xLabel: "",
    yLabel: "",
    series: [],
    summary: [],
    notes: [
      "Documented replacement method; not verified against original AtomViz outputs.",
      "Constant orthorhombic cell; stable atom identities follow file row order.",
    ],
    metadata: { ...meta, cell: [...meta.cell] },
    parameters: { ...p },
    input: {
      name: data.name,
      atoms: data.atomCount,
      frames: data.frames.length,
      hashes: data.hashes,
      files: [data.trajectoryName, data.speciesName],
    },
  };
  if (p.module === "diffusion") {
    if (frames.length < 3)
      throw new Error("MSD analysis requires at least three selected frames.");
    if (meta.periodic && !meta.unwrapped)
      throw new Error(
        "Periodic MSD requires confirmed unwrapped coordinates. Sparse wrapped trajectories cannot determine all boundary crossings.",
      );
    if (
      !Number.isFinite(meta.timePerStep) ||
      meta.timePerStep <= 0 ||
      !["ps", "fs"].includes(meta.timeUnit)
    )
      throw new Error(
        "Set a positive time per configuration-label increment and its unit.",
      );
    if (
      !Number.isInteger(p.fitStart) ||
      !Number.isInteger(p.fitEnd) ||
      p.fitStart < p.start ||
      p.fitEnd > p.end ||
      p.fitEnd - p.fitStart < 2
    )
      throw new Error(
        "Fit interval must contain at least three frames within the analysis range.",
      );
    const ref = frames[0];
    for (let f = 0; f < frames.length; f++) {
      const drift = [0, 0, 0];
      if (p.removeDrift)
        for (const atom of A)
          for (let axis = 0; axis < 3; axis++)
            drift[axis] +=
              (position(frames[f].positions, atom, axis, meta) -
                position(ref.positions, atom, axis, meta)) /
              A.length;
      const msd = [0, 0, 0];
      for (const atom of A)
        for (let axis = 0; axis < 3; axis++)
          msd[axis] +=
            (position(frames[f].positions, atom, axis, meta) -
              position(ref.positions, atom, axis, meta) -
              drift[axis]) **
              2 /
            A.length;
      const time = (frames[f].step - ref.step) * meta.timePerStep;
      result.rows.push([time, ...msd, msd.reduce((s, v) => s + v, 0)]);
      progress((f + 1) / frames.length);
    }
    const fit = linearFit(
      result.rows
        .slice(p.fitStart - p.start, p.fitEnd - p.start + 1)
        .map((r) => [r[0], r[4]]),
    );
    result.title = "Mean-squared displacement";
    result.method =
      "Single-origin MSD with an unweighted linear fit and D = slope / 6 for three-dimensional isotropic diffusion.";
    result.columns = [
      `time (${meta.timeUnit})`,
      `MSD x (${meta.lengthUnit}²)`,
      `MSD y (${meta.lengthUnit}²)`,
      `MSD z (${meta.lengthUnit}²)`,
      `MSD total (${meta.lengthUnit}²)`,
    ];
    result.xLabel = result.columns[0];
    result.yLabel = `MSD (${meta.lengthUnit}²)`;
    result.series = [
      { column: 4, label: "Total MSD" },
      { column: 1, label: "x" },
      { column: 2, label: "y" },
      { column: 3, label: "z" },
    ];
    result.summary = [
      {
        label: "Estimated D",
        value: fit.slope / 6,
        unit: `${meta.lengthUnit}²/${meta.timeUnit}`,
      },
      ...(fit.r2 === null ? [] : [{ label: "Fit R²", value: fit.r2 }]),
      {
        label: "Fit intercept",
        value: fit.intercept,
        unit: `${meta.lengthUnit}²`,
      },
    ];
    if (fit.r2 === null)
      result.notes.push("R² is undefined for constant MSD and is omitted.");
    result.notes.push(
      "D is a fit estimate, not proof of a diffusive regime. Select a physically justified linear interval; no uncertainty interval is estimated.",
      p.removeDrift
        ? "Subtracts the selected group’s arithmetic mean displacement, not mass-weighted center of mass."
        : "No drift correction.",
    );
    if (fit.slope < 0)
      result.notes.push(
        "Negative slope: this interval does not support a positive diffusion estimate.",
      );
  } else {
    if (!Number.isFinite(p.cutoff) || p.cutoff <= 0)
      throw new Error("Cutoff must be a finite positive distance.");
    if (meta.periodic && p.cutoff > Math.min(...meta.cell) / 2)
      throw new Error(
        "Periodic cutoff must not exceed half the shortest cell length.",
      );
    if (frames.length * A.length * B.length > 200000000)
      throw new Error(
        "Selection exceeds 200 million pair checks. Reduce the frame range or species selection.",
      );
    if (p.module === "rdf") {
      if (!meta.periodic)
        throw new Error(
          "Normalized RDF currently requires a periodic orthorhombic bulk cell; nonperiodic boundary correction is not implemented.",
        );
      if (!Number.isInteger(p.bins) || p.bins < 2 || p.bins > 2000)
        throw new Error("RDF bins must be an integer from 2 to 2000.");
      const overlap = A.filter((a) => B.includes(a)).length;
      const possible = A.length * B.length - overlap;
      if (!possible)
        throw new Error("Species selection has no distinct atom pairs.");
      const counts = new Float64Array(p.bins);
      const width = p.cutoff / p.bins;
      for (let f = 0; f < frames.length; f++) {
        for (const a of A)
          for (const b of B)
            if (a !== b) {
              const d = distance(frames[f].positions, a, b, meta);
              if (d < p.cutoff)
                counts[Math.min(p.bins - 1, Math.floor(d / width))]++;
            }
        progress((f + 1) / frames.length);
      }
      const volume = meta.cell.reduce((a, b) => a * b, 1);
      let cumulative = 0;
      for (let i = 0; i < p.bins; i++) {
        const lo = i * width,
          hi = (i + 1) * width,
          shell = ((4 * Math.PI) / 3) * (hi ** 3 - lo ** 3);
        cumulative += counts[i];
        result.rows.push([
          (lo + hi) / 2,
          (counts[i] * volume) / (frames.length * possible * shell),
          cumulative / (frames.length * A.length),
          counts[i],
        ]);
      }
      result.title = "Radial distribution function";
      result.method =
        "Directed pair histogram divided by the ideal finite-population shell count; self pairs excluded; equal frame weighting.";
      result.columns = [
        `radius (${meta.lengthUnit})`,
        "g(r)",
        "cumulative coordination",
        "directed pair observations",
      ];
      result.xLabel = result.columns[0];
      result.yLabel = "g(r) (dimensionless)";
      result.series = [{ column: 1, label: `${p.first} → ${p.second}` }];
      result.summary = [
        { label: "Frames averaged", value: frames.length },
        { label: "Pairs observed", value: counts.reduce((s, v) => s + v, 0) },
        {
          label: "Coordination at cutoff",
          value: cumulative / (frames.length * A.length),
        },
      ];
      result.notes.push(
        "Radial bins are [lower, upper); distances equal to the maximum cutoff are excluded.",
        "Normalization uses N_A N_B − |A ∩ B|, including N(N−1) for identical populations. Applicable to homogeneous 3D bulk systems.",
      );
    } else if (p.module === "coordination") {
      const distribution = new Map<number, number>();
      let total = 0;
      for (let f = 0; f < frames.length; f++) {
        for (const a of A) {
          let n = 0;
          for (const b of B)
            if (a !== b && distance(frames[f].positions, a, b, meta) < p.cutoff)
              n++;
          distribution.set(n, (distribution.get(n) ?? 0) + 1);
          total += n;
        }
        progress((f + 1) / frames.length);
      }
      result.title = "Coordination distribution";
      result.method =
        "Count selected neighbor atoms strictly within cutoff of each central atom; self pairs excluded; equal atom-frame weighting.";
      result.columns = [
        "neighbors per central atom",
        "fraction of atom-frames",
        "atom-frame count",
      ];
      result.rows = [...distribution]
        .sort((a, b) => a[0] - b[0])
        .map(([n, count]) => [n, count / (A.length * frames.length), count]);
      result.xLabel = "Coordination number";
      result.yLabel = "Fraction of atom-frames";
      result.series = [{ column: 1, label: `${p.first} → ${p.second}` }];
      result.summary = [
        {
          label: "Mean coordination",
          value: total / (A.length * frames.length),
        },
        { label: "Central atoms", value: A.length },
        { label: "Frames averaged", value: frames.length },
      ];
      result.notes.push(
        "A geometric neighbor criterion; no chemical bond inference.",
      );
    } else if (p.module === "bonds") {
      if (frames.length < 2)
        throw new Error(
          "Bond persistence requires at least two selected frames.",
        );
      const delta = frames[1].step - frames[0].step;
      if (frames.some((f, i) => i > 0 && f.step - frames[i - 1].step !== delta))
        throw new Error(
          "Bond persistence currently requires evenly spaced configuration labels.",
        );
      const pairs: [number, number][] = [];
      const keys = new Set<string>();
      for (const a of A)
        for (const b of B)
          if (a !== b) {
            const key = `${Math.min(a, b)}:${Math.max(a, b)}`;
            if (!keys.has(key)) {
              keys.add(key);
              pairs.push([a, b]);
            }
          }
      if ((pairs.length * frames.length * frames.length) / 2 > 200000000)
        throw new Error(
          "Bond correlation exceeds 200 million origin-lag checks. Reduce the selection.",
        );
      const numerator = new Float64Array(frames.length),
        survived = new Float64Array(frames.length),
        denominator = new Float64Array(frames.length);
      let observed = 0;
      let censored = 0;
      for (let k = 0; k < pairs.length; k++) {
        const [a, b] = pairs[k];
        const h = frames.map((f) =>
          distance(f.positions, a, b, meta) < p.cutoff ? 1 : 0,
        );
        let nextBreak = frames.length;
        const breakAt = new Int32Array(frames.length);
        for (let t = frames.length - 1; t >= 0; t--) {
          if (!h[t]) nextBreak = t;
          breakAt[t] = nextBreak;
        }
        for (let t = 0; t < h.length; t++)
          if (h[t]) {
            if (t === 0 || !h[t - 1]) {
              observed++;
              if (breakAt[t] === h.length) censored++;
            }
            for (let lag = 0; lag < h.length - t; lag++) {
              denominator[lag]++;
              numerator[lag] += h[t + lag];
              if (t + lag < breakAt[t]) survived[lag]++;
            }
          }
        if (k % 20 === 0) progress((k + 1) / pairs.length);
      }
      for (let lag = 0; lag < frames.length; lag++)
        if (denominator[lag])
          result.rows.push([
            lag * delta,
            numerator[lag] / denominator[lag],
            survived[lag] / denominator[lag],
            denominator[lag],
          ]);
      if (!result.rows.length)
        throw new Error(
          "No geometric bonds found for this cutoff and selection.",
        );
      result.title = "Bond persistence";
      result.method =
        "All eligible bonded time origins: intermittent endpoint correlation and uninterrupted continuous persistence, normalized by origin count at each lag.";
      result.columns = [
        "lag (configuration-label increments)",
        "intermittent correlation",
        "continuous persistence",
        "eligible bonded origins",
      ];
      result.xLabel = result.columns[0];
      result.yLabel = "Persistence (dimensionless)";
      result.series = [
        { column: 1, label: "Intermittent" },
        { column: 2, label: "Continuous" },
      ];
      result.summary = [
        { label: "Observed bonded runs", value: observed },
        { label: "Runs continuing at final frame", value: censored },
        { label: "Candidate atom pairs", value: pairs.length },
      ];
      result.notes.push(
        "Undirected pairs counted once; cutoff equality excluded. Reformed bonds contribute to intermittent correlation, not continuous persistence.",
        "The origin set changes with lag; curves need not be monotone. Long lags have fewer origins.",
        "Runs at the first frame are left-censored; runs continuing at the last frame are right-censored. No mean lifetime is inferred from truncated runs. Lag uses raw configuration labels, not assumed time units.",
      );
    } else throw new Error("Unknown analysis module.");
  }
  if (result.rows.some((row) => row.some((v) => !Number.isFinite(v))))
    throw new Error("Non-finite result: check coordinate and time scales.");
  if (result.summary.some((s) => !Number.isFinite(s.value)))
    throw new Error("Non-finite summary: check metadata.");
  progress(1);
  return result;
}
