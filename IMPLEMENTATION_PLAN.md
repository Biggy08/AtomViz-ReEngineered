# AtomViz WebApp ? Phase 1 implementation plan

13 October 2026. Phase 1 only; no application scaffolding, dependency installation, legacy execution, or decompilation performed.

## Inspection findings

The project directory `AtomViz Web App/` was empty. No applicable AGENTS.md was found in the inspected ancestor directories. Available tools include Node.js 24.20.0, npm 11.19.0, pnpm, Git, and Python. No existing package, source, or tests need migration.

The sibling static report, full inventory, PE evidence, executable strings, species definitions, shader source, and sample trajectory structures were reviewed. All 84 original files match their recorded SHA-256 hashes. Original application files remain unchanged.

Confirmed artifacts: native Windows x86 C++ evidence; OpenGL/GLUT/GLEW and embedded GLUI indicators; direct legacy MATLAB matrix/eigenvalue imports; readable GLSL lighting resources. The two input pairs have 160 atoms across 205 frames and 164 atoms across 206 frames. Each frame contains three numeric coordinate columns with stable atom counts.

Confirmed labels, not verified original workflows or algorithms: RDF, coordination, diffusion, trajectory controls, periodic boundaries, species-pair cutoffs, coordination matrices/distributions/clusters, bond lifetime, bond-angle output, and Q^n species information. Diffusion sphere/spectrum/ellipsoid labels also exist. No force field or standalone simulation model was found. The workspace will initially visualize imported trajectories; it will not generate physical simulations.

Unknown: legacy parser semantics, cell and time units, coordinate interpretation, the meaning of several header fields, calculation formulas, RDF normalization, bond persistence rules, diffusion tensor construction, and feature reachability. The species column labeled AtomicWeight holds atomic-number-like values; it must not be treated as mass.

## Proposed architecture

Use React + TypeScript + Vite for a browser-local application with no required backend. Use simple CSS, a light palette, readable sans-serif typography, accessible labels, compact controls, and consistent module layouts. Keep imported data in local session memory by default.

Organize code into `ui`, `parsers`, `domain`, `numerics`, `analysis`, `workers`, `visualization`, and `exports`. Keep numerical functions independent of React. Use Float64Array coordinates, explicit cell/coordinate/time metadata, stable atom identities, and structured validation errors.

Run parsing and intensive numerical work in Web Workers, with progress, cancellation, and stale-result protection. Vite supports module workers ([official documentation](https://vite.dev/guide/features.html)). Use Three.js for cell/atom/trajectory rendering; instanced meshes can represent repeated atoms efficiently ([official documentation](https://threejs.org/docs/pages/InstancedMesh.html)). Charts and result tables must include axes, units, and method descriptions. Add CSV/JSON exports carrying parameters, input provenance, method version, frame selection, units, and limitations.

## Implementation sequence

1. **Input contract first.** Define the observed custom trajectory/species format and an explicit metadata model. Validate integer counts, finite coordinates, frame completeness/order, species bounds, overlaps/gaps, and atom identity consistency. Preserve unresolved headers as raw metadata. Require explicit coordinate interpretation and cell/unit confirmation before physical-distance analysis; require time calibration before time-dependent analysis. Do not advertise general XDATCAR compatibility until implemented and tested.
2. **Home and workspace.** Build the requested centered AtomViz landing page, subtitle, and Open Workspace navigation. Workspace navigation covers Data & Visualization, RDF, Coordination, Bond Lifetime, and Diffusion. Each module uses input/parameters, Run Analysis, progress/errors, results, and export. Candidate advanced capabilities remain visibly unavailable until supported. Display no fabricated numerical outputs; any visual-development fixtures are labeled synthetic sample data.
3. **First functional release.** Import both supplied data pairs, show a validated dataset summary, species colors, frame selection/playback, and 3D coordinates. A fractional-cell view may be offered before physical-unit confirmation, clearly labeled as fractional coordinates. Physical views require confirmed metadata. Implement orthorhombic periodic distances first; reject unsupported cells rather than apply incorrect geometry.
4. **Coordination and RDF.** Implement separately documented replacement methods using selected species pairs, frame range, and user-specified distance thresholds. Define self-pair exclusions, cutoff equality, directed/undirected counting, shell volumes, same-species normalization, and averaging before coding. Restrict periodic RDF radii to the supported geometric range. Add coordination counts/distributions, total and partial RDF, charts, and exports. Reference semantics are available in [LAMMPS RDF documentation](https://docs.lammps.org/compute_rdf.html); adopting a documented convention does not prove AtomViz parity.
5. **Bond lifetime and diffusion.** Define bond lifetime from the declared geometric criterion, distinguish continuous persistence from intermittent correlation, and account for trajectories ending before a bond breaks. Implement MSD before fitting diffusion coefficients, with explicit reference/time-origin and drift conventions. Require reliable unwrapped coordinates or image counters for general periodic trajectories. Minimum-image unwrapping is conditional on less-than-half-cell motion between saved frames; the supplied sparse frames do not establish that condition. Do not return confident diffusion coefficients from ambiguous crossings. Use [LAMMPS MSD](https://docs.lammps.org/compute_msd.html) and [diffusion guidance](https://docs.lammps.org/Howto_diffusion.html) as method references, with a declared fitting interval and assumptions.
6. **Advanced capabilities.** Investigate Q^n, bond-angle distributions, coordination clusters/stability, and diffusion sphere/ellipsoid/spectrum definitions separately. Implement only with recovered semantics or a documented justified replacement. Targeted static cross-references to parser strings and mlfEig calls may help; no exact recovery is promised.

## Validation and completion criteria

Use Vitest for parsers/numerics and Playwright for upload, navigation, errors, worker cancellation, rendering, and export flows. Numerical tests must include hand-verifiable distances and coordination, periodic-boundary pairs, exact RDF bin/shell counts, self-pair exclusions, stationary MSD, known straight-line motion, known unwrapped crossings, and bond break/reformation with censored ends. Synthetic fixtures are test evidence, not results attributed to the legacy software.

Use the supplied datasets for integration and structural validation only; there are no trusted legacy output files. Compare against an independent implementation or LAMMPS fixture where practical, documenting any conventions that differ. Legacy comparisons require separately agreed runtime investigation. Performance checks should cover the provided datasets and larger generated inputs without blocking the UI.

Each released module must have a stated method, units, assumptions, automated numerical checks, export validation, and a reproducibility record. Track statuses as original behavior verified, replacement validated, or pending. No module currently qualifies as original behavior verified. Final documentation will include setup/run commands, supported input formats, calculation definitions, and limitations; no feature-parity claim is justified yet.

## Immediate next milestone

Build the application shell plus strict input validation and real-data frame visualization. Add coordination/RDF only after the metadata and periodic-distance contract passes tests. Phase 1 ends with this plan; implementation has not started.
