import { describe, expect, it } from "vitest";

import {
  parseFacebookPublishInput,
  FacebookPublishInputError,
  FACEBOOK_POST_MESSAGE_MAX_LENGTH,
} from "./facebookPublishInput.js";

const WORKSPACE_ID = "507f1f77bcf86cd799439011";

const FACEBOOK_CONNECTION_ID = "507f1f77bcf86cd799439013";

/**
 * Valid input fixture.
 *
 * These are sample MongoDB ObjectIds,
 * not actual Storm database records.
 */
function validInput() {
  return {
    workspaceId: WORKSPACE_ID,
    facebookConnectionId: FACEBOOK_CONNECTION_ID,
    message: "Hello from Storm!",
  };
}

describe("parseFacebookPublishInput", () => {
  /**
   * Test 1:
   * Accept a correctly structured publishing request.
   */
  it("accepts valid Facebook publishing input", () => {
    const result = parseFacebookPublishInput(validInput());

    expect(result).toEqual({
      workspaceId: WORKSPACE_ID,
      facebookConnectionId: FACEBOOK_CONNECTION_ID,
      message: "Hello from Storm!",
    });
  });

  /**
   * Test 2:
   * Normalize surrounding whitespace.
   */
  it("trims post content", () => {
    const result = parseFacebookPublishInput({
      ...validInput(),
      message: "   Hello from Storm!   ",
    });

    expect(result.message).toBe("Hello from Storm!");
  });

  /**
   * Test 3:
   * Reject values that are not request objects.
   */
  it("rejects invalid request structures", () => {
    const invalidInputs = [null, undefined, "invalid-request", 123, []];

    for (const input of invalidInputs) {
      expect(() => parseFacebookPublishInput(input)).toThrow(
        "A valid publishing request is required.",
      );
    }
  });

  /**
   * Test 4:
   * Reject missing or malformed workspace IDs.
   */
  it("rejects invalid workspace IDs", () => {
    const invalidInputs = [
      {
        ...validInput(),
        workspaceId: "",
      },
      {
        ...validInput(),
        workspaceId: "invalid-workspace",
      },
      {
        ...validInput(),
        workspaceId: undefined,
      },
    ];

    for (const input of invalidInputs) {
      expect(() => parseFacebookPublishInput(input)).toThrow(
        "A valid workspace is required.",
      );
    }
  });

  /**
   * Test 5:
   * Reject invalid Facebook connection IDs.
   */
  it("rejects invalid Facebook connection IDs", () => {
    const invalidInputs = [
      {
        ...validInput(),
        facebookConnectionId: "",
      },
      {
        ...validInput(),
        facebookConnectionId: "invalid-connection",
      },
      {
        ...validInput(),
        facebookConnectionId: undefined,
      },
    ];

    for (const input of invalidInputs) {
      expect(() => parseFacebookPublishInput(input)).toThrow(
        "A valid Facebook connection is required.",
      );
    }
  });

  /**
   * Test 6:
   * Reject missing or non-string post content.
   */
  it("rejects missing or invalid post content", () => {
    const invalidInputs = [
      {
        ...validInput(),
        message: undefined,
      },
      {
        ...validInput(),
        message: null,
      },
      {
        ...validInput(),
        message: 123,
      },
    ];

    for (const input of invalidInputs) {
      expect(() => parseFacebookPublishInput(input)).toThrow(
        "Post content is required.",
      );
    }
  });

  /**
   * Test 7:
   * Reject whitespace-only content.
   */
  it("rejects empty post content", () => {
    expect(() =>
      parseFacebookPublishInput({
        ...validInput(),
        message: "   \n\t   ",
      }),
    ).toThrow("Post content cannot be empty.");
  });

  /**
   * Test 8:
   * Accept a message at the maximum length.
   */
  it("accepts content at the maximum length", () => {
    const message = "A".repeat(FACEBOOK_POST_MESSAGE_MAX_LENGTH);

    const result = parseFacebookPublishInput({
      ...validInput(),
      message,
    });

    expect(result.message).toHaveLength(FACEBOOK_POST_MESSAGE_MAX_LENGTH);
  });

  /**
   * Test 9:
   * Reject content exceeding Storm's limit.
   */
  it("rejects oversized post content", () => {
    const message = "A".repeat(FACEBOOK_POST_MESSAGE_MAX_LENGTH + 1);

    expect(() =>
      parseFacebookPublishInput({
        ...validInput(),
        message,
      }),
    ).toThrow(
      `Post content must not exceed ${FACEBOOK_POST_MESSAGE_MAX_LENGTH} characters.`,
    );
  });

  /**
   * Test 10:
   * Ensure validation errors carry HTTP 400.
   */
  it("returns an HTTP 400 validation error", () => {
    try {
      parseFacebookPublishInput({
        ...validInput(),
        message: "",
      });

      throw new Error("Expected publishing validation to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(FacebookPublishInputError);

      expect(error).toMatchObject({
        name: "FacebookPublishInputError",
        statusCode: 400,
        message: "Post content cannot be empty.",
      });
    }
  });

  /**
   * Test 11:
   * Exclude unsupported fields from normalized output.
   */
  it("returns only supported publishing fields", () => {
    const result = parseFacebookPublishInput({
      ...validInput(),

      // Unsupported client-supplied fields.
      accessToken: "should-not-be-forwarded",
      facebookPageId: "123456789",
      status: "published",
    });

    expect(result).toEqual(validInput());

    expect(result).not.toHaveProperty("accessToken");

    expect(result).not.toHaveProperty("facebookPageId");

    expect(result).not.toHaveProperty("status");
  });
});
