import * as core from "@actions/core";
import * as github from "@actions/github";
import { describe, it, expect, beforeEach, vi } from "vitest";

import { getTeamMappingFromS3 } from "./getEngineersFromS3";
import { getApprovalEmojiForReviewer } from "./getApprovalEmojiForReviewer";
import { logger } from "./logger";

vi.mock("@actions/core");
vi.mock("@actions/github");
vi.mock("./getEngineersFromS3");
vi.mock("./logger");

const mockGetMembership = vi.fn();
const mockOctokit = {
  rest: {
    teams: {
      getMembershipForUserInOrg: mockGetMembership,
    },
  },
};

const mockCore = vi.mocked(core);
const mockGithub = vi.mocked(github);
const mockGetTeamMappingFromS3 = vi.mocked(getTeamMappingFromS3);
const mockLogger = vi.mocked(logger);

const mappingWithEmojis = {
  teams: [
    {
      github_team_slug: "backend",
      slack_user_group_id: "S1",
      approval_emoji: "be",
    },
    {
      github_team_slug: "frontend",
      slack_user_group_id: "S2",
      approval_emoji: "fe",
    },
    {
      github_team_slug: "pdf-reporting",
      slack_user_group_id: "S3",
      // no approval_emoji
    },
    {
      github_team_slug: "infra",
      slack_user_group_id: "S4",
      approval_emoji: "inf",
    },
  ],
};

describe("getApprovalEmojiForReviewer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCore.getInput.mockReturnValue("fake-token");
    mockGithub.getOctokit.mockReturnValue(mockOctokit as any);
    Object.defineProperty(mockGithub, "context", {
      value: {
        payload: {
          repository: { owner: { login: "ApprenticeFS" } },
        },
      },
      writable: true,
      configurable: true,
    });
  });

  it("returns the team's approval_emoji when reviewer is a member of a mapped team", async () => {
    mockGetTeamMappingFromS3.mockResolvedValue(mappingWithEmojis as any);
    // Reviewer is in backend
    mockGetMembership.mockResolvedValue({
      data: { state: "active" },
    });

    const result = await getApprovalEmojiForReviewer("alice");

    expect(result).toBe("be"); // first mapped team with emoji + membership
    expect(mockGetMembership).toHaveBeenCalledWith({
      org: "ApprenticeFS",
      team_slug: "backend",
      username: "alice",
    });
  });

  it("iterates through all mapped teams and picks the first the reviewer belongs to", async () => {
    mockGetTeamMappingFromS3.mockResolvedValue(mappingWithEmojis as any);
    // Not in backend (404), not in frontend (404), skip pdf-reporting (no emoji), in infra
    mockGetMembership
      .mockRejectedValueOnce({ status: 404 }) // backend
      .mockRejectedValueOnce({ status: 404 }) // frontend
      .mockResolvedValueOnce({ data: { state: "active" } }); // infra

    const result = await getApprovalEmojiForReviewer("marcus");

    expect(result).toBe("inf");
    // Should have called for backend, frontend, infra — NOT pdf-reporting (skipped)
    expect(mockGetMembership).toHaveBeenCalledTimes(3);
    expect(mockGetMembership).not.toHaveBeenCalledWith(
      expect.objectContaining({ team_slug: "pdf-reporting" }),
    );
  });

  it("skips teams that have no approval_emoji set", async () => {
    mockGetTeamMappingFromS3.mockResolvedValue({
      teams: [
        {
          github_team_slug: "pdf-reporting",
          slack_user_group_id: "S3",
          // no approval_emoji
        },
        {
          github_team_slug: "backend",
          slack_user_group_id: "S1",
          approval_emoji: "be",
        },
      ],
    } as any);
    mockGetMembership.mockResolvedValue({ data: { state: "active" } });

    const result = await getApprovalEmojiForReviewer("alice");

    expect(result).toBe("be");
    // Only backend should have been checked
    expect(mockGetMembership).toHaveBeenCalledTimes(1);
    expect(mockGetMembership).toHaveBeenCalledWith(
      expect.objectContaining({ team_slug: "backend" }),
    );
  });

  it("finds the reviewer's team even if that team is no longer in requested_teams", async () => {
    // This is the key v2.1 scenario: the reviewer's team is satisfied and
    // removed from requested_teams at the moment of approval, but we still
    // need to find the right emoji based on their actual membership.
    mockGetTeamMappingFromS3.mockResolvedValue(mappingWithEmojis as any);
    mockGetMembership
      .mockRejectedValueOnce({ status: 404 }) // backend (not in)
      .mockRejectedValueOnce({ status: 404 }) // frontend (not in)
      .mockResolvedValueOnce({ data: { state: "active" } }); // infra (in)

    const result = await getApprovalEmojiForReviewer("marcus");

    expect(result).toBe("inf");
  });

  it("falls back to :white_check_mark: when reviewer is not in any mapped team", async () => {
    mockGetTeamMappingFromS3.mockResolvedValue(mappingWithEmojis as any);
    mockGetMembership.mockRejectedValue({ status: 404 });

    const result = await getApprovalEmojiForReviewer("outsider");

    expect(result).toBe("white_check_mark");
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining("falling back"),
    );
  });

  it("falls back to :white_check_mark: when mapping has no teams with emojis", async () => {
    mockGetTeamMappingFromS3.mockResolvedValue({
      teams: [
        { github_team_slug: "pdf-reporting", slack_user_group_id: "S3" },
        { github_team_slug: "sre", slack_user_group_id: "S4" },
      ],
    } as any);

    const result = await getApprovalEmojiForReviewer("alice");

    expect(result).toBe("white_check_mark");
    expect(mockGetMembership).not.toHaveBeenCalled();
  });

  it("falls back gracefully when getTeamMappingFromS3 throws", async () => {
    mockGetTeamMappingFromS3.mockRejectedValue(new Error("S3 down"));

    const result = await getApprovalEmojiForReviewer("alice");

    expect(result).toBe("white_check_mark");
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  it("falls back when repository owner is missing from payload", async () => {
    Object.defineProperty(mockGithub, "context", {
      value: { payload: {} },
      writable: true,
      configurable: true,
    });

    const result = await getApprovalEmojiForReviewer("alice");

    expect(result).toBe("white_check_mark");
    expect(mockGetTeamMappingFromS3).not.toHaveBeenCalled();
  });

  it("logs a warning for non-404 membership errors but keeps looking", async () => {
    mockGetTeamMappingFromS3.mockResolvedValue(mappingWithEmojis as any);
    mockGetMembership
      .mockRejectedValueOnce({ status: 500, message: "Internal Error" }) // backend
      .mockResolvedValueOnce({ data: { state: "active" } }); // frontend

    const result = await getApprovalEmojiForReviewer("alice");

    expect(result).toBe("fe");
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining("Unexpected error checking membership"),
    );
  });

  it("ignores reviewer with inactive membership state", async () => {
    mockGetTeamMappingFromS3.mockResolvedValue(mappingWithEmojis as any);
    // Imagine state="pending" (invited but not accepted)
    mockGetMembership.mockResolvedValue({
      data: { state: "pending" },
    });

    const result = await getApprovalEmojiForReviewer("alice");

    // pending state shouldn't count — should fall through to fallback
    expect(result).toBe("white_check_mark");
  });
});
