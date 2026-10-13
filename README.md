# AtomViz WebApp

A browser-local scientific workspace for importing and exploring AtomViz trajectories. Built with React, TypeScript, Vite, Three.js, and Web Workers. Original application files are left unchanged.

## Run locally

Requires Node.js 22.12+ or 24+ and npm. From this directory:

```powershell
npm install
npm run dev
```

Open the local URL printed by Vite (normally http://127.0.0.1:5173). For a production build, run `npm run build`, then `npm run preview`. Do not open `index.html` directly from the filesystem: workers and imports require HTTP.

## Using the workspace

1. Select **Open Workspace**.
2. Load a supplied reduced/oxidized melt example, or upload both a custom AtomViz trajectory and a `#Species` file.
3. Inspect the validated dataset, change frames, rotate/zoom the atom view, filter species, and optionally show trails.
4. Enter coordinate interpretation, length unit, and constant orthorhombic cell dimensions from your simulation records. Confirm metadata. The legacy header is never treated as verified units.
5. Select RDF, Coordination, Bond Lifetime, or Diffusion. Enter species/frame selection and method parameters, then run. Export results as CSV or JSON with method and provenance.

All uploaded data is processed in local browser memory. No backend, API key, or legacy DLL is required. Reloading clears the session. The supplied examples are real trajectory copies, not fabricated numerical demonstrations.

## Scientific status

Implemented: normalized total/partial RDF, geometric coordination distributions, continuous/intermittent bond persistence, and single-origin MSD with a diffusion slope estimate. These are **documented replacement methods**, not recovered AtomViz formulas or verified feature parity.

Physical calculations require user-confirmed metadata. Periodic MSD additionally requires confirmed unwrapped coordinates. The supplied wrapped/sparse trajectories do not establish reliable unwrapping. No mean bond lifetime is inferred from censored runs.

Advanced Q^n, clusters/stability, bond-angle distributions, diffusion ellipsoids/spheres/spectra, general XDATCAR, triclinic/changing cells, and simulation generation remain unimplemented. See [method definitions](docs/SCIENTIFIC_METHODS.md) and [release validation](docs/VALIDATION.md).

## Checks

```powershell
npm test
npm run build
npm run test:e2e
python scripts/validate-reference.py
```

Browser tests use installed Microsoft Edge; edit `channel` in `playwright.config.ts` for another supported browser. Reference validation runs after browser tests, comparing their exported RDF/coordination results against an independent Python implementation. Its test cell dimensions are explicit assumptions, not verified sample metadata.

## Structure

`src/parsers` validates inputs; `src/domain` defines data and result contracts; `src/numerics` handles geometry/fitting; `src/analysis` implements methods; `src/workers` runs background jobs; `src/visualization` renders atoms/charts; `src/ui` provides reusable controls; `src/exports` produces portable results. `tests` contains scientific and browser checks. `public/examples` contains read-only copies of the four supplied data files.
