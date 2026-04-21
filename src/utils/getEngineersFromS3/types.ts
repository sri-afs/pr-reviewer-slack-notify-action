export interface TeamGithubSlackMapping {
  github_team_slug: string;
  slack_user_group_id: string;
  // Optional. When a member of this team approves a PR, the bot will
  // add this emoji (without colons, e.g. "be") as a reaction to the
  // parent Slack message. If absent or the reviewer cannot be mapped
  // to any team with this set, the action falls back to ":white_check_mark:".
  approval_emoji?: string;
}
