import * as core from "@actions/core";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

import { fail } from "../fail";
import { logger } from "../logger";

import { TeamGithubSlackMapping } from "./types";

export const getTeamMappingFromS3 = async (): Promise<{
  teams: TeamGithubSlackMapping[];
}> => {
  logger.info("START getTeamMappingFromS3");

  // Escape hatch: when `team-mapping-json` is provided inline, skip the S3
  // fetch entirely. Useful for local testing or before the S3 bucket is set up.
  const inlineMapping = core.getInput("team-mapping-json");
  if (inlineMapping) {
    logger.info(
      "Using inline team-mapping-json input (skipping S3 fetch)",
    );
    try {
      return JSON.parse(inlineMapping);
    } catch (error) {
      fail(error);
      throw new Error(
        "Invalid JSON in team-mapping-json input — could not parse",
      );
    }
  }

  const Bucket = core.getInput("aws-s3-bucket");
  const Key = core.getInput("aws-s3-object-key");
  const region = core.getInput("aws-region");

  if (!Bucket || !Key || !region) {
    throw new Error(
      "Missing required inputs: either provide team-mapping-json, or all of aws-region, aws-s3-bucket, and aws-s3-object-key",
    );
  }

  const client = new S3Client({ region });
  const getObjectCommand = new GetObjectCommand({ Bucket, Key });

  try {
    const response = await client.send(getObjectCommand);
    const responseDataChunks: string[] = [];

    if (response && response.Body) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body: any = response.Body;

      return new Promise((resolve, reject) => {
        body.once("error", (err: Error) => reject(err));
        body.on("data", (chunk: string) => responseDataChunks.push(chunk));
        body.once("end", () =>
          resolve(JSON.parse(responseDataChunks.join(""))),
        );
      });
    }

    throw new Error("No response body from S3");
  } catch (error) {
    fail(error);
    throw error;
  }
};
