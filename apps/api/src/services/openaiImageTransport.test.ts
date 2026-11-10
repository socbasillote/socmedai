import { describe, expect, it, vi } from "vitest";

import {
  generateOpenAIImageOnce,
  ImageProviderOutcomeUnknown,
  ImageProviderPreflightError,
  type OpenAIImageRequest,
} from "./openaiImageTransport.js";

const request: OpenAIImageRequest = {
  model: "gpt-image-2",
  prompt: "A product on a studio pedestal.",
  aspectRatio: "square",
};

// Minimal bytes for transport-level PNG
// signature verification only.
// The existing image pipeline performs
// complete PNG validation afterward.
const fakePng = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);

function successResponse() {
  return Response.json(
    {
      data: [
        {
          b64_json: fakePng.toString("base64"),
        },
      ],
    },
    {
      headers: {
        "x-request-id": "req-test-001",
      },
    },
  );
}

function transport(fetchImpl: typeof fetch) {
  return {
    apiKey: "fake-test-key",
    fetchImpl,
    timeoutMs: 10000,
  };
}

describe("OpenAI image transport", () => {
  it("sends a single square PNG request", async () => {
    const mockFetch = vi.fn(async () => successResponse());

    const result = await generateOpenAIImageOnce(
      request,
      transport(mockFetch as typeof fetch),
    );

    expect(mockFetch).toHaveBeenCalledTimes(1);

    const [url, options] = mockFetch.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];

    expect(url).toBe("https://api.openai.com/v1/images/generations");

    expect(options.method).toBe("POST");

    const body = JSON.parse(options.body as string);

    expect(body).toEqual({
      model: "gpt-image-2",
      prompt: request.prompt,
      size: "1024x1024",
      quality: "low",
      output_format: "png",
      n: 1,
    });

    expect(result.provider).toBe("openai");

    expect(result.providerRequestId).toBe("req-test-001");

    expect(result.bytes).toEqual(new Uint8Array(fakePng));
  });

  it.each([
    ["portrait", "1024x1536"],
    ["landscape", "1536x1024"],
  ] as const)("maps %s to %s", async (aspectRatio, expectedSize) => {
    const mockFetch = vi.fn(async () => successResponse());

    await generateOpenAIImageOnce(
      {
        ...request,
        aspectRatio,
      },
      transport(mockFetch as typeof fetch),
    );

    const [, options] = mockFetch.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];

    const body = JSON.parse(options.body as string);

    expect(body.size).toBe(expectedSize);
  });

  it("does not send invalid persisted requests", async () => {
    const mockFetch = vi.fn(async () => successResponse());

    await expect(
      generateOpenAIImageOnce(
        {
          ...request,
          prompt: "",
        },
        transport(mockFetch as typeof fetch),
      ),
    ).rejects.toBeInstanceOf(ImageProviderPreflightError);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("never retries a network failure", async () => {
    const mockFetch = vi.fn(async () => {
      throw new Error("Connection reset");
    });

    await expect(
      generateOpenAIImageOnce(request, transport(mockFetch as typeof fetch)),
    ).rejects.toBeInstanceOf(ImageProviderOutcomeUnknown);

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("does not retry an HTTP 500", async () => {
    const mockFetch = vi.fn(
      async () => new Response("Server unavailable", { status: 500 }),
    );

    await expect(
      generateOpenAIImageOnce(request, transport(mockFetch as typeof fetch)),
    ).rejects.toMatchObject({
      category: "http",
      httpStatus: 500,
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid provider image bytes", async () => {
    const mockFetch = vi.fn(async () =>
      Response.json({
        data: [
          {
            b64_json: Buffer.from("not-png").toString("base64"),
          },
        ],
      }),
    );

    await expect(
      generateOpenAIImageOnce(request, transport(mockFetch as typeof fetch)),
    ).rejects.toMatchObject({
      category: "invalid_response",
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("rejects missing image output", async () => {
    const mockFetch = vi.fn(async () =>
      Response.json({
        data: [],
      }),
    );

    await expect(
      generateOpenAIImageOnce(request, transport(mockFetch as typeof fetch)),
    ).rejects.toBeInstanceOf(ImageProviderOutcomeUnknown);
  });
});
