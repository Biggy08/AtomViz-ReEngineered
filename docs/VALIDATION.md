# Initial release validation

Date: 13 October 2026. Version: 0.1.0. Original software was neither executed nor modified.

## Passed checks

- TypeScript strict type check and Vite production build.
- 21 Vitest checks: input structure, scientific notation, malformed/non-finite data, species overlap/gaps/bounds, both supplied datasets, Cartesian and minimum-image distances, hand-derived coordination and RDF shell counts, cutoff/bin edges, self-pair exclusions, frame averaging, metadata/geometry errors, bond break/reformation and censoring, stationary/ballistic/unwrapped MSD, time scaling, drift subtraction, fit guards, and export provenance.
- Five Playwright checks in installed Microsoft Edge: home/navigation, real-data upload, WebGL rendering, playback and mobile layout, coordination/RDF results, CSV/JSON downloads, stale-result clearing, cutoff errors, malformed input, bond persistence, wrapped-periodic MSD rejection, synthetic unwrapped MSD, cancellation, and navigation during a worker job.
- Independent standard-library Python implementation matches all 80 RDF bins (counts, normalization, cumulative coordination) and all five coordination categories across 205 frames. Comparisons use 1e-10 relative/absolute tolerance for RDF values.
- SHA-256 recheck: all 84 supplied original files remain unchanged.
- Dependency installation reported zero known vulnerabilities at installation time.

## Reference calculation scope

The Python comparison uses the reduced melt, Si central atoms (indices 32?63), O neighbors (64?155), all 205 frames, an explicitly chosen 13.4 ? orthorhombic cell, fractional coordinates, periodic distances, cutoff 2 ?, and 80 radial bins. These are test assumptions, not independently verified physical metadata from the legacy parser. It reports 24,307 directed observations and mean cumulative coordination approximately 3.7053 under those assumptions.

Synthetic MSD tests include stationary atoms, straight-line motion, arithmetic drift removal, and unwrapped cell crossings. Straight-line motion is a numerical fixture; its fitted slope is not evidence of diffusion. Bond tests distinguish intermittent from continuous persistence after a break and reformation and retain end-of-window censoring information.

## Visual review

Rendered home, data/atom workspace, RDF results, and mobile layouts were inspected from screenshots. Browser tests check a WebGL canvas and absence of a WebGL-unavailable error. Screenshots are regenerated under `test-results/` by browser tests and are ignored by Git.

## Limits

No trusted original AtomViz numerical outputs exist in the supplied package, so no legacy-equivalence comparison is possible yet. The supplied sample header units and coordinate semantics remain unverified. The app requires explicit confirmation and blocks ambiguous periodic MSD.

Only constant orthorhombic 3D geometry is supported. No simulation engine, Q^n, coordination matrix/clusters/stability, bond-angle distributions, or diffusion ellipsoid/sphere/spectrum is implemented. Bond output is sampled persistence/correlation, not an estimated uncensored mean lifetime. Diffusion output uses a single time origin and an unweighted fit; no uncertainty interval or automatic regime detection is provided.

The molecular viewer is loaded on demand. Vite emits a size advisory for the approximately 514 kB uncompressed viewer chunk, mainly Three.js; this is not a failed build. Large analyses remain subject to documented browser limits. The representative supplied datasets were exercised; broad scaling benchmarks and cross-browser coverage remain future work.

## Reproduce

Run `npm test`, `npm run build`, `npm run test:e2e`, and `npm run test:reference` in order. Browser tests regenerate the CSV/JSON inputs used by reference validation. See README.md for setup and method documentation for exact conventions.
