import * as core from "@actions/core";
import * as github from "@actions/github";

import { getTeamMappingFromS3 } from "./getEngineersFromS3";
import { getRequestedTeams } from "./getRequestedTeams";
import { logger } from "./logger";

const DEFAULT_APPROVAL_EMOJI = "white_check_mark";

/**
 * Determines which emoji to add when a reviewer approves the PR.
 *
 * Logic:
 * 1. Fetch the team mapping and the list of teams currently requested on the PR.
 * 2. For each requested team, if it has an `approval_emoji` set AND the reviewer
 *    is a member of that team, return that emoji.
 * 3. If no match, fall back to the default (:white_check_mark:) and log a warning.
 *
 * The fallback exists for edge cases such as approvals from someone outside the
 * tracked teams, teams without emoji mappings, or when the mapping fetch fails.
 */
export const getApprovalEmojiForReviewer = async (
  reviewerLogin: string,
): Promise<string> => {
  try {
    const { repository } = github.context.payload;
    if (!repository?.owner?.login) {
      logger.warn(
        "Missing repository owner in payload — falling back to default approval emoji",
      );
      return DEFAULT_APPROVAL_EMOJI;
    }

    const org = repository.owner.login;
    const octokit = github.getOctokit(core.getInput("github-token"));

    const [{ teams }, requestedTeamSlugs] = await Promise.all([
      getTeamMappingFromS3(),
      getRequestedTeams(),
    ]);

    for (const teamSlug of requestedTeamSlugs) {
      const mapping = teams.find((t) => t.github_team_slug === teamSlug);
      if (!mapping?.approval_emoji) {
        // Team not in mapping or has no emoji — skip to next team.
        continue;
      }

      try {
        const { data: membership } =
          await octokit.rest.teams.getMembershipForUserInOrg({
            org,
            team_slug: teamSlug,
            username: reviewerLogin,
          });

        if (membership.state === "active") {
          logger.info(
            `Reviewer '${reviewerLogin}' matched team '${teamSlug}' — using approval emoji ':${mapping.approval_emoji}:'`,
          );
          return mapping.approval_emoji;
        }
      } catch (error: any) {
        // 404 from getMembershipForUserInOrg means reviewer is not in this team — expected, move on.
        if (error?.status !== 404) {
          logger.warn(
            `Unexpected error checking membership for '${reviewerLogin}' in '${teamSlug}': ${error?.message || error}`,
          );
        }
      }
    }

    logger.warn(
      `No matching team emoji for reviewer '${reviewerLogin}' — falling back to ':${DEFAULT_APPROVAL_EMOJI}:'`,
    );
    return DEFAULT_APPROVAL_EMOJI;
  } catch (error: any) {
    logger.warn(
      `Failed to resolve approval emoji for '${reviewerLogin}': ${error?.message || error}. Falling back to ':${DEFAULT_APPROVAL_EMOJI}:'`,
    );
    return DEFAULT_APPROVAL_EMOJI;
  }
};
