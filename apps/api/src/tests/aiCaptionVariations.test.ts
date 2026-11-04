import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

/**
 * Test-only configuration.
 *
 * Import the AI service after setting these values,
 * because env.ts validates environment variables
 * when it is first imported.
 */
process.env.SUPABASE_URL ??= "https://example.supabase.co";

process.env.SUPABASE_ANON_KEY ??= "test-anon-key";

process.env.OPENAI_API_KEY = "test-only-caption-key";

const { generateCaptionVariations, AIContentServiceError } =
  await import("../services/aiContentService.js");

type GenerationInput = Parameters<typeof generateCaptionVariations>[0];

const input: GenerationInput = {
  brief: "Introduce a productivity application for small businesses.",
  platform: "linkedin",
  tone: "professional",
  audience: "Small business owners",
  callToAction: "Learn more",
  length: "medium",
};

const validVariations = [
  {
    style: "engaging",
    caption:
      "Running a small business? Organize your daily tasks and spend more time focusing on your goals.",
  },
  {
    style: "informative",
    caption:
      "Our productivity application helps small businesses organize everyday tasks and maintain a clearer workflow.",
  },
  {
    style: "concise",
    caption:
      "Simplify your daily workflow with our productivity application for small businesses.",
  },
] as const;

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

/**
 * Simulates a successful OpenAI Chat Completions
 * response containing model-generated text.
 */
function mockOpenAIContent(content: string): void {
  globalThis.fetch = async (_url, init) => {
    assert.equal(init?.method, "POST");

    assert.equal(String(_url), "https://api.openai.com/v1/chat/completions");

    const requestBody = JSON.parse(String(init?.body)) as {
      model: string;
      response_format?: {
        type: string;
      };
      messages: Array<{
        role: string;
        content: string;
      }>;
    };

    assert.equal(requestBody.model, "gpt-4o-mini");

    assert.equal(requestBody.response_format?.type, "json_object");

    assert.ok(
      requestBody.messages.some((message) =>
        message.content.includes(input.brief),
      ),
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
    () => generateCaptionVariations(input),
    (error: unknown) => {
      assert.ok(error instanceof AIContentServiceError);

      assert.equal(error.statusCode, expectedStatusCode);

      return true;
    },
  );
}

test("generates exactly three validated caption variations", async () => {
  mockOpenAIJson({
    variations: [...validVariations],
  });

  const result = await generateCaptionVariations(input);

  assert.equal(result.variations.length, 3);

  assert.deepEqual(
    result.variations.map((variation) => variation.style),
    ["engaging", "informative", "concise"],
  );

  assert.deepEqual(
    result.variations.map((variation) => variation.caption),
    validVariations.map((variation) => variation.caption),
  );
});

test("normalizes the order of model-generated variations", async () => {
  mockOpenAIJson({
    variations: [validVariations[2], validVariations[0], validVariations[1]],
  });

  const result = await generateCaptionVariations(input);

  assert.deepEqual(
    result.variations.map((variation) => variation.style),
    ["engaging", "informative", "concise"],
  );
});

test("rejects duplicate caption content", async () => {
  mockOpenAIJson({
    variations: [
      validVariations[0],
      {
        ...validVariations[1],
        caption: validVariations[0].caption.toUpperCase(),
      },
      validVariations[2],
    ],
  });

  await expectServiceError(502);
});

test("rejects duplicate styles and missing styles", async () => {
  mockOpenAIJson({
    variations: [
      validVariations[0],
      {
        ...validVariations[1],
        style: "engaging",
      },
      validVariations[2],
    ],
  });

  await expectServiceError(502);
});

test("rejects malformed JSON from OpenAI", async () => {
  mockOpenAIContent('{"variations": [invalid-json');

  await expectServiceError(502);
});

test("rejects an empty model response", async () => {
  mockOpenAIContent("");

  await expectServiceError(502);
});

test("handles provider rate limiting", async () => {
  mockProviderStatus(429);

  await expectServiceError(429);
});

test("handles invalid provider credentials", async () => {
  mockProviderStatus(401);

  await expectServiceError(503);
});

test("handles network failures without leaking errors", async () => {
  globalThis.fetch = async () => {
    throw new Error("Mock network error with internal details");
  };

  await assert.rejects(
    () => generateCaptionVariations(input),
    (error: unknown) => {
      assert.ok(error instanceof AIContentServiceError);

      assert.equal(error.statusCode, 502);

      assert.doesNotMatch(error.message, /internal details/);

      return true;
    },
  );
});
