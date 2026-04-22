import { fail } from "./fail";
import { getTeamMappingFromS3 } from "./getEngineersFromS3";
import { TeamGithubSlackMapping } from "./getEngineersFromS3/types";
import { logger } from "./logger";

/**
 * Builds a Slack-mentions string from a list of GitHub team slugs.
 * Each mapped team becomes a <!subteam^ID> (Slack user group mention).
 * Teams without a mapping are silently skipped.
 */
export const createTeamsToAtString = async (
  teamSlugs: string[],
): Promise<string> => {
  logger.info(
    `Mapping ${teamSlugs.length} GitHub team(s) to Slack user group mentions`,
  );
  let teams: TeamGithubSlackMapping[] = [];
  try {
    const res = await getTeamMappingFromS3();
    teams = res.teams;
  } catch (error) {
    fail(error);
  }

  const teamsToAt = teams.filter((team) =>
    teamSlugs.includes(team.github_team_slug),
  );

  const mentions = teamsToAt.map(
    (team) => `<!subteam^${team.slack_user_group_id}>`,
  );

  logger.info(
    `Mapped ${teamsToAt.length}/${teamSlugs.length} teams to Slack mentions`,
  );
  return mentions.join(" ");
};
