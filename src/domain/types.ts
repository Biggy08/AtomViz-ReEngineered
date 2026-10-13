export type Vec3 = [number, number, number];
export type Module = "viewer" | "rdf" | "coordination" | "bonds" | "diffusion";
export interface Species {
  name: string;
  legacyValue: number;
  start: number;
  end: number;
}
export interface Frame {
  step: number;
  positions: Float64Array;
}
export interface Dataset {
  name: string;
  atomCount: number;
  frames: Frame[];
  species: Species[];
  rawHeader: string[];
  trajectoryName: string;
  speciesName: string;
  hashes: { trajectory: string; species: string };
}
export interface Metadata {
  confirmed: boolean;
  coordinates: "fractional" | "cartesian";
  cell: Vec3;
  lengthUnit: "Å" | "nm";
  periodic: boolean;
  timePerStep: number;
  timeUnit: "ps" | "fs";
  unwrapped: boolean;
}
export interface Parameters {
  module: Module;
  first: string;
  second: string;
  start: number;
  end: number;
  cutoff: number;
  bins: number;
  fitStart: number;
  fitEnd: number;
  removeDrift: boolean;
}
export interface Result {
  module: Module;
  title: string;
  method: string;
  version: string;
  columns: string[];
  rows: number[][];
  xLabel: string;
  yLabel: string;
  series: { column: number; label: string }[];
  summary: { label: string; value: number; unit?: string }[];
  notes: string[];
  metadata: Metadata;
  parameters: Parameters;
  input: {
    name: string;
    atoms: number;
    frames: number;
    hashes: Dataset["hashes"];
    files: string[];
  };
}
export type WorkerRequest =
  | {
      kind: "parse";
      trajectory: string;
      species: string;
      trajectoryName: string;
      speciesName: string;
      hashes: Dataset["hashes"];
    }
  | {
      kind: "analyze";
      dataset: Dataset;
      metadata: Metadata;
      parameters: Parameters;
    };
export type WorkerResponse =
  | { kind: "progress"; value: number; message: string }
  | { kind: "dataset"; dataset: Dataset }
  | { kind: "result"; result: Result }
  | { kind: "error"; message: string };
