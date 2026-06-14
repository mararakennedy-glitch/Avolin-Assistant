import fs from "node:fs";
import OpenAI, { toFile } from "openai";
import { Buffer } from "node:buffer";

if (!process.env.AI_INTEGRATIONS_OPENAI_BASE_URL) {
  throw new Error(
    "AI_INTEGRATIONS_OPENAI_BASE_URL must be set. Did you forget to provision the OpenAI AI integration?",
  );
}

if (!process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
  throw new Error(
    "AI_INTEGRATIONS_OPENAI_API_KEY must be set. Did you forget to provision the OpenAI AI integration?",
  );
}

export const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export type ImageQuality = "low" | "medium" | "high" | "auto";

export async function generateImageBuffer(
  prompt: string,
  size: "1024x1024" | "1536x1024" | "1024x1536" | "512x512" | "256x256" = "1024x1024",
  quality: ImageQuality = "low",
): Promise<Buffer> {
  // `quality: "low"` keeps gpt-image-1 generations snappy (~5-10s vs ~30-40s
  // for "high"). Callers that need richer detail (paid tiers) pass "medium"
  // or "high" explicitly.
  const response = (await openai.images.generate({
    model: "gpt-image-1",
    prompt,
    size: size as "1024x1024" | "1536x1024" | "1024x1536",
    quality,
    output_format: "jpeg",
    output_compression: 80,
  } as Parameters<typeof openai.images.generate>[0])) as {
    data?: Array<{ b64_json?: string }>;
  };
  const base64 = response.data?.[0]?.b64_json ?? "";
  return Buffer.from(base64, "base64");
}

export type ImageStreamEvent =
  | { type: "partial"; b64: string; index: number; format: string }
  | { type: "done"; b64: string; format: string };

/**
 * Streaming image generation. Yields up to `partial_images` progressive
 * previews followed by the final image. The user sees a blurry preview in
 * roughly 3–5s and a sharper image at each step, dramatically reducing the
 * *perceived* wait even if total render time is unchanged.
 *
 * Falls back to a single completed event when the upstream API returns a
 * non-streaming response (older providers / proxies).
 */
export async function* streamImageGeneration(
  prompt: string,
  size: "1024x1024" | "1536x1024" | "1024x1536" = "1024x1024",
  quality: ImageQuality = "low",
  partialImages: number = 2,
): AsyncGenerator<ImageStreamEvent, void, void> {
  const stream = await openai.images.generate({
    model: "gpt-image-1",
    prompt,
    size,
    quality,
    stream: true,
    partial_images: partialImages,
    output_format: "jpeg",
    output_compression: 80,
  } as Parameters<typeof openai.images.generate>[0]);

  // The streaming overload returns an async-iterable Stream of events.
  if (typeof (stream as any)[Symbol.asyncIterator] === "function") {
    for await (const event of stream as AsyncIterable<any>) {
      const t = event?.type as string | undefined;
      const b64 = event?.b64_json as string | undefined;
      const fmt = (event?.output_format as string | undefined) ?? "jpeg";
      if (!b64) continue;
      if (t === "image_generation.partial_image") {
        yield {
          type: "partial",
          b64,
          index: (event?.partial_image_index as number) ?? 0,
          format: fmt,
        };
      } else if (t === "image_generation.completed") {
        yield { type: "done", b64, format: fmt };
      }
    }
    return;
  }

  // Non-streaming fallback (proxy didn't honor stream:true).
  const single = stream as unknown as { data?: Array<{ b64_json?: string }> };
  const b64 = single.data?.[0]?.b64_json ?? "";
  if (b64) yield { type: "done", b64, format: "jpeg" };
}

export async function editImages(
  imageFiles: string[],
  prompt: string,
  outputPath?: string
): Promise<Buffer> {
  const images = await Promise.all(
    imageFiles.map((file) =>
      toFile(fs.createReadStream(file), file, {
        type: "image/png",
      })
    )
  );

  const response = await openai.images.edit({
    model: "gpt-image-1",
    image: images,
    prompt,
  });

  const imageBase64 = response.data?.[0]?.b64_json ?? "";
  const imageBytes = Buffer.from(imageBase64, "base64");

  if (outputPath) {
    fs.writeFileSync(outputPath, imageBytes);
  }

  return imageBytes;
}
