import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseLegacy, parseSpecies } from "../src/parsers/legacy";
import { runAnalysis } from "../src/analysis/run";
import { distance } from "../src/numerics/geometry";
import { toCsv } from "../src/exports/results";
import type { Dataset, Metadata, Parameters } from "../src/domain/types";
const meta: Metadata = {
  confirmed: true,
  coordinates: "cartesian",
  cell: [10, 10, 10],
  lengthUnit: "Å",
  periodic: true,
  timePerStep: 1,
  timeUnit: "ps",
  unwrapped: false,
};
const params: Parameters = {
  module: "rdf",
  first: "A",
  second: "B",
  start: 0,
  end: 0,
  cutoff: 2,
  bins: 2,
  fitStart: 0,
  fitEnd: 2,
  removeDrift: false,
};
function dataset(rows: number[][]): Dataset {
  return {
    name: "Synthetic test fixture",
    atomCount: 2,
    frames: rows.map((r, i) => ({ step: i, positions: new Float64Array(r) })),
    species: [
      { name: "A", legacyValue: 1, start: 0, end: 0 },
      { name: "B", legacyValue: 2, start: 1, end: 1 },
    ],
    rawHeader: [],
    trajectoryName: "synthetic",
    speciesName: "synthetic-species",
    hashes: { trajectory: "test", species: "test" },
  };
}
const header = "2 2\n1 10 10 10 1\n3000\nCAR\nfixture\n";
const trajectory =
  header +
  "Direct configuration= 0\n0 0 0\n0.1 0 0\nDirect configuration= 1000\n0 0 0\n0.2 0 0\n";
const species =
  "#Species\n#AtomicName AtomicWeight StartIndex EndIndex\nA 1 0 0\nB 2 1 1\n";
describe("strict input parser", () => {
  it("reads frames, preserves raw metadata, accepts scientific notation", () => {
    const data = parseLegacy(trajectory.replace("0.1", "1D-1"), species);
    expect(data.frames).toHaveLength(2);
    expect(data.frames[0].positions[3]).toBe(0.1);
    expect(data.rawHeader[1]).toBe("1 10 10 10 1");
    expect(data.species[1].legacyValue).toBe(2);
  });
  it.each([
    [trajectory.replace("2 2", "2 3"), /counts/],
    [trajectory.replace("0.1 0 0", "NaN 0 0"), /invalid number/],
    [
      trajectory.replace("configuration= 1000", "configuration= 0"),
      /increasing/,
    ],
    [trajectory.replace("0.2 0 0\n", ""), /missing/],
    [trajectory.replace("CAR", "XYZ"), /marker/],
    [trajectory + "5 5 5\n", /expected Direct/],
  ])("rejects malformed trajectories", (text, pattern) =>
    expect(() => parseLegacy(text as string, species)).toThrow(
      pattern as RegExp,
    ),
  );
  it("rejects overlap, gaps, invalid bounds, duplicate names", () => {
    expect(() => parseSpecies("#Species\nA 1 0 1\nB 2 1 1", 2)).toThrow(
      /overlap/,
    );
    expect(() => parseSpecies("#Species\nA 1 0 0", 2)).toThrow(/cover/);
    expect(() => parseSpecies("#Species\nA 1 -1 1", 2)).toThrow(/range/);
    expect(() => parseSpecies("#Species\nA 1 0 0\nA 2 1 1", 2)).toThrow(
      /unique/,
    );
  });
  it.each([
    ["reduced", 160, 205],
    ["oxidized", 164, 206],
  ])("validates supplied %s dataset", (name, atoms, frames) => {
    const file =
      name === "reduced"
        ? "mg32s32o92s4-reducedMelt"
        : "mg32s32o96s4-oxidizedMelt";
    const data = parseLegacy(
      readFileSync(`public/examples/${file}`, "utf8"),
      readFileSync(`public/examples/SPECIES_FILE_${name}`, "utf8"),
    );
    expect(data.atomCount).toBe(atoms);
    expect(data.frames.length).toBe(frames);
    expect(
      data.frames.every((f) => f.positions.length === Number(atoms) * 3),
    ).toBe(true);
  });
});
describe("orthorhombic geometry", () => {
  it("computes exact Cartesian and periodic distances", () => {
    const p = new Float64Array([0, 0, 0, 3, 4, 0]);
    expect(distance(p, 0, 1, { ...meta, periodic: false })).toBe(5);
    expect(
      distance(new Float64Array([0.1, 0, 0, 9.9, 0, 0]), 0, 1, meta),
    ).toBeCloseTo(0.2);
    expect(
      distance(new Float64Array([0.01, 0, 0, 0.99, 0, 0]), 0, 1, {
        ...meta,
        coordinates: "fractional",
      }),
    ).toBeCloseTo(0.2);
  });
});
describe("coordination and RDF", () => {
  const data = dataset([[0, 0, 0, 1, 0, 0]]);
  it("counts neighbors and excludes exact cutoff and self pairs", () => {
    const r = runAnalysis(data, meta, { ...params, module: "coordination" });
    expect(r.rows).toEqual([[1, 1, 1]]);
    expect(r.summary[0].value).toBe(1);
    expect(
      runAnalysis(data, meta, { ...params, module: "coordination", cutoff: 1 })
        .rows,
    ).toEqual([[0, 1, 1]]);
    expect(
      runAnalysis(data, meta, {
        ...params,
        module: "coordination",
        first: "*",
        second: "*",
      }).rows,
    ).toEqual([[1, 1, 2]]);
  });
  it("matches hand-calculated shell volumes and exact bin edges", () => {
    const r = runAnalysis(data, meta, params);
    expect(r.rows[0][1]).toBe(0);
    expect(r.rows[1][1]).toBeCloseTo(
      1000 / (((4 * Math.PI) / 3) * (8 - 1)),
      10,
    );
    expect(r.rows[1][2]).toBe(1);
    expect(
      runAnalysis(data, meta, { ...params, first: "*", second: "*" })
        .rows[1][1],
    ).toBeCloseTo(r.rows[1][1]);
  });
  it("averages frames equally and supports periodic neighbor wrapping", () => {
    const r = runAnalysis(
      dataset([
        [0, 0, 0, 1, 0, 0],
        [0, 0, 0, 3, 0, 0],
      ]),
      meta,
      { ...params, end: 1 },
    );
    expect(r.rows[1][2]).toBe(0.5);
    expect(
      runAnalysis(dataset([[0.1, 0, 0, 9.9, 0, 0]]), meta, {
        ...params,
        module: "coordination",
        cutoff: 0.3,
      }).summary[0].value,
    ).toBe(1);
  });
  it("rejects unconfirmed metadata, unsupported RDF geometry and invalid parameters", () => {
    expect(() =>
      runAnalysis(data, { ...meta, confirmed: false }, params),
    ).toThrow(/Confirm/);
    expect(() =>
      runAnalysis(data, { ...meta, cell: [0, 1, 1] }, params),
    ).toThrow(/Cell/);
    expect(() => runAnalysis(data, meta, { ...params, cutoff: 6 })).toThrow(
      /half/,
    );
    expect(() =>
      runAnalysis(data, { ...meta, periodic: false }, params),
    ).toThrow(/periodic/);
    expect(() => runAnalysis(data, meta, { ...params, bins: 2.5 })).toThrow(
      /bins/,
    );
    expect(() => runAnalysis(data, meta, { ...params, start: -1 })).toThrow(
      /range/,
    );
    expect(() => runAnalysis(data, meta, { ...params, first: "C" })).toThrow(
      /Unknown/,
    );
  });
});
describe("bond persistence", () => {
  it("distinguishes broken/reformed bonds and reports censored runs", () => {
    const d = dataset([
      [0, 0, 0, 1, 0, 0],
      [0, 0, 0, 4, 0, 0],
      [0, 0, 0, 1, 0, 0],
    ]);
    const r = runAnalysis(d, meta, { ...params, module: "bonds", end: 2 });
    expect(r.rows).toEqual([
      [0, 1, 1, 2],
      [1, 0, 0, 1],
      [2, 1, 0, 1],
    ]);
    expect(r.summary[0].value).toBe(2);
    expect(r.summary[1].value).toBe(1);
    expect(
      runAnalysis(d, meta, {
        ...params,
        module: "bonds",
        first: "*",
        second: "*",
        end: 2,
      }).summary[2].value,
    ).toBe(1);
  });
  it("rejects irregular sampling and absence of bonds", () => {
    const d = dataset([
      [0, 0, 0, 1, 0, 0],
      [0, 0, 0, 1, 0, 0],
      [0, 0, 0, 1, 0, 0],
    ]);
    d.frames[2].step = 3;
    expect(() =>
      runAnalysis(d, meta, { ...params, module: "bonds", end: 2 }),
    ).toThrow(/evenly/);
    expect(() =>
      runAnalysis(
        dataset([
          [0, 0, 0, 4, 0, 0],
          [0, 0, 0, 4, 0, 0],
        ]),
        meta,
        { ...params, module: "bonds", end: 1 },
      ),
    ).toThrow(/No geometric bonds/);
  });
});
describe("MSD and fitting", () => {
  const p = { ...params, module: "diffusion" as const, end: 2 };
  const m = { ...meta, unwrapped: true };
  it("calculates stationary, ballistic and drift-subtracted MSD", () => {
    expect(
      runAnalysis(
        dataset([
          [0, 0, 0, 1, 0, 0],
          [0, 0, 0, 1, 0, 0],
          [0, 0, 0, 1, 0, 0],
        ]),
        m,
        p,
      ).rows.map((r) => r[4]),
    ).toEqual([0, 0, 0]);
    const d = dataset([
      [0, 0, 0, 1, 0, 0],
      [1, 0, 0, 2, 0, 0],
      [2, 0, 0, 3, 0, 0],
    ]);
    const r = runAnalysis(d, m, p);
    expect(r.rows.map((r) => r[4])).toEqual([0, 1, 4]);
    expect(r.summary[0].value).toBeCloseTo(1 / 3);
    expect(
      runAnalysis(d, m, { ...p, removeDrift: true }).rows.map((r) => r[4]),
    ).toEqual([0, 0, 0]);
  });
  it("uses unwrapped coordinates across periodic cells and actual label times", () => {
    const d = dataset([
      [9, 0, 0, 0, 0, 0],
      [11, 0, 0, 0, 0, 0],
      [13, 0, 0, 0, 0, 0],
    ]);
    d.frames.forEach((f, i) => (f.step = i * 1000));
    const r = runAnalysis(d, { ...m, timePerStep: 0.001 }, p);
    expect(r.rows.map((r) => r[0])).toEqual([0, 1, 2]);
    expect(r.rows.map((r) => r[4])).toEqual([0, 4, 16]);
  });
  it("rejects ambiguous periodic data and invalid fit/time ranges", () => {
    const d = dataset([
      [0, 0, 0, 1, 0, 0],
      [0, 0, 0, 1, 0, 0],
      [0, 0, 0, 1, 0, 0],
    ]);
    expect(() => runAnalysis(d, meta, p)).toThrow(/unwrapped/);
    expect(() => runAnalysis(d, { ...m, timePerStep: 0 }, p)).toThrow(/time/);
    expect(() => runAnalysis(d, m, { ...p, fitEnd: 1 })).toThrow(/three/);
  });
});
describe("reproducible export", () => {
  it("exports all columns and method/input metadata as round-trippable JSON and CSV", () => {
    const r = runAnalysis(dataset([[0, 0, 0, 1, 0, 0]]), meta, params);
    const copy = JSON.parse(JSON.stringify(r));
    expect(copy.rows).toEqual(r.rows);
    const csv = toCsv(r);
    expect(csv).toContain("atomviz-replacement-1.0");
    expect(csv).toContain("test");
    expect(csv).toContain("radius (Å)");
    expect(csv.split("\n").filter((l) => l.startsWith('"'))).toHaveLength(3);
  });
});
