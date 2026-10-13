import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ComponentProps } from "react";
import type {
  Dataset,
  Metadata,
  Module,
  Parameters,
  Result,
  WorkerRequest,
  WorkerResponse,
} from "./domain/types";
import { speciesColors } from "./visualization/palette";
import { Chart } from "./visualization/Chart";
import { Field } from "./ui/Field";
import { download } from "./exports/results";
const modules: { id: Module; name: string; sub: string; glyph: string }[] = [
  {
    id: "viewer",
    name: "Data & visualization",
    sub: "Inspect a trajectory",
    glyph: "◈",
  },
  {
    id: "rdf",
    name: "Radial distribution",
    sub: "Pair-distance structure",
    glyph: "⌁",
  },
  {
    id: "coordination",
    name: "Coordination",
    sub: "Local atomic environments",
    glyph: "⊙",
  },
  {
    id: "bonds",
    name: "Bond lifetime",
    sub: "Geometric persistence",
    glyph: "⇄",
  },
  {
    id: "diffusion",
    name: "Diffusion",
    sub: "Mean-squared displacement",
    glyph: "↗",
  },
];
const initialMeta: Metadata = {
  confirmed: false,
  coordinates: "fractional",
  cell: [0, 0, 0],
  lengthUnit: "Å",
  periodic: true,
  timePerStep: 0,
  timeUnit: "ps",
  unwrapped: false,
};
const MoleculeScene = lazy(() =>
  import("./visualization/MoleculeViewer").then((m) => ({
    default: m.MoleculeViewer,
  })),
);
const MoleculeViewer = (props: ComponentProps<typeof MoleculeScene>) => (
  <Suspense
    fallback={
      <div className="molecule viewer-loading">Loading molecular viewer…</div>
    }
  >
    <MoleculeScene {...props} />
  </Suspense>
);
const initialParams: Parameters = {
  module: "viewer",
  first: "*",
  second: "*",
  start: 0,
  end: 0,
  cutoff: 0,
  bins: 80,
  fitStart: 0,
  fitEnd: 0,
  removeDrift: false,
};
const hash = async (text: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
    ),
  )
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
const fnum = (n: number) =>
  Number.isInteger(n) ? n.toLocaleString() : n.toPrecision(5);
export function App() {
  const [workspace, setWorkspace] = useState(location.hash === "#workspace");
  const [data, setData] = useState<Dataset | null>(null);
  const [metadata, setMeta] = useState<Metadata>(initialMeta);
  const [params, setParams] = useState<Parameters>(initialParams);
  const [result, setResult] = useState<Result | null>(null);
  const [trajectory, setTrajectory] = useState<File | null>(null);
  const [species, setSpecies] = useState<File | null>(null);
  const [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(0),
    [status, setStatus] = useState(""),
    [error, setError] = useState("");
  const [frame, setFrame] = useState(0),
    [playing, setPlaying] = useState(false),
    [visible, setVisible] = useState<string[]>([]),
    [trail, setTrail] = useState(false);
  const worker = useRef<Worker | null>(null);
  const generation = useRef(0);
  const active = modules.find((m) => m.id === params.module)!;
  const cancel = useCallback(() => {
    generation.current++;
    worker.current?.terminate();
    worker.current = null;
    setBusy(false);
    setProgress(0);
    setStatus("Operation cancelled.");
  }, []);
  useEffect(
    () => () => {
      generation.current++;
      worker.current?.terminate();
    },
    [],
  );
  useEffect(() => {
    const change = () => setWorkspace(location.hash === "#workspace");
    addEventListener("hashchange", change);
    return () => removeEventListener("hashchange", change);
  }, []);
  useEffect(() => {
    if (!playing || !data) return;
    const timer = setInterval(
      () => setFrame((f) => (f + 1) % data.frames.length),
      180,
    );
    return () => clearInterval(timer);
  }, [playing, data]);
  const execute = (req: WorkerRequest, id: number) => {
    if (id !== generation.current) return;
    const w = new Worker(
      new URL("./workers/analysis.worker.ts", import.meta.url),
      { type: "module" },
    );
    worker.current = w;
    w.onmessage = (event: MessageEvent<WorkerResponse>) => {
      if (id !== generation.current) return;
      const reply = event.data;
      if (reply.kind === "progress") {
        setProgress(reply.value);
        setStatus(reply.message);
        return;
      }
      if (reply.kind === "dataset") {
        setData(reply.dataset);
        setMeta(initialMeta);
        setVisible(reply.dataset.species.map((s) => s.name));
        setFrame(0);
        setPlaying(false);
        setResult(null);
        setParams({
          ...initialParams,
          module: params.module,
          end: reply.dataset.frames.length - 1,
          fitEnd: reply.dataset.frames.length - 1,
        });
        setStatus(
          "Dataset validated. Confirm metadata to enable physical analysis.",
        );
      } else if (reply.kind === "result") {
        setResult(reply.result);
        setStatus("Analysis complete.");
      } else {
        setError(reply.message);
        setStatus("Operation failed.");
      }
      setBusy(false);
      setProgress(1);
      w.terminate();
      worker.current = null;
    };
    w.onerror = (e) => {
      if (id !== generation.current) return;
      setError(e.message || "Worker failed.");
      setBusy(false);
      setStatus("Operation failed.");
      w.terminate();
      worker.current = null;
    };
    w.postMessage(req);
  };
  const begin = () => {
    generation.current++;
    worker.current?.terminate();
    worker.current = null;
    setBusy(true);
    setError("");
    setResult(null);
    setProgress(0);
    return generation.current;
  };
  const load = async (example?: "reduced" | "oxidized") => {
    const id = begin();
    setStatus("Reading input files…");
    try {
      let t: string, s: string, tn: string, sn: string;
      if (example) {
        tn = `mg32s32o${example === "reduced" ? 92 : 96}s4-${example}Melt`;
        sn = `SPECIES_FILE_${example}`;
        const responses = await Promise.all([
          fetch(`/examples/${tn}`),
          fetch(`/examples/${sn}`),
        ]);
        if (responses.some((r) => !r.ok))
          throw new Error("Example files could not be loaded.");
        [t, s] = await Promise.all(responses.map((r) => r.text()));
      } else {
        if (!trajectory || !species)
          throw new Error("Select both a trajectory and a species file.");
        if (trajectory.size > 50 * 1024 * 1024 || species.size > 1024 * 1024)
          throw new Error(
            "File too large: maximum trajectory size 50 MB; species file 1 MB.",
          );
        [t, s] = await Promise.all([trajectory.text(), species.text()]);
        tn = trajectory.name;
        sn = species.name;
      }
      const [th, sh] = await Promise.all([hash(t), hash(s)]);
      execute(
        {
          kind: "parse",
          trajectory: t,
          species: s,
          trajectoryName: tn,
          speciesName: sn,
          hashes: { trajectory: th, species: sh },
        },
        id,
      );
    } catch (e) {
      if (id !== generation.current) return;
      setError(e instanceof Error ? e.message : "Import failed.");
      setBusy(false);
      setStatus("Import failed.");
    }
  };
  const updateMeta = (patch: Partial<Metadata>) => {
    cancelForChange();
    setMeta((m) => ({ ...m, ...patch, confirmed: false }));
  };
  const cancelForChange = () => {
    if (busy) cancel();
    setResult(null);
    setError("");
    setStatus("");
  };
  const updateParams = (patch: Partial<Parameters>) => {
    cancelForChange();
    setParams((p) => ({ ...p, ...patch }));
  };
  const confirm = () => {
    if (metadata.cell.some((v) => !Number.isFinite(v) || v <= 0 || v > 1e9)) {
      setError(
        "Enter three positive orthorhombic cell lengths before confirming.",
      );
      return;
    }
    setError("");
    setMeta((m) => ({ ...m, confirmed: true }));
    setStatus("Coordinate and cell metadata confirmed by user.");
  };
  const run = () => {
    if (!data) return;
    setPlaying(false);
    const id = begin();
    setStatus("Preparing analysis…");
    execute(
      { kind: "analyze", dataset: data, metadata, parameters: params },
      id,
    );
  };
  if (!workspace)
    return (
      <div className="home">
        <header className="home-header">
          <a className="brand" href="#">
            <span className="brand-mark">A</span>AtomViz
          </a>
          <span className="quiet">SCIENTIFIC WORKSPACE</span>
        </header>
        <main className="home-main">
          <div className="home-symbol" aria-hidden="true">
            <i />
            <i />
            <i />
            <span />
          </div>
          <p className="eyebrow">STRUCTURE. MOTION. INSIGHT.</p>
          <h1>AtomViz</h1>
          <p className="home-subtitle">Molecular Simulation &amp; Analysis</p>
          <p className="home-description">
            Explore atomic trajectories.
            <br />
            Understand the structure and motion within.
          </p>
          <a className="primary home-button" href="#workspace">
            Open Workspace <span>→</span>
          </a>
          <p className="home-note">Files processed locally in your browser.</p>
        </main>
        <footer className="home-footer">
          <span>Built for scientific exploration</span>
          <span>Trajectory visualization &amp; analysis · v0.1</span>
        </footer>
      </div>
    );
  return (
    <div className="app">
      <aside className="sidebar">
        <a className="brand" href="#">
          <span className="brand-mark">A</span>AtomViz
        </a>
        <p className="sidebar-label">WORKSPACE</p>
        <nav aria-label="Analysis modules">
          {modules.map((m) => (
            <button
              key={m.id}
              className={`nav-item ${params.module === m.id ? "selected" : ""}`}
              onClick={() => updateParams({ module: m.id })}
            >
              <span className="nav-icon" aria-hidden="true">
                {m.glyph}
              </span>
              <span>
                {m.name}
                <small>{m.sub}</small>
              </span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="status-dot" /> Browser-local processing
          <p>
            Documented replacement methods.
            <br />
            Legacy parity is unverified.
          </p>
          <a href="#">← Back to home</a>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span>
            Workspace <span className="breadcrumb">/ {active.name}</span>
          </span>
          <span className="pill">Local session</span>
        </header>
        <main className="content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">MOLECULAR SIMULATION &amp; ANALYSIS</p>
              <h1>{active.name}</h1>
              <p>
                {params.module === "viewer"
                  ? "Load a trajectory and explore its atomic structure."
                  : "Select your parameters, run an analysis, and inspect the evidence."}
              </p>
            </div>
            <span className="version">v0.1</span>
          </div>
          <section className="import-section">
            <div className="section-title">
              <h2>
                <span className="step">01</span> Input data
              </h2>
              <span className="quiet">
                Custom AtomViz trajectory + species file
              </span>
            </div>
            <div className="import-grid">
              <Field
                label="Trajectory file"
                hint={
                  trajectory?.name ??
                  "Extensionless custom CAR / Direct configuration format"
                }
              >
                <input
                  aria-label="Trajectory file"
                  type="file"
                  disabled={busy}
                  onChange={(e) => {
                    cancelForChange();
                    setTrajectory(e.target.files?.[0] ?? null);
                  }}
                />
              </Field>
              <Field
                label="Species file"
                hint={
                  species?.name ??
                  "#Species with zero-based inclusive index ranges"
                }
              >
                <input
                  aria-label="Species file"
                  type="file"
                  disabled={busy}
                  onChange={(e) => {
                    cancelForChange();
                    setSpecies(e.target.files?.[0] ?? null);
                  }}
                />
              </Field>
              <button
                className="primary"
                disabled={busy || !trajectory || !species}
                onClick={() => void load()}
              >
                Load &amp; validate <span>→</span>
              </button>
            </div>
            <div className="examples">
              <span>Explore supplied data</span>
              <button disabled={busy} onClick={() => void load("reduced")}>
                Reduced melt <span>160 atoms</span>
              </button>
              <button disabled={busy} onClick={() => void load("oxidized")}>
                Oxidized melt <span>164 atoms</span>
              </button>
              <span className="example-note">
                Real trajectories · units unconfirmed
              </span>
            </div>
          </section>
          {(status || error || busy) && (
            <div
              className={`operation ${error ? "error" : ""}`}
              role={error ? "alert" : "status"}
            >
              <div>
                <span>{error || status}</span>
                {busy && (
                  <button className="text-button" onClick={cancel}>
                    Cancel
                  </button>
                )}
              </div>
              {busy && <progress value={progress} max={1} />}
            </div>
          )}
          {data ? (
            <>
              <div className="dataset-strip">
                <div>
                  <span className="status-dot" />
                  <strong>{data.name}</strong>
                  <span className="quiet">Validated structure</span>
                </div>
                <span>
                  <strong>{data.atomCount}</strong> atoms
                </span>
                <span>
                  <strong>{data.frames.length}</strong> frames
                </span>
                <span>
                  <strong>{data.species.length}</strong> species
                </span>
                <span>
                  Labels {data.frames[0].step}–
                  {data.frames[data.frames.length - 1].step}
                </span>
              </div>
              <details className="metadata" open={!metadata.confirmed}>
                <summary>
                  Coordinate &amp; cell metadata{" "}
                  <span
                    className={`badge ${metadata.confirmed ? "confirmed" : ""}`}
                  >
                    {metadata.confirmed
                      ? "User confirmed"
                      : "Confirmation required"}
                  </span>
                </summary>
                <p className="help">
                  The legacy header has no verified unit schema. Supply the
                  coordinate interpretation and cell lengths from your
                  simulation records. Only constant orthorhombic cells are
                  supported.
                </p>
                <div className="metadata-grid">
                  <Field label="Coordinates">
                    <select
                      value={metadata.coordinates}
                      onChange={(e) =>
                        updateMeta({
                          coordinates: e.target
                            .value as Metadata["coordinates"],
                        })
                      }
                    >
                      <option value="fractional">Fractional coordinates</option>
                      <option value="cartesian">Cartesian coordinates</option>
                    </select>
                  </Field>
                  <Field label="Length unit">
                    <select
                      value={metadata.lengthUnit}
                      onChange={(e) =>
                        updateMeta({
                          lengthUnit: e.target.value as Metadata["lengthUnit"],
                        })
                      }
                    >
                      <option>Å</option>
                      <option>nm</option>
                    </select>
                  </Field>
                  {(["x", "y", "z"] as const).map((axis, i) => (
                    <Field
                      key={axis}
                      label={`Cell ${axis} (${metadata.lengthUnit})`}
                    >
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={metadata.cell[i] || ""}
                        onChange={(e) => {
                          const cell = [...metadata.cell] as Metadata["cell"];
                          cell[i] = Number(e.target.value);
                          updateMeta({ cell });
                        }}
                      />
                    </Field>
                  ))}
                </div>
                <div className="metadata-actions">
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={metadata.periodic}
                      onChange={(e) =>
                        updateMeta({ periodic: e.target.checked })
                      }
                    />
                    Periodic boundaries in x, y, z
                  </label>
                  <button className="secondary" onClick={confirm}>
                    Confirm metadata
                  </button>
                </div>
                <details className="raw-header">
                  <summary>Inspect raw header and provenance</summary>
                  <pre>{data.rawHeader.join("\n")}</pre>
                  <p>
                    Legacy species values are preserved as supplied and are not
                    interpreted as atomic masses. Atom identities follow
                    coordinate-row order.
                  </p>
                  <p className="hash">
                    Trajectory SHA-256 (UTF-8 text): {data.hashes.trajectory}
                    <br />
                    Species SHA-256 (UTF-8 text): {data.hashes.species}
                  </p>
                </details>
              </details>
              {params.module === "viewer" ? (
                <section className="viewer-section">
                  <div className="section-title">
                    <h2>
                      <span className="step">02</span> Trajectory explorer
                    </h2>
                    <span className="quiet">
                      Drag to rotate · scroll to zoom
                    </span>
                  </div>
                  <MoleculeViewer
                    data={data}
                    frame={frame}
                    metadata={metadata}
                    visible={visible}
                    trail={trail}
                  />
                  <div className="viewer-controls">
                    <button
                      className="secondary"
                      onClick={() => setPlaying((p) => !p)}
                    >
                      {playing ? "Pause" : "Play"}
                    </button>
                    <input
                      aria-label="Frame"
                      type="range"
                      min="0"
                      max={data.frames.length - 1}
                      value={frame}
                      onChange={(e) => {
                        setPlaying(false);
                        setFrame(Number(e.target.value));
                      }}
                    />
                    <span>
                      Frame <strong>{frame + 1}</strong> / {data.frames.length}
                    </span>
                    <span>
                      Label <strong>{data.frames[frame].step}</strong>
                    </span>
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={trail}
                        onChange={(e) => setTrail(e.target.checked)}
                      />
                      Trails
                    </label>
                  </div>
                  <div className="species-legend">
                    {data.species.map((s, i) => (
                      <label key={s.name}>
                        <input
                          type="checkbox"
                          checked={visible.includes(s.name)}
                          onChange={(e) =>
                            setVisible((v) =>
                              e.target.checked
                                ? [...v, s.name]
                                : v.filter((n) => n !== s.name),
                            )
                          }
                        />
                        <i
                          style={{
                            background: speciesColors[i % speciesColors.length],
                          }}
                        />
                        <strong>{s.name}</strong>
                        <span>{s.end - s.start + 1} atoms</span>
                      </label>
                    ))}
                  </div>
                  <p className="help">
                    Trails show up to 20 previous frames and 100 atoms per
                    species. Boundary jumps are omitted in confirmed periodic
                    views.
                  </p>
                </section>
              ) : (
                <>
                  <section className="parameter-section">
                    <div className="section-title">
                      <h2>
                        <span className="step">02</span> Analysis parameters
                      </h2>
                      <span className="badge">Replacement method</span>
                    </div>
                    <div className="parameter-grid">
                      <Field
                        label={
                          params.module === "diffusion"
                            ? "Atom selection"
                            : "Central species"
                        }
                      >
                        <select
                          value={params.first}
                          onChange={(e) =>
                            updateParams({ first: e.target.value })
                          }
                        >
                          <option value="*">All atoms</option>
                          {data.species.map((s) => (
                            <option key={s.name}>{s.name}</option>
                          ))}
                        </select>
                      </Field>
                      {params.module !== "diffusion" && (
                        <Field label="Neighbor species">
                          <select
                            value={params.second}
                            onChange={(e) =>
                              updateParams({ second: e.target.value })
                            }
                          >
                            <option value="*">All atoms</option>
                            {data.species.map((s) => (
                              <option key={s.name}>{s.name}</option>
                            ))}
                          </select>
                        </Field>
                      )}
                      <Field label="First frame (1-based)">
                        <input
                          type="number"
                          min="1"
                          max={data.frames.length}
                          value={params.start + 1}
                          onChange={(e) =>
                            updateParams({ start: Number(e.target.value) - 1 })
                          }
                        />
                      </Field>
                      <Field label="Last frame (inclusive)">
                        <input
                          type="number"
                          min="1"
                          max={data.frames.length}
                          value={params.end + 1}
                          onChange={(e) =>
                            updateParams({ end: Number(e.target.value) - 1 })
                          }
                        />
                      </Field>
                      {params.module !== "diffusion" && (
                        <Field
                          label={`Cutoff (${metadata.lengthUnit})`}
                          hint="Distances equal to cutoff are excluded"
                        >
                          <input
                            type="number"
                            min="0"
                            step="any"
                            placeholder="Enter distance"
                            value={params.cutoff || ""}
                            onChange={(e) =>
                              updateParams({ cutoff: Number(e.target.value) })
                            }
                          />
                        </Field>
                      )}
                      {params.module === "rdf" && (
                        <Field
                          label="Radial bins"
                          hint="2–2,000 equal-width bins"
                        >
                          <input
                            type="number"
                            min="2"
                            max="2000"
                            value={params.bins}
                            onChange={(e) =>
                              updateParams({ bins: Number(e.target.value) })
                            }
                          />
                        </Field>
                      )}
                    </div>
                    {params.module === "diffusion" && (
                      <>
                        <div className="notice">
                          Periodic MSD requires unwrapped atom coordinates.
                          Confirm this from the data producer; wrapped
                          coordinates cannot resolve all crossings between saved
                          frames.
                        </div>
                        <div className="parameter-grid">
                          <Field
                            label="Time per label increment"
                            hint="Not time between saved frames"
                          >
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={metadata.timePerStep || ""}
                              onChange={(e) =>
                                updateMeta({
                                  timePerStep: Number(e.target.value),
                                })
                              }
                            />
                          </Field>
                          <Field label="Time unit">
                            <select
                              value={metadata.timeUnit}
                              onChange={(e) =>
                                updateMeta({
                                  timeUnit: e.target
                                    .value as Metadata["timeUnit"],
                                })
                              }
                            >
                              <option>ps</option>
                              <option>fs</option>
                            </select>
                          </Field>
                          <Field label="Fit first frame (1-based)">
                            <input
                              type="number"
                              min="1"
                              value={params.fitStart + 1}
                              onChange={(e) =>
                                updateParams({
                                  fitStart: Number(e.target.value) - 1,
                                })
                              }
                            />
                          </Field>
                          <Field label="Fit last frame (inclusive)">
                            <input
                              type="number"
                              min="1"
                              value={params.fitEnd + 1}
                              onChange={(e) =>
                                updateParams({
                                  fitEnd: Number(e.target.value) - 1,
                                })
                              }
                            />
                          </Field>
                        </div>
                        <div className="checkbox-row">
                          <label className="checkbox">
                            <input
                              type="checkbox"
                              checked={metadata.unwrapped}
                              onChange={(e) =>
                                updateMeta({ unwrapped: e.target.checked })
                              }
                            />
                            Coordinates are confirmed unwrapped
                          </label>
                          <label className="checkbox">
                            <input
                              type="checkbox"
                              checked={params.removeDrift}
                              onChange={(e) =>
                                updateParams({ removeDrift: e.target.checked })
                              }
                            />
                            Subtract group mean drift
                          </label>
                        </div>
                      </>
                    )}
                    <div className="run-row">
                      <p>
                        {!metadata.confirmed
                          ? "Confirm metadata above to enable analysis."
                          : "Every result includes its method, units, and input provenance."}
                      </p>
                      <button
                        className="primary"
                        disabled={busy || !metadata.confirmed}
                        onClick={run}
                      >
                        Run Analysis <span>→</span>
                      </button>
                    </div>
                  </section>
                  {result && (
                    <section className="results">
                      <div className="section-title">
                        <h2>
                          <span className="step">03</span> {result.title}
                        </h2>
                        <div className="export-actions">
                          <button
                            className="secondary"
                            onClick={() => download(result, "csv")}
                          >
                            Export CSV
                          </button>
                          <button
                            className="secondary"
                            onClick={() => download(result, "json")}
                          >
                            Export JSON
                          </button>
                        </div>
                      </div>
                      <div className="metrics">
                        {result.summary.map((s) => (
                          <div key={s.label}>
                            <span>{s.label}</span>
                            <strong>
                              {fnum(s.value)} <small>{s.unit}</small>
                            </strong>
                          </div>
                        ))}
                      </div>
                      <Chart key={result.module} result={result} />
                      <p className="chart-caption">
                        Source: {result.input.name} · frames{" "}
                        {result.parameters.start + 1}–
                        {result.parameters.end + 1} · {result.method}
                      </p>
                      <details className="result-table">
                        <summary>
                          Numerical results · {result.rows.length} rows
                        </summary>
                        <div className="table-scroll">
                          <table>
                            <thead>
                              <tr>
                                {result.columns.map((c) => (
                                  <th key={c}>{c}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {result.rows.slice(0, 300).map((row, i) => (
                                <tr key={i}>
                                  {row.map((v, j) => (
                                    <td key={j}>{fnum(v)}</td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {result.rows.length > 300 && (
                          <p>
                            Showing first 300 rows. Export includes all rows.
                          </p>
                        )}
                      </details>
                      <div className="method-notes">
                        <h3>Method &amp; interpretation</h3>
                        <ul>
                          {result.notes.map((n) => (
                            <li key={n}>{n}</li>
                          ))}
                        </ul>
                      </div>
                    </section>
                  )}
                </>
              )}
              <details className="limitations">
                <summary>Feature coverage &amp; scientific limitations</summary>
                <p>
                  RDF, geometric coordination, bond persistence, and
                  single-origin MSD are independent replacement implementations.
                  Original AtomViz formulas and output parity remain unverified.
                </p>
                <p>
                  Qⁿ classification, coordination clusters/stability, bond-angle
                  distributions, diffusion ellipsoid/sphere/spectrum, general
                  XDATCAR, triclinic or changing cells, image counters, and
                  simulation generation are not implemented.
                </p>
                <p>
                  The supplied data’s header units remain unconfirmed. Do not
                  infer units, density, temperature, or timestep from the header
                  automatically.
                </p>
              </details>
            </>
          ) : (
            <div className="empty-workspace">
              <div className="empty-symbol">◈</div>
              <h2>Your data, a clearer view.</h2>
              <p>
                Upload a trajectory and species file, or explore a supplied melt
                dataset.
                <br />
                Validate the structure first. Confirm units before calculating.
              </p>
              <div className="empty-steps">
                <span>01 &nbsp; Import data</span>
                <span>02 &nbsp; Confirm metadata</span>
                <span>03 &nbsp; Explore &amp; analyze</span>
              </div>
            </div>
          )}
          <footer className="workspace-footer">
            <span>AtomViz · Scientific workspace</span>
            <span>No uploaded files leave your browser.</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
