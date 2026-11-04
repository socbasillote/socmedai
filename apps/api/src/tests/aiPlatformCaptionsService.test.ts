import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

// Configure the environment before importing the service.
process.env.SUPABASE_URL ??= "https://example.supabase.co";

process.env.SUPABASE_ANON_KEY ??= "test-anon-key";

process.env.OPENAI_API_KEY = "test-only-platform-caption-key";

const { generatePlatformCaptions, AIContentServiceError } =
  await import("../services/aiContentService.js");

type GenerationInput = Parameters<typeof generatePlatformCaptions>[0];

const input: GenerationInput = {
  brief: "Introduce a productivity application for small businesses.",
  tone: "professional",
  audience: "Small business owners",
  callToAction: "Learn more",
  length: "medium",
};

const validCaptions = {
  facebook:
    "🚀 Running a small business? Our productivity app helps you organize everyday tasks. What is your biggest productivity challenge?",
  linkedin:
    "We're introducing a productivity application designed to help small businesses organize daily tasks and maintain a clearer workflow.",
};

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mockOpenAIContent(
  content: string | null,
  onRequest?: () => void,
): void {
  globalThis.fetch = async (url, init) => {
    onRequest?.();

    assert.equal(String(url), "https://api.openai.com/v1/chat/completions");

    assert.equal(init?.method, "POST");

    const body = JSON.parse(String(init?.body)) as {
      model: string;
      response_format?: {
        type: string;
      };
      messages: Array<{
        role: string;
        content: string;
      }>;
    };

    assert.equal(body.model, "gpt-4o-mini");

    assert.equal(body.response_format?.type, "json_object");

    assert.ok(
      body.messages.some((message) => message.content.includes(input.brief)),
    );

    assert.ok(
      body.messages.some((message) => message.content.includes("FACEBOOK:")),
    );

    assert.ok(
      body.messages.some((message) => message.content.includes("LINKEDIN:")),
    );

    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content,
            },
          },
        ],
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  };
}

function mockOpenAIJson(value: unknown): void {
  mockOpenAIContent(JSON.stringify(value));
}

function mockProviderStatus(status: number): void {
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        error: {
          message: "Mock provider error",
        },
      }),
      {
        status,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
}

async function expectServiceError(expectedStatusCode: number): Promise<void> {
  await assert.rejects(
    () => generatePlatformCaptions(input),
    (error: unknown) => {
      assert.ok(error instanceof AIContentServiceError);

      assert.equal(error.statusCode, expectedStatusCode);

      return true;
    },
  );
}

// TEST 1
test("generates valid Facebook and LinkedIn captions", async () => {
  mockOpenAIJson({
    captions: validCaptions,
  });

  const result = await generatePlatformCaptions(input);

  assert.deepEqual(result.captions, validCaptions);
});

// TEST 2
test("makes exactly one OpenAI request", async () => {
  let requestCount = 0;

  mockOpenAIContent(
    JSON.stringify({
      captions: validCaptions,
    }),
    () => {
      requestCount += 1;
    },
  );

  await generatePlatformCaptions(input);

  assert.equal(requestCount, 1);
});

// TEST 3
test("preserves distinct platform-specific wording", async () => {
  mockOpenAIJson({
    captions: {
      facebook:
        "Big news! Our productivity app is here. 🚀 What would help you stay organized?",
      linkedin:
        "We are introducing a productivity solution designed for small business task management.",
    },
  });

  const result = await generatePlatformCaptions(input);

  assert.notEqual(result.captions.facebook, result.captions.linkedin);

  assert.match(result.captions.facebook, /Big news/);

  assert.match(result.captions.linkedin, /productivity solution/);
});

// TEST 4
test("rejects identical platform captions", async () => {
  mockOpenAIJson({
    captions: {
      facebook: "Our new application is available.",
      linkedin: "  OUR NEW APPLICATION IS AVAILABLE.  ",
    },
  });

  await expectServiceError(502);
});

// TEST 5
test("rejects a missing LinkedIn caption", async () => {
  mockOpenAIJson({
    captions: {
      facebook: validCaptions.facebook,
    },
  });

  await expectServiceError(502);
});

// TEST 6
test("rejects an empty Facebook caption", async () => {
  mockOpenAIJson({
    captions: {
      facebook: "   ",
      linkedin: validCaptions.linkedin,
    },
  });

  await expectServiceError(502);
});

// TEST 7
test("rejects unexpected response fields", async () => {
  mockOpenAIJson({
    captions: {
      ...validCaptions,
      instagram: "An unexpected caption.",
    },
  });

  await expectServiceError(502);
});

// TEST 8
test("rejects malformed JSON", async () => {
  mockOpenAIContent('{"captions": {invalid-json');

  await expectServiceError(502);
});

// TEST 9
test("rejects an empty AI response", async () => {
  mockOpenAIContent("");

  await expectServiceError(502);
});

// TEST 10
test("handles provider rate limiting", async () => {
  mockProviderStatus(429);

  await expectServiceError(429);
});

// TEST 11
test("handles invalid provider credentials", async () => {
  mockProviderStatus(401);

  await expectServiceError(503);
});

// TEST 12
test("handles network failures without leaking details", async () => {
  globalThis.fetch = async () => {
    throw new Error("Mock private provider network information");
  };

  await assert.rejects(
    () => generatePlatformCaptions(input),
    (error: unknown) => {
      assert.ok(error instanceof AIContentServiceError);

      assert.equal(error.statusCode, 502);

      assert.doesNotMatch(
        error.message,
        /private provider network information/,
      );

      return true;
    },
  );
});
