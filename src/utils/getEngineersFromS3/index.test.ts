import { EventEmitter } from "events";

import * as core from "@actions/core";
import { describe, it, expect, beforeEach, vi } from "vitest";

import { fail } from "../fail";
import { logger } from "../logger";

vi.mock("@actions/core");
vi.mock("../fail");
vi.mock("../logger");

const mockSend = vi.fn();

vi.mock("@aws-sdk/client-s3", () => {
  return {
    S3Client: class MockS3Client {
      send = mockSend;
    },
    GetObjectCommand: class MockGetObjectCommand {
      constructor(public input: any) {}
    },
  };
});

import { getTeamMappingFromS3 } from "./index";

const mockCore = vi.mocked(core);
const mockFail = vi.mocked(fail);
const mockLogger = vi.mocked(logger);

describe("getTeamMappingFromS3", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCore.getInput.mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        "aws-s3-bucket": "test-bucket",
        "aws-s3-object-key": "test-key.json",
        "aws-region": "us-east-1",
      };
      return inputs[name] || "";
    });
  });

  it("successfully fetches and parses team mapping data from S3", async () => {
    const teamMappingData = {
      teams: [
        { github_team_slug: "backend", slack_user_group_id: "S07F6TF8N86" },
        { github_team_slug: "frontend", slack_user_group_id: "S07FG1G7ELC" },
      ],
    };

    const body = new EventEmitter();
    mockSend.mockResolvedValue({ Body: body });

    const promise = getTeamMappingFromS3();

    await vi.waitFor(() => expect(mockSend).toHaveBeenCalled());

    body.emit("data", JSON.stringify(teamMappingData));
    body.emit("end");

    const result = await promise;

    expect(result).toEqual(teamMappingData);
    expect(mockLogger.info).toHaveBeenCalledWith("START getTeamMappingFromS3");
  });

  it("throws when required AWS inputs are missing and no inline mapping provided", async () => {
    mockCore.getInput.mockReturnValue("");

    await expect(getTeamMappingFromS3()).rejects.toThrow(
      "Missing required inputs",
    );
  });

  it("uses inline team-mapping-json when provided and skips S3", async () => {
    const teamMappingData = {
      teams: [
        { github_team_slug: "backend", slack_user_group_id: "S07F6TF8N86" },
      ],
    };
    mockCore.getInput.mockImplementation((name: string) => {
      if (name === "team-mapping-json") return JSON.stringify(teamMappingData);
      return "";
    });

    const result = await getTeamMappingFromS3();

    expect(result).toEqual(teamMappingData);
    expect(mockSend).not.toHaveBeenCalled();
    expect(mockLogger.info).toHaveBeenCalledWith(
      "Using inline team-mapping-json input (skipping S3 fetch)",
    );
  });

  it("throws a clear error when inline team-mapping-json is invalid JSON", async () => {
    mockCore.getInput.mockImplementation((name: string) => {
      if (name === "team-mapping-json") return "{not valid json";
      return "";
    });

    await expect(getTeamMappingFromS3()).rejects.toThrow(
      "Invalid JSON in team-mapping-json input",
    );
    expect(mockFail).toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("calls fail and rejects when S3 client.send throws", async () => {
    const error = new Error("S3 access denied");
    mockSend.mockRejectedValue(error);

    await expect(getTeamMappingFromS3()).rejects.toThrow("S3 access denied");
    expect(mockFail).toHaveBeenCalledWith(error);
  });

  it("handles stream error event", async () => {
    const body = new EventEmitter();
    mockSend.mockResolvedValue({ Body: body });

    const promise = getTeamMappingFromS3();

    await vi.waitFor(() => expect(mockSend).toHaveBeenCalled());

    const streamError = new Error("Stream failed");
    body.emit("error", streamError);

    await expect(promise).rejects.toThrow("Stream failed");
  });
});
