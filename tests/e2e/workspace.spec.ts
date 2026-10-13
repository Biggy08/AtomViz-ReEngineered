import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
async function example(page: import("@playwright/test").Page) {
  await page.goto("/#workspace");
  await page.getByRole("button", { name: /Reduced melt/ }).click();
  await expect(page.getByText("Validated structure")).toBeVisible();
}
async function confirm(page: import("@playwright/test").Page) {
  for (const axis of ["x", "y", "z"])
    await page.getByLabel(`Cell ${axis} (Å)`, { exact: true }).fill("13.4");
  await page.getByRole("button", { name: "Confirm metadata" }).click();
}
test("home, real data, WebGL, frame playback, responsive navigation", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "AtomViz", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/home.png", fullPage: true });
  await page.getByRole("link", { name: /Open Workspace/ }).click();
  await expect(
    page.getByRole("heading", { name: "Data & visualization" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Reduced melt/ }).click();
  await expect(page.getByText("Validated structure")).toBeVisible();
  await expect(page.locator(".dataset-strip")).toContainText("205");
  await expect(page.locator(".molecule canvas")).toBeVisible();
  await expect(page.locator(".viewer-error")).toHaveCount(0);
  await page.getByLabel("Frame", { exact: true }).fill("20");
  await expect(page.locator(".viewer-controls")).toContainText("21");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.screenshot({ path: "test-results/workspace.png", fullPage: true });
  await confirm(page);
  await expect(page.getByText("User confirmed", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
test("coordination, RDF chart, CSV/JSON export and stale-result invalidation", async ({
  page,
}) => {
  await example(page);
  await confirm(page);
  await page.getByRole("button", { name: /Coordination Local/ }).click();
  await page.getByLabel("Central species", { exact: true }).selectOption("Si");
  await page.getByLabel("Neighbor species", { exact: true }).selectOption("O");
  await page.getByLabel("Cutoff (Å)", { exact: true }).fill("2");
  await page.getByRole("button", { name: /Run Analysis/ }).click();
  await expect(
    page.getByRole("heading", {
      name: "03 Coordination distribution",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: /Coordination distribution/ }),
  ).toBeVisible();
  const [csv] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export CSV" }).click(),
  ]);
  await csv.saveAs("test-results/coordination.csv");
  expect(await readFile("test-results/coordination.csv", "utf8")).toContain(
    "atomviz-replacement-1.0",
  );
  await page.getByRole("button", { name: /Radial distribution Pair/ }).click();
  await expect(page.getByRole("button", { name: "Export CSV" })).toHaveCount(0);
  await page.getByRole("button", { name: /Run Analysis/ }).click();
  await expect(
    page.getByRole("heading", {
      name: "03 Radial distribution function",
      exact: true,
    }),
  ).toBeVisible();
  const [json] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export JSON" }).click(),
  ]);
  await json.saveAs("test-results/rdf.json");
  const out = JSON.parse(await readFile("test-results/rdf.json", "utf8"));
  expect(out.rows).toHaveLength(80);
  expect(out.parameters.first).toBe("Si");
  expect(out.metadata.cell).toEqual([13.4, 13.4, 13.4]);
  await page.screenshot({ path: "test-results/rdf.png", fullPage: true });
  await page.getByLabel("Cutoff (Å)", { exact: true }).fill("10");
  await page.getByRole("button", { name: /Run Analysis/ }).click();
  await expect(page.getByRole("alert")).toContainText("half");
});
test("file upload, malformed input, bond persistence, wrapped diffusion rejection", async ({
  page,
}) => {
  await page.goto("/#workspace");
  await page.getByLabel("Trajectory file", { exact: true }).setInputFiles({
    name: "bad",
    mimeType: "text/plain",
    buffer: Buffer.from("bad"),
  });
  await page
    .getByLabel("Species file", { exact: true })
    .setInputFiles("public/examples/SPECIES_FILE_reduced");
  await page.getByRole("button", { name: /Load & validate/ }).click();
  await expect(page.getByRole("alert")).toContainText("incomplete");
  await page
    .getByLabel("Trajectory file", { exact: true })
    .setInputFiles("public/examples/mg32s32o92s4-reducedMelt");
  await page.getByRole("button", { name: /Load & validate/ }).click();
  await expect(page.getByText("Validated structure")).toBeVisible();
  await confirm(page);
  await page.getByRole("button", { name: /Bond lifetime Geometric/ }).click();
  await page.getByLabel("Central species", { exact: true }).selectOption("Si");
  await page.getByLabel("Neighbor species", { exact: true }).selectOption("O");
  await page.getByLabel("Last frame (inclusive)", { exact: true }).fill("10");
  await page.getByLabel("Cutoff (Å)", { exact: true }).fill("2");
  await page.getByRole("button", { name: /Run Analysis/ }).click();
  await expect(
    page.getByRole("heading", { name: "03 Bond persistence", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Diffusion Mean/ }).click();
  await page.getByRole("button", { name: /Run Analysis/ }).click();
  await expect(page.getByRole("alert")).toContainText("unwrapped");
});
test("MSD on explicitly unwrapped synthetic data", async ({ page }) => {
  await page.goto("/#workspace");
  const t =
    "2 2\n1 10 10 10 1\n0\nCAR\nSynthetic ballistic motion\nDirect configuration= 0\n9 0 0\n0 0 0\nDirect configuration= 1\n11 0 0\n0 0 0\nDirect configuration= 2\n13 0 0\n0 0 0\n";
  await page.getByLabel("Trajectory file", { exact: true }).setInputFiles({
    name: "synthetic",
    mimeType: "text/plain",
    buffer: Buffer.from(t),
  });
  await page.getByLabel("Species file", { exact: true }).setInputFiles({
    name: "species",
    mimeType: "text/plain",
    buffer: Buffer.from("#Species\nA 1 0 0\nB 2 1 1"),
  });
  await page.getByRole("button", { name: /Load & validate/ }).click();
  await expect(page.getByText("Validated structure")).toBeVisible();
  await page.getByRole("button", { name: /Diffusion Mean/ }).click();
  await page
    .getByLabel("Coordinates", { exact: true })
    .selectOption("cartesian");
  for (const axis of ["x", "y", "z"])
    await page.getByLabel(`Cell ${axis} (Å)`, { exact: true }).fill("10");
  await page.getByLabel("Time per label increment", { exact: true }).fill("1");
  await page
    .getByLabel("Coordinates are confirmed unwrapped", { exact: true })
    .check();
  await page.getByRole("button", { name: "Confirm metadata" }).click();
  await page.getByLabel("Atom selection", { exact: true }).selectOption("A");
  await page.getByRole("button", { name: /Run Analysis/ }).click();
  await expect(
    page.getByRole("heading", {
      name: "03 Mean-squared displacement",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".metrics")).toContainText("1.3333");
});
test("cancellation and switching modules suppress stale results", async ({
  page,
}) => {
  await example(page);
  await confirm(page);
  await page.getByRole("button", { name: /Bond lifetime Geometric/ }).click();
  await page.getByLabel("Last frame (inclusive)", { exact: true }).fill("100");
  await page.getByLabel("Cutoff (Å)", { exact: true }).fill("6");
  await page.getByRole("button", { name: /Run Analysis/ }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("cancelled");
  await expect(page.locator(".results")).toHaveCount(0);
  await page.getByRole("button", { name: /Coordination Local/ }).click();
  await page.getByRole("button", { name: /Run Analysis/ }).click();
  await page
    .getByRole("button", { name: /Data & visualization Inspect/ })
    .click();
  await expect(page.locator(".results")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Trajectory explorer" }),
  ).toBeVisible();
});
