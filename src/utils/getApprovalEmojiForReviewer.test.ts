import * as core from "@actions/core";
import * as github from "@actions/github";
import { describe, it, expect, beforeEach, vi } from "vitest";

import { getTeamMappingFromS3 } from "./getEngineersFromS3";
import { getApprovalEmojiForReviewer } from "./getApprovalEmojiForReviewer";
import { getRequestedTeams } from "./getRequestedTeams";
import { logger } from "./logger";

vi.mock("@actions/core");
vi.mock("@actions/github");
vi.mock("./getEngineersFromS3");
vi.mock("./getRequestedTeams");
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
const mockGetRequestedTeams = vi.mocked(getRequestedTeams);
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
    mockGetRequestedTeams.mockResolvedValue(["backend", "frontend"]);
    mockGetMembership.mockResolvedValue({
      data: { state: "active" },
    });

    const result = await getApprovalEmojiForReviewer("alice");

    expect(result).toBe("be"); // first match — backend
    expect(mockGetMembership).toHaveBeenCalledWith({
      org: "ApprenticeFS",
      team_slug: "backend",
      username: "alice",
    });
  });

  it("iterates through requested teams and picks the first the reviewer belongs to", async () => {
    mockGetTeamMappingFromS3.mockResolvedValue(mappingWithEmojis as any);
    mockGetRequestedTeams.mockResolvedValue(["backend", "frontend"]);
    // Not in backend (404), but in frontend
    mockGetMembership
      .mockRejectedValueOnce({ status: 404 })
      .mockResolvedValueOnce({ data: { state: "active" } });

    const result = await getApprovalEmojiForReviewer("bob");

    expect(result).toBe("fe");
    expect(mockGetMembership).toHaveBeenCalledTimes(2);
  });

  it("skips teams that have no approval_emoji set", async () => {
    mockGetTeamMappingFromS3.mockResolvedValue(mappingWithEmojis as any);
    // pdf-reporting has no emoji — should skip without making API call
    mockGetRequestedTeams.mockResolvedValue(["pdf-reporting", "backend"]);
    mockGetMembership.mockResolvedValue({ data: { state: "active" } });

    const result = await getApprovalEmojiForReviewer("alice");

    expect(result).toBe("be");
    // Only backend membership should be checked, not pdf-reporting
    expect(mockGetMembership).toHaveBeenCalledTimes(1);
    expect(mockGetMembership).toHaveBeenCalledWith(
      expect.objectContaining({ team_slug: "backend" }),
    );
  });

  it("falls back to :white_check_mark: when reviewer is not in any mapped team", async () => {
    mockGetTeamMappingFromS3.mockResolvedValue(mappingWithEmojis as any);
    mockGetRequestedTeams.mockResolvedValue(["backend", "frontend"]);
    mockGetMembership.mockRejectedValue({ status: 404 });

    const result = await getApprovalEmojiForReviewer("outsider");

    expect(result).toBe("white_check_mark");
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining("falling back"),
    );
  });

  it("falls back to :white_check_mark: when no teams are requested", async () => {
    mockGetTeamMappingFromS3.mockResolvedValue(mappingWithEmojis as any);
    mockGetRequestedTeams.mockResolvedValue([]);

    const result = await getApprovalEmojiForReviewer("alice");

    expect(result).toBe("white_check_mark");
    expect(mockGetMembership).not.toHaveBeenCalled();
  });

  it("falls back gracefully when getTeamMappingFromS3 throws", async () => {
    mockGetTeamMappingFromS3.mockRejectedValue(new Error("S3 down"));
    mockGetRequestedTeams.mockResolvedValue(["backend"]);

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
    expect(mockGetRequestedTeams).not.toHaveBeenCalled();
  });

  it("logs a warning for non-404 membership errors but keeps looking", async () => {
    mockGetTeamMappingFromS3.mockResolvedValue(mappingWithEmojis as any);
    mockGetRequestedTeams.mockResolvedValue(["backend", "frontend"]);
    mockGetMembership
      .mockRejectedValueOnce({ status: 500, message: "Internal Error" })
      .mockResolvedValueOnce({ data: { state: "active" } });

    const result = await getApprovalEmojiForReviewer("alice");

    expect(result).toBe("fe");
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining("Unexpected error checking membership"),
    );
  });
});
