import * as core from "@actions/core";
import * as github from "@actions/github";
import { describe, it, expect, beforeEach, vi } from "vitest";

import { getRequestedTeams } from "./getRequestedTeams";

vi.mock("@actions/core");
vi.mock("@actions/github");
vi.mock("./fail");
vi.mock("./logger");

const mockListRequestedReviewers = vi.fn();
const mockOctokit = {
  rest: {
    pulls: {
      listRequestedReviewers: mockListRequestedReviewers,
    },
  },
};

const mockCore = vi.mocked(core);
const mockGithub = vi.mocked(github);

describe("getRequestedTeams", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCore.getInput.mockReturnValue("fake-token");
    mockGithub.getOctokit.mockReturnValue(mockOctokit as any);
    Object.defineProperty(mockGithub, "context", {
      value: {
        payload: {
          repository: { owner: { login: "ApprenticeFS" }, name: "monorepo" },
          pull_request: { number: 42 },
        },
      },
      writable: true,
      configurable: true,
    });
  });

  it("returns requested team slugs from listRequestedReviewers API", async () => {
    mockListRequestedReviewers.mockResolvedValue({
      data: {
        users: [],
        teams: [{ slug: "backend" }, { slug: "frontend" }],
      },
    });

    const result = await getRequestedTeams();

    expect(result).toEqual(["backend", "frontend"]);
    expect(mockListRequestedReviewers).toHaveBeenCalledWith({
      owner: "ApprenticeFS",
      repo: "monorepo",
      pull_number: 42,
    });
  });

  it("returns empty array when no teams are requested", async () => {
    mockListRequestedReviewers.mockResolvedValue({
      data: { users: [], teams: [] },
    });

    const result = await getRequestedTeams();

    expect(result).toEqual([]);
  });

  it("handles missing teams field", async () => {
    mockListRequestedReviewers.mockResolvedValue({
      data: { users: [] },
    });

    const result = await getRequestedTeams();

    expect(result).toEqual([]);
  });

  it("ignores individual reviewers (teams-only v1)", async () => {
    mockListRequestedReviewers.mockResolvedValue({
      data: {
        users: [{ login: "alice" }, { login: "bob" }],
        teams: [{ slug: "automation" }],
      },
    });

    const result = await getRequestedTeams();

    expect(result).toEqual(["automation"]);
  });

  it("filters out teams with missing slug", async () => {
    mockListRequestedReviewers.mockResolvedValue({
      data: {
        users: [],
        teams: [
          { slug: "backend" },
          { slug: "" },
          { slug: null },
          { slug: "frontend" },
        ],
      },
    });

    const result = await getRequestedTeams();

    expect(result).toEqual(["backend", "frontend"]);
  });

  it("returns empty when repository is missing from payload", async () => {
    Object.defineProperty(mockGithub, "context", {
      value: {
        payload: { pull_request: { number: 42 } },
      },
      writable: true,
      configurable: true,
    });

    const result = await getRequestedTeams();

    expect(result).toEqual([]);
    expect(mockListRequestedReviewers).not.toHaveBeenCalled();
  });
});
