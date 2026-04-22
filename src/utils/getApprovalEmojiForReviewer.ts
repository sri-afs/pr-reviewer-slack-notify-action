import * as core from "@actions/core";
import * as github from "@actions/github";

import { getTeamMappingFromS3 } from "./getEngineersFromS3";
import { logger } from "./logger";

const DEFAULT_APPROVAL_EMOJI = "white_check_mark";

/**
 * Determines which emoji to add when a reviewer approves the PR.
 *
 * Logic (v2.1):
 * 1. Fetch the team mapping (teams + their emojis).
 * 2. For each team with an approval_emoji, check whether the reviewer is a
 *    member via GitHub's `getMembershipForUserInOrg` API.
 * 3. Return the first team's approval_emoji the reviewer is a member of.
 * 4. If no match, fall back to :white_check_mark: and log a warning.
 *
 * Why we iterate ALL mapped teams instead of just "currently-requested" teams:
 * when a reviewer approves on behalf of their team, GitHub immediately removes
 * that team from the PR's requested_teams list. So by the time our action
 * runs in response to the review event, the reviewer's team is no longer
 * "requested" and scoping the lookup to requested teams would always miss.
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

    const { teams } = await getTeamMappingFromS3();

    for (const mapping of teams) {
      if (!mapping.approval_emoji) {
        // Team has no emoji configured — skip.
        continue;
      }

      try {
        const { data: membership } =
          await octokit.rest.teams.getMembershipForUserInOrg({
            org,
            team_slug: mapping.github_team_slug,
            username: reviewerLogin,
          });

        if (membership.state === "active") {
          logger.info(
            `Reviewer '${reviewerLogin}' matched team '${mapping.github_team_slug}' — using approval emoji ':${mapping.approval_emoji}:'`,
          );
          return mapping.approval_emoji;
        }
      } catch (error: any) {
        // 404 from getMembershipForUserInOrg means reviewer is not in this team — expected, move on.
        if (error?.status !== 404) {
          logger.warn(
            `Unexpected error checking membership for '${reviewerLogin}' in '${mapping.github_team_slug}': ${error?.message || error}`,
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
