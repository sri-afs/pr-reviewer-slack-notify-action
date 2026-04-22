import { describe, it, expect, beforeEach, vi } from "vitest";

import { createTeamsToAtString } from "./createTeamsToAtString";
import { fail } from "./fail";
import { getTeamMappingFromS3 } from "./getEngineersFromS3";

vi.mock("./fail");
vi.mock("./getEngineersFromS3");
vi.mock("./logger");

const mockFail = vi.mocked(fail);
const mockGetTeamMappingFromS3 = vi.mocked(getTeamMappingFromS3);

const mockTeams = [
  { github_team_slug: "backend", slack_user_group_id: "S07F6TF8N86" },
  { github_team_slug: "frontend", slack_user_group_id: "S07FG1G7ELC" },
  { github_team_slug: "automation", slack_user_group_id: "S07G2AJCERE" },
];

describe("createTeamsToAtString", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTeamMappingFromS3.mockResolvedValue({
      teams: mockTeams,
    } as any);
  });

  it("maps a single team slug to a Slack user group mention", async () => {
    const result = await createTeamsToAtString(["backend"]);

    expect(result).toBe("<!subteam^S07F6TF8N86>");
  });

  it("maps multiple team slugs to space-separated user group mentions", async () => {
    const result = await createTeamsToAtString([
      "backend",
      "frontend",
      "automation",
    ]);

    expect(result).toBe(
      "<!subteam^S07F6TF8N86> <!subteam^S07FG1G7ELC> <!subteam^S07G2AJCERE>",
    );
  });

  it("silently skips team slugs that have no mapping", async () => {
    const result = await createTeamsToAtString(["backend", "not-mapped"]);

    expect(result).toBe("<!subteam^S07F6TF8N86>");
  });

  it("returns empty string when no team slugs match", async () => {
    const result = await createTeamsToAtString(["some-other-team"]);

    expect(result).toBe("");
  });

  it("returns empty string when teamSlugs array is empty", async () => {
    const result = await createTeamsToAtString([]);

    expect(result).toBe("");
  });

  it("calls fail when getTeamMappingFromS3 throws", async () => {
    const error = new Error("S3 fetch failed");
    mockGetTeamMappingFromS3.mockRejectedValue(error);

    const result = await createTeamsToAtString(["backend"]);

    expect(mockFail).toHaveBeenCalledWith(error);
    expect(result).toBe("");
  });
});
