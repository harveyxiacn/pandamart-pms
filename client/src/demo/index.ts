import { DEMO_MODE } from "./constants";

/**
 * Install the in-browser backend for the public demo build.
 *
 * The mock is loaded with a dynamic import so production builds never ship
 * the demo dataset or its localStorage seeding side effects.
 */
export async function installDemoMock(): Promise<void> {
  if (!DEMO_MODE) return;
  const [{ apiClient }, { createDemoAdapter }] = await Promise.all([
    import("../api/client"),
    import("./mockServer"),
  ]);
  apiClient.defaults.adapter = createDemoAdapter();
}

/** Wipe local demo edits and reload from a fresh deterministic dataset. */
export async function resetDemoData(): Promise<void> {
  const { resetDemoDb } = await import("./seed");
  resetDemoDb();
  window.location.reload();
}
