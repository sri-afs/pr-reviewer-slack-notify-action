import * as core from "@actions/core";
import * as github from "@actions/github";
import { describe, it, expect, beforeEach, vi } from "vitest";

import { assignCodeownersAsReviewers } from "./assignReviewers";
import { logger } from "./logger";
import { parseCodeowners } from "./parseCodeowners";

vi.mock("@actions/core");
vi.mock("@actions/github");
vi.mock("./logger");
vi.mock("./parseCodeowners");

const mockRequestReviewers = vi.fn();
const mockListRequestedReviewers = vi.fn();
const mockListComments = vi.fn();
const mockCreateComment = vi.fn();

const mockOctokit = {
  rest: {
    pulls: {
      requestReviewers: mockRequestReviewers,
      listRequestedReviewers: mockListRequestedReviewers,
    },
    issues: {
      listComments: mockListComments,
      createComment: mockCreateComment,
    },
  },
};

const mockCore = vi.mocked(core);
const mockGithub = vi.mocked(github);
const mockParseCodeowners = vi.mocked(parseCodeowners);

const pull_request = {
  number: 42,
  user: { login: "author" },
  base: { ref: "main" },
};

const repository = {
  name: "test-repo",
  owner: { login: "test-org" },
};

describe("assignCodeownersAsReviewers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCore.getInput.mockReturnValue("fake-token");
    mockGithub.getOctokit.mockReturnValue(mockOctokit as any);
    mockListComments.mockResolvedValue({ data: [] });
    mockCreateComment.mockResolvedValue({});
  });

  it("successfully assigns teams from CODEOWNERS", async () => {
    mockParseCodeowners.mockResolvedValue({
      users: [],
      teams: ["test-org/frontend", "test-org/backend"],
      success: true,
    });

    mockRequestReviewers.mockResolvedValue({
      data: {
        requested_reviewers: [],
        requested_teams: [{ slug: "frontend" }, { slug: "backend" }],
      },
    });

    const result = await assignCodeownersAsReviewers(pull_request, repository);

    expect(result.success).toBe(true);
    expect(result.assigned.teams).toEqual(["frontend", "backend"]);
    expect(result.errors).toEqual([]);
    expect(mockRequestReviewers).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: "test-org",
        repo: "test-repo",
        pull_number: 42,
        team_reviewers: ["test-org/frontend", "test-org/backend"],
      }),
    );
  });

  it("does not send a reviewers field (teams-only)", async () => {
    mockParseCodeowners.mockResolvedValue({
      users: [],
      teams: ["test-org/frontend"],
      success: true,
    });

    mockRequestReviewers.mockResolvedValue({
      data: {
        requested_reviewers: [],
        requested_teams: [{ slug: "frontend" }],
      },
    });

    await assignCodeownersAsReviewers(pull_request, repository);

    // Ensure we never pass a `reviewers` field (we don't assign individuals in v1)
    const callArg = mockRequestReviewers.mock.calls[0][0];
    expect(callArg).not.toHaveProperty("reviewers");
    expect(callArg).toHaveProperty("team_reviewers");
  });

  it("returns success: false when parseCodeowners fails", async () => {
    mockParseCodeowners.mockResolvedValue({
      users: [],
      teams: [],
      success: false,
    });

    const result = await assignCodeownersAsReviewers(pull_request, repository);

    expect(result.success).toBe(false);
    expect(result.errors).toContain(
      "No CODEOWNERS file found or parsing failed",
    );
    expect(mockRequestReviewers).not.toHaveBeenCalled();
  });

  it("returns success: false when CODEOWNERS yields no teams", async () => {
    mockParseCodeowners.mockResolvedValue({
      users: [],
      teams: [],
      success: true,
    });

    const result = await assignCodeownersAsReviewers(pull_request, repository);

    expect(result.success).toBe(false);
    expect(result.errors).toContain(
      "No valid team reviewers available in CODEOWNERS",
    );
    expect(mockRequestReviewers).not.toHaveBeenCalled();
  });

  it("handles 422 error from requestReviewers", async () => {
    mockParseCodeowners.mockResolvedValue({
      users: [],
      teams: ["test-org/frontend"],
      success: true,
    });

    mockRequestReviewers.mockRejectedValue({
      status: 422,
      message: "Validation Failed",
    });

    mockListRequestedReviewers.mockResolvedValue({
      data: { users: [], teams: [] },
    });

    const result = await assignCodeownersAsReviewers(pull_request, repository);

    expect(result.success).toBe(false);
    expect(result.errors).toContain(
      "Some reviewers could not be assigned (may not have repository access or already be reviewers)",
    );
  });

  it("handles 403 error from requestReviewers", async () => {
    mockParseCodeowners.mockResolvedValue({
      users: [],
      teams: ["test-org/frontend"],
      success: true,
    });

    mockRequestReviewers.mockRejectedValue({
      status: 403,
      message: "Forbidden",
    });

    mockListRequestedReviewers.mockResolvedValue({
      data: { users: [], teams: [] },
    });

    const result = await assignCodeownersAsReviewers(pull_request, repository);

    expect(result.success).toBe(false);
    expect(result.errors).toContain(
      "Insufficient permissions to assign reviewers",
    );
  });

  it("skips duplicate PR comment if one already exists", async () => {
    mockParseCodeowners.mockResolvedValue({
      users: [],
      teams: ["test-org/frontend"],
      success: true,
    });

    mockRequestReviewers.mockResolvedValue({
      data: {
        requested_reviewers: [],
        requested_teams: [{ slug: "frontend" }],
      },
    });

    mockListComments.mockResolvedValue({
      data: [
        {
          body: "🤖 **Auto-assigned reviewers from CODEOWNERS**\n\nSome previous content",
        },
      ],
    });

    const result = await assignCodeownersAsReviewers(pull_request, repository);

    expect(result.success).toBe(true);
    expect(mockCreateComment).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      "Auto-assignment comment already exists, skipping duplicate",
    );
  });
});
