import "@testing-library/jest-dom/vitest";

import { afterEach } from "vitest";

import { cleanup } from "@testing-library/react";

/**
 * Clean up the React DOM after each test.
 *
 * This prevents rendered components from leaking
 * into subsequent tests.
 */
afterEach(() => {
  cleanup();
});
