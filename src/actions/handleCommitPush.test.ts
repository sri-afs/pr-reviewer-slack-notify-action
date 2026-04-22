import { describe, it, expect, vi } from "vitest";

import { logger } from "../utils/logger";

import { handleCommitPush } from "./handleCommitPush";

vi.mock("../utils/logger");

const mockLogger = vi.mocked(logger);

describe("handleCommitPush (v1 no-op)", () => {
  it("logs a no-op message and resolves", async () => {
    await expect(handleCommitPush()).resolves.toBeUndefined();
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining("v1 no-op"),
    );
  });
});
