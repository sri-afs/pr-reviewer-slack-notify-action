import * as core from "@actions/core";
import * as github from "@actions/github";

import { fail } from "../utils/fail";
import { getSlackMessageId } from "../utils/getSlackMessageId";
import { logger } from "../utils/logger";
import { slackWebClient } from "../utils/slackWebClient";

const reactionMap = {
  commented: "speech_balloon",
  approved: "white_check_mark",
  changes_requested: "octagonal_sign",
};

export const handlePullRequestReview = async (): Promise<void> => {
  logger.info("Handling pull request review event");
  try {
    const channelId = core.getInput("channel-id");
    const { action, pull_request, review } = github.context.payload;

    if (action !== "submitted") {
      logger.info(
        `Ignoring review action '${action}', only 'submitted' is handled`,
      );
      return;
    }

    if (!pull_request) {
      throw Error(
        "No pull_request found in handlePullRequestReview (github.context.payload)",
      );
    }

    const slackMessageId = await getSlackMessageId();

    if (!slackMessageId) {
      logger.info("No Slack thread found, skipping review notification");
      core.warning(
        "Unable to post pull request review notification because no Slack message ID could be found.",
      );
      return;
    }

    const reviewerLogin = review.user.login;
    const reactionToAdd =
      reactionMap[review.state as keyof typeof reactionMap];

    if (!reactionToAdd) {
      logger.info(`Ignoring unhandled review state: ${review.state}`);
      return;
    }

    //
    // ─── POST THREAD REPLY (approved / changes_requested only) ───────
    // v1.1: commented reviews only add a reaction on the parent — no
    // thread reply. The :speech_balloon: signals "someone commented,
    // check GitHub for details". Reduces thread noise for the groups
    // tagged on the parent message.
    //

    if (
      review.state === "approved" ||
      review.state === "changes_requested"
    ) {
      const actionText =
        review.state === "approved"
          ? "approved your PR"
          : "would like you to change some things in the code";
      const fullText = review.body
        ? `${actionText}\n>${review.body}`
        : actionText;

      const text = `*${reviewerLogin}* ${fullText}`;
      await slackWebClient.chat.postMessage({
        channel: channelId,
        thread_ts: slackMessageId,
        text,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text,
            },
          },
        ],
      });
    }

    //
    // ─── ADD REACTION TO MAIN THREAD ─────────────────────────────────
    //

    const existingReactionsRes = await slackWebClient.reactions.get({
      channel: channelId,
      timestamp: slackMessageId,
    });

    let hasReaction = false;
    if (existingReactionsRes?.message?.reactions) {
      existingReactionsRes.message.reactions.forEach((reaction) => {
        if (reaction.name === reactionToAdd) {
          hasReaction = true;
        }
      });
    }

    if (hasReaction) {
      logger.info(`Reaction '${reactionToAdd}' already present, skipping`);
      return;
    }

    await slackWebClient.reactions.add({
      channel: channelId,
      timestamp: slackMessageId,
      name: reactionToAdd,
    });

    logger.info(
      `Review by ${review.user.login} (${review.state}) handled — reaction '${reactionToAdd}' added`,
    );
    return;
  } catch (error) {
    fail(error);
    throw error;
  }
};
