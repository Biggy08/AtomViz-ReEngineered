import type { Dataset, Frame, Species } from "../domain/types";
const numeric = (v: string, context: string) => {
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eEdD][+-]?\d+)?$/.test(v))
    throw new Error(`${context}: invalid number “${v}”.`);
  const n = Number(v.replace(/[dD]/, "e"));
  if (!Number.isFinite(n))
    throw new Error(`${context}: values must be finite.`);
  return n;
};
export function parseSpecies(text: string, atoms: number): Species[] {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines[0] !== "#Species")
    throw new Error("Species file must begin with #Species.");
  const occupied = new Uint8Array(atoms);
  const names = new Set<string>();
  const species = lines
    .filter((l) => !l.startsWith("#"))
    .map((line, index) => {
      const cols = line.split(/\s+/);
      if (cols.length !== 4 || !/^[A-Za-z][A-Za-z0-9_-]*$/.test(cols[0]))
        throw new Error(
          `Species row ${index + 1}: expected name, legacy value, start, end.`,
        );
      const [legacyValue, start, end] = cols
        .slice(1)
        .map((v) => numeric(v, "Species"));
      if (
        !Number.isInteger(start) ||
        !Number.isInteger(end) ||
        start < 0 ||
        end < start ||
        end >= atoms
      )
        throw new Error(
          "Species index range is invalid or outside the atom count.",
        );
      if (names.has(cols[0])) throw new Error("Species names must be unique.");
      names.add(cols[0]);
      for (let i = start; i <= end; i++) {
        if (occupied[i]) throw new Error("Species ranges overlap.");
        occupied[i] = 1;
      }
      return { name: cols[0], legacyValue, start, end };
    });
  if (!species.length || occupied.some((v) => v === 0))
    throw new Error("Species ranges must cover every atom exactly once.");
  return species;
}
export function parseLegacy(
  trajectory: string,
  speciesText: string,
  progress: (n: number) => void = () => {},
): Omit<Dataset, "hashes" | "trajectoryName" | "speciesName"> {
  const lines = trajectory
    .replace(/^\uFEFF/, "")
    .trimEnd()
    .split(/\r?\n/);
  if (lines.length < 7)
    throw new Error(
      "Trajectory is incomplete: expected five header lines and at least one frame.",
    );
  const counts = lines[0]
    .trim()
    .split(/\s+/)
    .map((v) => numeric(v, "Atom counts"));
  if (
    counts.length !== 2 ||
    counts[0] !== counts[1] ||
    !Number.isSafeInteger(counts[0]) ||
    counts[0] < 1 ||
    counts[0] > 100000
  )
    throw new Error(
      "Expected two equal positive integer atom counts (maximum 100,000).",
    );
  const headerNumbers = lines[1]
    .trim()
    .split(/\s+/)
    .map((v) => numeric(v, "Numeric header"));
  if (headerNumbers.length !== 5)
    throw new Error(
      "Unsupported numeric header: expected five values. Standard XDATCAR is not supported.",
    );
  numeric(lines[2].trim(), "Header line 3");
  if (lines[3].trim() !== "CAR")
    throw new Error("Unsupported trajectory marker: expected CAR.");
  if (!lines[4].trim()) throw new Error("Trajectory name is missing.");
  const atoms = counts[0];
  const frames: Frame[] = [];
  let i = 5;
  if ((lines.length - 5) * 8 > 512 * 1024 * 1024)
    throw new Error("Trajectory exceeds the supported memory budget.");
  while (i < lines.length) {
    const marker = /^\s*Direct configuration=\s*(\d+)\s*$/.exec(lines[i]);
    if (!marker)
      throw new Error(
        `Line ${i + 1}: expected Direct configuration= followed by an integer.`,
      );
    const step = Number(marker[1]);
    if (
      !Number.isSafeInteger(step) ||
      (frames.length && step <= frames[frames.length - 1].step)
    )
      throw new Error(
        "Configuration labels must be safe integers and strictly increasing.",
      );
    i++;
    const positions = new Float64Array(atoms * 3);
    for (let atom = 0; atom < atoms; atom++, i++) {
      if (i >= lines.length)
        throw new Error(`Frame ${step}: missing coordinate rows.`);
      const values = lines[i].trim().split(/\s+/);
      if (values.length !== 3)
        throw new Error(`Line ${i + 1}: expected three coordinates.`);
      values.forEach((v, axis) => {
        positions[atom * 3 + axis] = numeric(v, `Line ${i + 1}`);
      });
    }
    frames.push({ step, positions });
    progress(i / lines.length);
  }
  if (!frames.length) throw new Error("No frames found.");
  return {
    name: lines[4].trim(),
    atomCount: atoms,
    frames,
    species: parseSpecies(speciesText, atoms),
    rawHeader: lines.slice(0, 5),
  };
}
