import * as core from "@actions/core";
import * as github from "@actions/github";
import { describe, it, expect, beforeEach, vi } from "vitest";

import { getSlackMessageId } from "../utils/getSlackMessageId";
import { slackWebClient } from "../utils/slackWebClient";

import { handlePullRequestReview } from "./handlePullRequestReview";

vi.mock("@actions/core");
vi.mock("@actions/github");
vi.mock("../utils/fail");
vi.mock("../utils/getSlackMessageId");
vi.mock("../utils/logger");
vi.mock("../utils/slackWebClient", () => ({
  slackWebClient: {
    chat: { postMessage: vi.fn() },
    reactions: { get: vi.fn(), add: vi.fn() },
  },
}));

const mockCore = vi.mocked(core);
const mockGithub = vi.mocked(github);
const mockGetSlackMessageId = vi.mocked(getSlackMessageId);
const mockPostMessage = vi.mocked(slackWebClient.chat.postMessage);
const mockReactionsGet = vi.mocked(slackWebClient.reactions.get);
const mockReactionsAdd = vi.mocked(slackWebClient.reactions.add);

const basePayload = {
  action: "submitted",
  pull_request: {
    number: 42,
    user: { login: "author1" },
  },
  review: {
    id: 100,
    state: "approved",
    body: "",
    user: { login: "reviewer1" },
    html_url: "https://github.com/org/repo/pull/42#pullrequestreview-100",
  },
  repository: { owner: { login: "org" }, name: "repo" },
};

describe("handlePullRequestReview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCore.getInput.mockReturnValue("test-channel");
    Object.defineProperty(mockGithub, "context", {
      value: { payload: JSON.parse(JSON.stringify(basePayload)) },
      writable: true,
    });
    mockGithub.getOctokit.mockReturnValue({
      rest: { pulls: {} },
    } as any);
    mockGetSlackMessageId.mockResolvedValue("1234567890.123456");
    mockPostMessage.mockResolvedValue({ ok: true } as any);
    mockReactionsGet.mockResolvedValue({ message: { reactions: [] } } as any);
    mockReactionsAdd.mockResolvedValue({ ok: true } as any);
  });

  describe("approved review", () => {
    beforeEach(() => {
      mockGithub.context.payload.review.state = "approved";
    });

    it("posts thread reply and adds :white_check_mark: reaction", async () => {
      mockGithub.context.payload.review.body = "";

      await handlePullRequestReview();

      expect(mockPostMessage).toHaveBeenCalledTimes(1);
      const callArgs = mockPostMessage.mock.calls[0][0] as any;
      expect(callArgs.text).toContain("*reviewer1*");
      expect(callArgs.text).toContain("approved your PR");
      expect(callArgs.channel).toBe("test-channel");
      expect(callArgs.thread_ts).toBe("1234567890.123456");
      expect(mockReactionsAdd).toHaveBeenCalledWith(
        expect.objectContaining({ name: "white_check_mark" }),
      );
    });

    it("includes review body in thread reply when present", async () => {
      mockGithub.context.payload.review.body = "LGTM!";

      await handlePullRequestReview();

      const callArgs = mockPostMessage.mock.calls[0][0] as any;
      expect(callArgs.text).toContain("LGTM!");
    });

    it("does not include Slack user mentions in the thread reply", async () => {
      await handlePullRequestReview();

      const callArgs = mockPostMessage.mock.calls[0][0] as any;
      expect(callArgs.text).not.toMatch(/<@U[A-Z0-9]+>/);
    });
  });

  describe("changes_requested review", () => {
    beforeEach(() => {
      mockGithub.context.payload.review.state = "changes_requested";
    });

    it("posts thread reply and adds :octagonal_sign: reaction", async () => {
      mockGithub.context.payload.review.body = "Please fix the tests";

      await handlePullRequestReview();

      expect(mockPostMessage).toHaveBeenCalledTimes(1);
      const callArgs = mockPostMessage.mock.calls[0][0] as any;
      expect(callArgs.text).toContain("*reviewer1*");
      expect(callArgs.text).toContain("would like you to change some things");
      expect(callArgs.text).toContain("Please fix the tests");
      expect(mockReactionsAdd).toHaveBeenCalledWith(
        expect.objectContaining({ name: "octagonal_sign" }),
      );
    });
  });

  describe("commented review (v1.1: no thread reply)", () => {
    beforeEach(() => {
      mockGithub.context.payload.review.state = "commented";
    });

    it("adds :speech_balloon: reaction but does NOT post a thread reply", async () => {
      mockGithub.context.payload.review.body = "This is a review comment";

      await handlePullRequestReview();

      expect(mockPostMessage).not.toHaveBeenCalled();
      expect(mockReactionsAdd).toHaveBeenCalledWith(
        expect.objectContaining({ name: "speech_balloon" }),
      );
    });

    it("still skips when reaction is already present", async () => {
      mockReactionsGet.mockResolvedValue({
        message: { reactions: [{ name: "speech_balloon" }] },
      } as any);

      await handlePullRequestReview();

      expect(mockPostMessage).not.toHaveBeenCalled();
      expect(mockReactionsAdd).not.toHaveBeenCalled();
    });
  });

  describe("event-level skips", () => {
    it("skips non-submitted actions", async () => {
      mockGithub.context.payload.action = "dismissed";

      await handlePullRequestReview();

      expect(mockPostMessage).not.toHaveBeenCalled();
      expect(mockReactionsAdd).not.toHaveBeenCalled();
    });

    it("skips when no slack message ID", async () => {
      mockGetSlackMessageId.mockResolvedValue(undefined as any);

      await handlePullRequestReview();

      expect(mockPostMessage).not.toHaveBeenCalled();
      expect(mockCore.warning).toHaveBeenCalledWith(
        expect.stringContaining("no Slack message ID"),
      );
    });

    it("skips unknown review states", async () => {
      mockGithub.context.payload.review.state = "some_unexpected_state";

      await handlePullRequestReview();

      expect(mockPostMessage).not.toHaveBeenCalled();
      expect(mockReactionsAdd).not.toHaveBeenCalled();
    });
  });

  describe("reaction deduplication (approved/changes_requested)", () => {
    beforeEach(() => {
      mockGithub.context.payload.review.state = "approved";
    });

    it("skips adding reaction if already present, but still posts thread reply", async () => {
      mockReactionsGet.mockResolvedValue({
        message: { reactions: [{ name: "white_check_mark" }] },
      } as any);

      await handlePullRequestReview();

      // thread reply is still posted
      expect(mockPostMessage).toHaveBeenCalledTimes(1);
      // but reaction is not duplicated
      expect(mockReactionsAdd).not.toHaveBeenCalled();
    });
  });
});
