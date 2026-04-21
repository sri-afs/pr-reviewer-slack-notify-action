import { logger } from "../utils/logger";

/**
 * Handles a push of new commits to a PR branch.
 *
 * v1: intentional no-op.
 * - We do NOT clear reactions (ApprenticeFS does not dismiss stale approvals,
 *   so prior review/approval signals should stay visible).
 * - We do NOT post a "new code pushed" thread reply (would be noisy for our
 *   team; GitHub already notifies reviewers of new commits via PR activity).
 */
export const handleCommitPush = async (): Promise<void> => {
  logger.info(
    "handleCommitPush: v1 no-op — keeping reactions and skipping thread reply",
  );
  return;
};
