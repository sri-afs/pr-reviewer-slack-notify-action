import { describe, it, expect, beforeEach, vi } from "vitest";

import { getPullRequest } from "./getPullRequest";
import { getRequestedTeams } from "./getRequestedTeams";

vi.mock("./getPullRequest");
vi.mock("./fail");
vi.mock("./logger");

const mockGetPullRequest = vi.mocked(getPullRequest);

describe("getRequestedTeams", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns requested team slugs from the PR", async () => {
    mockGetPullRequest.mockResolvedValue({
      requested_reviewers: [],
      requested_teams: [{ slug: "backend" }, { slug: "frontend" }],
    } as any);

    const result = await getRequestedTeams();

    expect(result).toEqual(["backend", "frontend"]);
  });

  it("returns empty array when no teams requested", async () => {
    mockGetPullRequest.mockResolvedValue({
      requested_reviewers: [],
      requested_teams: [],
    } as any);

    const result = await getRequestedTeams();

    expect(result).toEqual([]);
  });

  it("handles missing requested_teams field", async () => {
    mockGetPullRequest.mockResolvedValue({
      requested_reviewers: [],
    } as any);

    const result = await getRequestedTeams();

    expect(result).toEqual([]);
  });

  it("ignores individual reviewers (teams-only v1)", async () => {
    mockGetPullRequest.mockResolvedValue({
      requested_reviewers: [{ login: "alice" }, { login: "bob" }],
      requested_teams: [{ slug: "automation" }],
    } as any);

    const result = await getRequestedTeams();

    expect(result).toEqual(["automation"]);
  });

  it("filters out teams with missing slug", async () => {
    mockGetPullRequest.mockResolvedValue({
      requested_reviewers: [],
      requested_teams: [
        { slug: "backend" },
        { slug: "" }, // invalid - missing slug
        { slug: null }, // invalid - null slug
        { slug: "frontend" },
      ],
    } as any);

    const result = await getRequestedTeams();

    expect(result).toEqual(["backend", "frontend"]);
  });
});
