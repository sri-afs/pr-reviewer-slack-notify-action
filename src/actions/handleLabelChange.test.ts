import * as core from "@actions/core";
import * as github from "@actions/github";
import { describe, it, expect, beforeEach, vi } from "vitest";

import { fail } from "../utils/fail";
import { getSlackMessageId } from "../utils/getSlackMessageId";

import { createInitialMessage } from "./createInitialMessage";
import { handleLabelChange } from "./handleLabelChange";

vi.mock("@actions/core");
vi.mock("@actions/github");
vi.mock("./createInitialMessage");
vi.mock("../utils/fail");
vi.mock("../utils/getSlackMessageId");
vi.mock("../utils/logger");

const mockCore = vi.mocked(core);
const mockGithub = vi.mocked(github);
const mockCreateInitialMessage = vi.mocked(createInitialMessage);
const mockFail = vi.mocked(fail);
const mockGetSlackMessageId = vi.mocked(getSlackMessageId);

const basePayload = {
  pull_request: {
    number: 42,
    user: { login: "pr-author" },
    labels: [{ name: "needs-review" }],
  },
  repository: { owner: { login: "org" }, name: "repo" },
  sender: { login: "labeler-user" },
  label: { name: "needs-review" },
};

describe("handleLabelChange", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockCore.getInput.mockImplementation((name: string) => {
      if (name === "label-for-initial-notification") return "needs-review";
      return "";
    });
    mockCore.summary = {
      addRaw: vi.fn().mockReturnThis(),
      write: vi.fn().mockResolvedValue(undefined),
    } as any;

    Object.defineProperty(mockGithub, "context", {
      value: { payload: { ...basePayload } },
      writable: true,
      configurable: true,
    });

    mockGetSlackMessageId.mockResolvedValue(undefined as any);
    mockCreateInitialMessage.mockResolvedValue("SLACK_MESSAGE_ID:123.456");
  });

  it("creates initial message when label-for-initial-notification is applied and no existing thread", async () => {
    mockGetSlackMessageId.mockResolvedValue(undefined as any);

    await handleLabelChange();

    expect(mockGetSlackMessageId).toHaveBeenCalled();
    expect(mockCreateInitialMessage).toHaveBeenCalled();
  });

  it("skips when Slack thread already exists for label-for-initial-notification", async () => {
    mockGetSlackMessageId.mockResolvedValue("1234567890.123456");

    await handleLabelChange();

    expect(mockCreateInitialMessage).not.toHaveBeenCalled();
    expect(mockCore.summary.addRaw).toHaveBeenCalledWith(
      expect.stringContaining("already exists"),
    );
  });

  it("no-ops when a different label is applied", async () => {
    Object.defineProperty(mockGithub, "context", {
      value: {
        payload: {
          ...basePayload,
          label: { name: "some-other-label" },
        },
      },
      writable: true,
      configurable: true,
    });

    await handleLabelChange();

    expect(mockCreateInitialMessage).not.toHaveBeenCalled();
  });

  it("throws when no pull_request on payload", async () => {
    Object.defineProperty(mockGithub, "context", {
      value: {
        payload: {
          ...basePayload,
          pull_request: undefined,
        },
      },
      writable: true,
      configurable: true,
    });

    await expect(handleLabelChange()).rejects.toThrow(
      "No pull_request found on github.context.payload",
    );
    expect(mockFail).toHaveBeenCalled();
  });

  it("throws when no sender on payload", async () => {
    Object.defineProperty(mockGithub, "context", {
      value: {
        payload: {
          ...basePayload,
          sender: undefined,
        },
      },
      writable: true,
      configurable: true,
    });

    await expect(handleLabelChange()).rejects.toThrow(
      "No sender found on github.context.payload",
    );
    expect(mockFail).toHaveBeenCalled();
  });
});
