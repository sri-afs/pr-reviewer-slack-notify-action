import { fail } from "./fail";
import { getPullRequest } from "./getPullRequest";
import { logger } from "./logger";

/**
 * Returns the team slugs that are requested as reviewers on the PR.
 * v1: teams only — individual reviewer requests are ignored here because
 * we notify Slack user groups (not individuals).
 */
export const getRequestedTeams = async (): Promise<string[]> => {
  logger.info("START getRequestedTeams");
  try {
    const pr = await getPullRequest();
    const requestedTeams = pr.requested_teams ?? [];

    const teamSlugs = requestedTeams
      .filter((team) => !!team?.slug)
      .map((team) => team.slug);

    logger.info(`END getRequestedTeams: ${JSON.stringify(teamSlugs)}`);
    return teamSlugs;
  } catch (error) {
    fail(error);
    throw error;
  }
};
