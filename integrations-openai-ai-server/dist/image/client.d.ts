import OpenAI from "openai";
import { Buffer } from "node:buffer";
export declare const openai: OpenAI;
export type ImageQuality = "low" | "medium" | "high" | "auto";
export declare function generateImageBuffer(prompt: string, size?: "1024x1024" | "1536x1024" | "1024x1536" | "512x512" | "256x256", quality?: ImageQuality): Promise<Buffer>;
export type ImageStreamEvent = {
    type: "partial";
    b64: string;
    index: number;
    format: string;
} | {
    type: "done";
    b64: string;
    format: string;
};
/**
 * Streaming image generation. Yields up to `partial_images` progressive
 * previews followed by the final image. The user sees a blurry preview in
 * roughly 3–5s and a sharper image at each step, dramatically reducing the
 * *perceived* wait even if total render time is unchanged.
 *
 * Falls back to a single completed event when the upstream API returns a
 * non-streaming response (older providers / proxies).
 */
export declare function streamImageGeneration(prompt: string, size?: "1024x1024" | "1536x1024" | "1024x1536", quality?: ImageQuality, partialImages?: number): AsyncGenerator<ImageStreamEvent, void, void>;
export declare function editImages(imageFiles: string[], prompt: string, outputPath?: string): Promise<Buffer>;
//# sourceMappingURL=client.d.ts.map