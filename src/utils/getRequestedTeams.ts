import * as core from "@actions/core";
import * as github from "@actions/github";

import { fail } from "./fail";
import { logger } from "./logger";

/**
 * Returns the team slugs that are currently requested as reviewers on the PR.
 * v1: teams only.
 *
 * Uses the dedicated listRequestedReviewers API rather than reading
 * pr.requested_teams from the PR object — the latter is unreliable when
 * CODEOWNERS enforcement is driven by branch protection rules instead of
 * explicit reviewer requests.
 */
export const getRequestedTeams = async (): Promise<string[]> => {
  logger.info("START getRequestedTeams");
  try {
    const { repository, pull_request } = github.context.payload;
    if (!repository || !pull_request) {
      logger.warn("Missing repository or pull_request in payload");
      return [];
    }

    const ghToken = core.getInput("github-token");
    const octokit = github.getOctokit(ghToken);
    const { data: currentReviewers } =
      await octokit.rest.pulls.listRequestedReviewers({
        owner: repository.owner.login,
        repo: repository.name,
        pull_number: pull_request.number,
      });

    const teamSlugs = (currentReviewers.teams || [])
      .filter((team) => !!team?.slug)
      .map((team) => team.slug);

    logger.info(`END getRequestedTeams: ${JSON.stringify(teamSlugs)}`);
    return teamSlugs;
  } catch (error) {
    fail(error);
    throw error;
  }
};
