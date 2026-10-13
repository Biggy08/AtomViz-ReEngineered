# Scientific methods ? replacement version 1.0

These methods are independently implemented and tested. No original AtomViz function has been decompiled or matched numerically. UI labels in the legacy executable support candidate feature names; they do not establish the formulas below.

## Supported input and units

The importer accepts the observed custom format: two equal atom counts; five numeric header values; one numeric header line; CAR; dataset name; then strictly increasing integer `Direct configuration=` labels with exactly N coordinate triples each. Decimal scientific notation and Fortran D exponents are accepted. Standard XDATCAR is not claimed. Stable atom identities are assumed from row order.

Species input begins with `#Species`, followed by name, legacy numeric value, start index, and end index. Indices are zero-based/inclusive and must cover all atoms exactly once with unique species names. Legacy numeric values are retained without interpreting them as masses.

The raw header is inspectable. Cell lengths and coordinates must be explicitly interpreted by the user. Supported geometry is a constant 3D orthorhombic cell, with all-axis periodicity or no periodicity. Fractional coordinates are multiplied componentwise by cell lengths; Cartesian values are used directly. Lengths are labeled ? or nm without automatic conversion. The same chosen unit applies to cell lengths, Cartesian inputs, cutoffs, and output.

For display only, unconfirmed data is previewed in a unit cell under an explicitly labeled fractional-coordinate assumption. The preview is not evidence of physical lengths. Confirmed periodic views wrap positions into the display cell. Rendered trails are bounded history segments; apparent boundary jumps are omitted rather than inferred as diffusion paths.

## Distances and coordination

For periodic distances, each Cartesian displacement component is replaced by `d - L round(d/L)`. Distance is the Euclidean norm. Periodic cutoffs must be no greater than half the shortest cell length. Nonperiodic coordination/bond persistence use direct distances without boundary correction.

For central population A and neighbor population B, count B atoms with `distance < cutoff`, excluding the identical atom. Report the distribution over all central atom/frame observations and the equally weighted mean. This is geometric coordination, not chemical bond identification. A single common cutoff is used per run; a full species-specific cutoff matrix is not implemented.

## Radial distribution function

Periodic homogeneous 3D bulk cells only. Divide `[0, cutoff)` into equal radial bins. Count directed A-to-B pairs over selected frames, excluding self pairs. A same-species unordered pair contributes twice. Exact cutoff equality is excluded; internal bin edges belong to the bin beginning at that edge.

For shell k with inner/outer radii a,b, shell volume is `4?(b??a?)/3`. Let P be `N_A N_B ? |A ? B|`, V the cell volume, and F the number of selected frames. Then `g_k = count_k V / (F P shell_volume_k)`. This finite-population convention gives `N(N?1)` for identical populations and is explicitly chosen here; do not assume it matches every legacy or third-party implementation.

Cumulative coordination is the cumulative directed count divided by `F N_A`. RDF outputs shell-center radii, dimensionless g(r), cumulative coordination, and raw directed counts. All atoms/frames are included equally; no bond exclusion lists, smoothing, or automatic first-minimum cutoff are applied. The broader shell-density approach and coordination interpretation are documented by [LAMMPS](https://docs.lammps.org/compute_rdf.html), which must be compared with matching conventions when used as a reference.

## Bond persistence

An undirected unique atom pair is geometrically bonded when its distance is strictly less than the selected cutoff. Sampling must be uniform in configuration labels. For each lag, use all bonded time origins with a valid endpoint inside the selected frame range.

Intermittent correlation is the fraction of those origins whose pair is also bonded at the endpoint; intervening breaks are allowed. Continuous persistence is the fraction bonded at every sampled frame between origin and endpoint. Both denominators use the number of eligible bonded origins at that lag. This count is exported: large lags have fewer origins and changing origin populations may produce nonmonotone curves.

The summary counts observed contiguous bonded runs and those extending to the final frame. A run already present at the first frame is left-censored. A run extending to the last frame is right-censored. No mean physical lifetime, survival-analysis correction, or claim of unobserved sub-frame behavior is made. Lag is exported in raw configuration-label increments, not assumed femtoseconds.

## MSD and diffusion estimate

Use the first selected frame as a single time origin. For the selected atom group, report arithmetic mean squared displacement in x/y/z and total. Periodic input must be confirmed unwrapped; no automatic minimum-image trajectory unwrapping is provided. Sparse wrapped snapshots cannot identify every crossing.

Optionally subtract the selected group's arithmetic mean displacement at each frame. This is not a mass-weighted center-of-mass correction; masses are unknown. Time is `(current configuration label ? origin label) ? explicit time per label increment`.

Fit total MSD to `intercept + slope ? time` by unweighted least squares over the selected inclusive interval, requiring at least three points. Report `D = slope / 6` under the 3D isotropic Einstein diffusion interpretation, with R? and intercept. R? is undefined for constant MSD and is omitted in that case. A linear fit alone does not validate a diffusive regime; ballistic motion can yield a numerical slope and must not be interpreted as diffusion. No confidence interval, block averaging, or multi-origin estimate is provided. Negative slopes are flagged in method notes. See [MSD definitions](https://docs.lammps.org/compute_msd.html) and [diffusion guidance](https://docs.lammps.org/Howto_diffusion.html).

## Reproducibility and computation

CSV and JSON exports include method version, frame range, species selections, geometry/time metadata, input names, and SHA-256 hashes of UTF-8 decoded input text re-encoded without other normalization. These are text-content hashes, not guaranteed original-file byte hashes for files with a byte-order mark or unusual encoding. Coordinates and calculations use Float64Array/JavaScript double precision. Workers isolate parsing and heavy analysis from the UI; cancellation terminates the job and discards late responses.

Input limits: 50 MB trajectory, 1 MB species file, maximum 100,000 atoms. Ordinary pair methods are capped at 200 million frame/pair checks; bond persistence is capped at 200 million estimated origin/lag checks. Reduce selections when limits are exceeded. These are initial browser resource limits, not promises for arbitrarily large molecular simulations.

## Pending features

Original workflow/formula recovery, Q^n classification, coordination matrix/clusters/stability, bond-angle distributions, diffusion ellipsoids/spheres/spectra, general format conversion, image counters, variable/triclinic cells, and simulation generation remain pending. No runtime validation of the Windows executable was performed.
