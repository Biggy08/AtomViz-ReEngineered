import { parseLegacy } from "../parsers/legacy";
import { runAnalysis } from "../analysis/run";
import type { WorkerRequest, WorkerResponse } from "../domain/types";
const send = (value: WorkerResponse) => self.postMessage(value);
self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  let last = 0;
  const progress = (n: number) => {
    const now = Date.now();
    if (now - last > 100 || n === 1) {
      send({
        kind: "progress",
        value: n,
        message:
          event.data.kind === "parse"
            ? "Validating coordinates"
            : "Computing analysis",
      });
      last = now;
    }
  };
  try {
    const req = event.data;
    if (req.kind === "parse")
      send({
        kind: "dataset",
        dataset: {
          ...parseLegacy(req.trajectory, req.species, progress),
          trajectoryName: req.trajectoryName,
          speciesName: req.speciesName,
          hashes: req.hashes,
        },
      });
    else
      send({
        kind: "result",
        result: runAnalysis(
          req.dataset,
          req.metadata,
          req.parameters,
          progress,
        ),
      });
  } catch (error) {
    send({
      kind: "error",
      message: error instanceof Error ? error.message : "Analysis failed.",
    });
  }
};
