import * as core from "@actions/core";
import * as github from "@actions/github";

import { fail } from "../utils/fail";
import { getSlackMessageId } from "../utils/getSlackMessageId";
import { logger } from "../utils/logger";

import { createInitialMessage } from "./createInitialMessage";

export const handleLabelChange = async (): Promise<void> => {
  try {
    const labelForInitialNotification = core.getInput(
      "label-for-initial-notification",
    );
    const { pull_request, sender, label } = github.context.payload;

    if (!pull_request) {
      throw Error("No pull_request found on github.context.payload");
    }

    if (!sender) {
      throw Error("No sender found on github.context.payload");
    }

    // Handle initial notification trigger via label-for-initial-notification
    if (label?.name === labelForInitialNotification) {
      logger.info(
        `Label '${labelForInitialNotification}' applied to PR #${pull_request.number}, checking for existing Slack thread`,
      );

      const existingMessageId = await getSlackMessageId();

      if (existingMessageId) {
        logger.info(
          `Slack thread already exists (${existingMessageId}), skipping duplicate notification`,
        );
        core.summary.addRaw(
          `Slack thread already exists for PR #${pull_request.number}. No new notification sent.`,
        );
        await core.summary.write();
        return;
      }

      logger.info(
        `No existing Slack thread found, creating initial notification`,
      );
      await createInitialMessage();
      return;
    }

    return;
  } catch (error) {
    fail(error);
    throw error;
  }
};
