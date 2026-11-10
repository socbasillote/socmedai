import sharp from "sharp";

import { describe, expect, it, vi } from "vitest";

import { OpenAIImageProvider } from "./openaiImageProvider.js";

import { ImageProviderError } from "./imageProvider.js";

const API_KEY = "test-only-api-key";

const PROMPT =
  "A professional product photograph with cinematic studio lighting.";

async function png(width = 1024, height = 1024) {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: "#7c3aed",
    },
  })
    .png()
    .toBuffer();
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

async function imageResponse(width = 1024, height = 1024) {
  return jsonResponse({
    created: 1,
    data: [
      {
        b64_json: (await png(width, height)).toString("base64"),
      },
    ],
  });
}

function makeProvider(impl: typeof fetch) {
  return new OpenAIImageProvider({
    apiKey: API_KEY,
    model: "gpt-image-2",
    fetchImpl: impl,
  });
}

function request(aspectRatio: "square" | "portrait" | "landscape" = "square") {
  return {
    prompt: PROMPT,
    aspectRatio,
  };
}

describe("OpenAIImageProvider", () => {
  it("maps square generation to the Images API", async () => {
    const fetchMock = vi.fn(async () => imageResponse());

    const provider = makeProvider(fetchMock as typeof fetch);

    const generated = await provider.generate(request());

    expect(fetchMock).toHaveBeenCalledOnce();

    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];

    expect(url).toBe("https://api.openai.com/v1/images/generations");

    expect(init.method).toBe("POST");

    expect(JSON.parse(init.body as string)).toEqual({
      model: "gpt-image-2",
      prompt: PROMPT,
      size: "1024x1024",
      quality: "low",
      n: 1,
      output_format: "png",
    });

    expect(generated.provider).toBe("openai");
    expect(generated.model).toBe("gpt-image-2");
    expect(generated.mimeType).toBe("image/png");

    const metadata = await sharp(generated.bytes).metadata();

    expect(metadata.width).toBe(1024);
    expect(metadata.height).toBe(1024);
  });

  it("maps portrait generation", async () => {
    const fetchMock = vi.fn(async () => imageResponse(1024, 1536));

    const provider = makeProvider(fetchMock as typeof fetch);

    await provider.generate(request("portrait"));

    const calls = fetchMock.mock.calls as unknown as Array<
      [string, RequestInit]
    >;

    const init = calls[0]?.[1];

    expect(JSON.parse(init?.body as string).size).toBe("1024x1536");
  });

  it("maps landscape generation", async () => {
    const fetchMock = vi.fn(async () => imageResponse(1536, 1024));

    const provider = makeProvider(fetchMock as typeof fetch);

    await provider.generate(request("landscape"));

    const calls = fetchMock.mock.calls as unknown as Array<
      [string, RequestInit]
    >;

    const init = calls[0]?.[1];

    expect(JSON.parse(init?.body as string).size).toBe("1536x1024");
  });

  it("rejects invalid input before HTTP", async () => {
    const fetchMock = vi.fn();

    const provider = makeProvider(fetchMock as typeof fetch);

    await expect(
      provider.generate({
        prompt: "short",
        aspectRatio: "square",
      }),
    ).rejects.toMatchObject({
      outcome: "rejected",
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([400, 401, 403, 404, 422])(
    "classifies HTTP %i as uncertain",
    async (status) => {
      const fetchMock = vi.fn(async () =>
        jsonResponse({ error: "rejected" }, status),
      );

      const provider = makeProvider(fetchMock as typeof fetch);

      await expect(provider.generate(request())).rejects.toMatchObject({
        outcome: "uncertain",
      });

      expect(fetchMock).toHaveBeenCalledOnce();
    },
  );

  it.each([408, 429, 500, 503])(
    "classifies HTTP %i as uncertain",
    async (status) => {
      const fetchMock = vi.fn(async () =>
        jsonResponse({ error: "unavailable" }, status),
      );

      const provider = makeProvider(fetchMock as typeof fetch);

      await expect(provider.generate(request())).rejects.toMatchObject({
        outcome: "uncertain",
      });
    },
  );

  it("classifies a network exception as uncertain", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("Simulated connection failure");
    });

    const provider = makeProvider(fetchMock as typeof fetch);

    await expect(provider.generate(request())).rejects.toMatchObject({
      outcome: "uncertain",
    });

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("classifies malformed JSON as uncertain", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response("{invalid-json", {
          status: 200,
        }),
    );

    const provider = makeProvider(fetchMock as typeof fetch);

    await expect(provider.generate(request())).rejects.toMatchObject({
      outcome: "uncertain",
    });
  });

  it("rejects missing image output", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ data: [] }));

    const provider = makeProvider(fetchMock as typeof fetch);

    await expect(provider.generate(request())).rejects.toMatchObject({
      outcome: "uncertain",
    });
  });

  it("rejects invalid base64", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        data: [
          {
            b64_json: "not-valid-base64!",
          },
        ],
      }),
    );

    const provider = makeProvider(fetchMock as typeof fetch);

    await expect(provider.generate(request())).rejects.toMatchObject({
      outcome: "uncertain",
    });
  });

  it("rejects corrupt image bytes", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        data: [
          {
            b64_json: Buffer.from("not a png").toString("base64"),
          },
        ],
      }),
    );

    const provider = makeProvider(fetchMock as typeof fetch);

    await expect(provider.generate(request())).rejects.toMatchObject({
      outcome: "uncertain",
    });
  });

  it("rejects unexpected dimensions", async () => {
    const fetchMock = vi.fn(async () => imageResponse(512, 512));

    const provider = makeProvider(fetchMock as typeof fetch);

    await expect(provider.generate(request())).rejects.toMatchObject({
      outcome: "uncertain",
    });
  });

  it("rejects an excessively large HTTP body", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response("x".repeat(30 * 1024 * 1024 + 1), { status: 200 }),
    );

    const provider = makeProvider(fetchMock as typeof fetch);

    await expect(provider.generate(request())).rejects.toMatchObject({
      outcome: "uncertain",
    });
  });

  it("requires server-side credentials", () => {
    expect(
      () =>
        new OpenAIImageProvider({
          apiKey: "",
          model: "gpt-image-2",
          fetchImpl: vi.fn() as typeof fetch,
        }),
    ).toThrow("OpenAI image provider credentials are unavailable.");
  });

  it("uses the ImageProviderError contract", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("Network failure");
    });

    const provider = makeProvider(fetchMock as typeof fetch);

    try {
      await provider.generate(request());
      throw new Error("Expected rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(ImageProviderError);

      expect(error).toMatchObject({
        outcome: "uncertain",
      });
    }
  });
});
