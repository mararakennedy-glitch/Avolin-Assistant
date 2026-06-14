// Save-to-disk helpers used by the answer panel.
// - Images get a branded "AVOLIN" watermark applied client-side before
//   download, in the same cyan/dark palette as the rest of the UI.
// - Music is offline-rendered from the seeded composer (so the saved WAV
//   sounds identical to what the user just heard) and then encoded as a
//   standard 16-bit PCM WAV file.

import { renderMusicBuffer } from "./music-gen";

// ────────────────────────────────────────────────────────────────────────────
// Generic browser download trigger.
// ────────────────────────────────────────────────────────────────────────────

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Free memory shortly after the click — Chrome needs a tick.
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function safeSlug(input: string, max = 48): string {
  const s = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, max);
  return s || "avolin";
}

function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

// ────────────────────────────────────────────────────────────────────────────
// Image — apply the Avolin watermark in the bottom-right and download.
// ────────────────────────────────────────────────────────────────────────────

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error(`Failed to load image: ${e}`));
    img.src = src;
  });
}

// Draws the Avolin "arc-reactor" orb mark — the same JARVIS-style emblem the
// app shows on its home screen: concentric cyan rings, a glowing blue core,
// dashed dial ticks on the outer ring, and a downward white triangle in the
// middle. Drawn entirely with canvas primitives so the watermark always looks
// pixel-sharp regardless of image size and never depends on an external asset.
function drawOrbMark(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
) {
  const r = size / 2;
  ctx.save();
  ctx.translate(cx, cy);

  // Outer broken/dashed ring — the rotating dial.
  ctx.strokeStyle = "rgba(0, 220, 255, 0.85)";
  ctx.lineWidth = Math.max(1, size * 0.025);
  ctx.setLineDash([size * 0.06, size * 0.04]);
  ctx.shadowColor = "rgba(0, 220, 255, 0.7)";
  ctx.shadowBlur = size * 0.18;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.96, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.shadowBlur = 0;

  // Mid solid ring.
  ctx.strokeStyle = "rgba(120, 220, 255, 0.55)";
  ctx.lineWidth = Math.max(1, size * 0.018);
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.78, 0, Math.PI * 2);
  ctx.stroke();

  // Tick marks around the inner ring (4 short segments at cardinal points
  // that read as the HUD detail in the home-screen orb).
  ctx.lineWidth = Math.max(1, size * 0.03);
  ctx.strokeStyle = "rgba(180, 245, 255, 0.95)";
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const inner = r * 0.6;
    const outer = r * 0.7;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
    ctx.lineTo(Math.cos(a) * outer, Math.sin(a) * outer);
    ctx.stroke();
  }

  // Glowing blue core.
  const coreR = r * 0.5;
  const coreGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, coreR);
  coreGrad.addColorStop(0, "rgba(180, 240, 255, 1)");
  coreGrad.addColorStop(0.45, "rgba(0, 180, 255, 0.95)");
  coreGrad.addColorStop(1, "rgba(0, 60, 110, 0.85)");
  ctx.fillStyle = coreGrad;
  ctx.shadowColor = "rgba(0, 220, 255, 0.9)";
  ctx.shadowBlur = size * 0.25;
  ctx.beginPath();
  ctx.arc(0, 0, coreR, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Downward-pointing white triangle (the Avolin emblem).
  const triR = r * 0.32;
  ctx.fillStyle = "rgba(245, 252, 255, 0.98)";
  ctx.shadowColor = "rgba(255, 255, 255, 0.65)";
  ctx.shadowBlur = size * 0.08;
  ctx.beginPath();
  ctx.moveTo(-triR * 0.92, -triR * 0.55);
  ctx.lineTo(triR * 0.92, -triR * 0.55);
  ctx.lineTo(0, triR * 0.85);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.restore();
}

function drawWatermark(ctx: CanvasRenderingContext2D, w: number, h: number) {
  // Scale the watermark to the longer image dimension so it looks consistent
  // on tiny thumbnails AND huge generations.
  const baseScale = Math.max(w, h) / 1024;
  const padding = 28 * baseScale;
  const fontMain = Math.max(14, Math.round(40 * baseScale));
  const fontSub = Math.max(10, Math.round(14 * baseScale));

  // Fonts — use Rajdhani if loaded (matches the UI), else fall back to a
  // similar sans-serif so the watermark always renders.
  const fontFamily =
    "'Rajdhani', 'Orbitron', 'Eurostile', 'Helvetica Neue', system-ui, sans-serif";

  const text = "AVOLIN";
  const sub = "Created with Avolin · avolin.app";

  ctx.save();
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";

  // The orb sits at the left of the plate; reserve a square for it.
  const orbSize = (fontMain + fontSub) * 1.35;
  const orbGap = padding * 0.55;

  // Measure widths for the rounded background plate.
  ctx.font = `700 ${fontMain}px ${fontFamily}`;
  const mainWidth = ctx.measureText(text).width;
  ctx.font = `500 ${fontSub}px ${fontFamily}`;
  const subWidth = ctx.measureText(sub).width;
  const textWidth = Math.max(mainWidth, subWidth);

  const plateWidth = orbSize + orbGap + textWidth + padding * 1.4;
  const plateHeight = Math.max(fontMain + fontSub + padding * 1.0, orbSize + padding * 0.4);
  const plateX = w - plateWidth - padding * 0.4;
  const plateY = h - plateHeight - padding * 0.4;

  // Glow plate background — translucent cyan-tinted dark, like the UI cards.
  const grad = ctx.createLinearGradient(plateX, plateY, plateX, plateY + plateHeight);
  grad.addColorStop(0, "rgba(0, 16, 28, 0.78)");
  grad.addColorStop(1, "rgba(0, 8, 18, 0.92)");
  ctx.fillStyle = grad;

  const radius = Math.min(20 * baseScale, plateHeight / 3);
  roundRect(ctx, plateX, plateY, plateWidth, plateHeight, radius);
  ctx.fill();

  // Cyan border + glow
  ctx.strokeStyle = "rgba(0, 220, 255, 0.55)";
  ctx.lineWidth = Math.max(1, 1.5 * baseScale);
  ctx.shadowColor = "rgba(0, 220, 255, 0.55)";
  ctx.shadowBlur = 14 * baseScale;
  roundRect(ctx, plateX, plateY, plateWidth, plateHeight, radius);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Corner brackets (HUD style) on the plate
  const bracket = Math.min(14 * baseScale, plateHeight * 0.35);
  ctx.strokeStyle = "rgba(0, 220, 255, 0.85)";
  ctx.lineWidth = Math.max(1.5, 2 * baseScale);
  // top-left
  ctx.beginPath();
  ctx.moveTo(plateX, plateY + bracket); ctx.lineTo(plateX, plateY); ctx.lineTo(plateX + bracket, plateY);
  ctx.stroke();
  // top-right
  ctx.beginPath();
  ctx.moveTo(plateX + plateWidth - bracket, plateY); ctx.lineTo(plateX + plateWidth, plateY); ctx.lineTo(plateX + plateWidth, plateY + bracket);
  ctx.stroke();
  // bottom-left
  ctx.beginPath();
  ctx.moveTo(plateX, plateY + plateHeight - bracket); ctx.lineTo(plateX, plateY + plateHeight); ctx.lineTo(plateX + bracket, plateY + plateHeight);
  ctx.stroke();
  // bottom-right
  ctx.beginPath();
  ctx.moveTo(plateX + plateWidth - bracket, plateY + plateHeight); ctx.lineTo(plateX + plateWidth, plateY + plateHeight); ctx.lineTo(plateX + plateWidth, plateY + plateHeight - bracket);
  ctx.stroke();

  // Arc-reactor orb mark on the left of the plate.
  const orbCx = plateX + padding * 0.55 + orbSize / 2;
  const orbCy = plateY + plateHeight / 2;
  drawOrbMark(ctx, orbCx, orbCy, orbSize);

  // Text block to the right of the orb.
  const textX = orbCx + orbSize / 2 + orbGap;

  // AVOLIN main text — bright cyan with glow
  ctx.shadowColor = "rgba(0, 220, 255, 0.85)";
  ctx.shadowBlur = 14 * baseScale;
  ctx.fillStyle = "rgba(180, 245, 255, 1)";
  ctx.font = `700 ${fontMain}px ${fontFamily}`;
  ctx.fillText(text, textX, plateY + plateHeight / 2 + fontMain * 0.05);
  ctx.shadowBlur = 0;

  // Tagline
  ctx.fillStyle = "rgba(150, 220, 240, 0.78)";
  ctx.font = `500 ${fontSub}px ${fontFamily}`;
  ctx.fillText(sub, textX, plateY + plateHeight / 2 + fontMain * 0.2 + fontSub);

  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export async function downloadImageWithWatermark(
  imageSrc: string,
  promptOrTitle: string,
): Promise<void> {
  const img = await loadImage(imageSrc);
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable.");

  // Draw the user's exact image first, then stamp the watermark on top so the
  // saved file is byte-identical to what they see, plus our brand mark.
  ctx.drawImage(img, 0, 0, w, h);
  drawWatermark(ctx, w, h);

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Failed to encode PNG."))),
      "image/png",
    );
  });

  const filename = `avolin-${safeSlug(promptOrTitle)}-${timestamp()}.png`;
  triggerDownload(blob, filename);
}

// ────────────────────────────────────────────────────────────────────────────
// Music — offline-render the deterministic composition, encode as WAV, save.
// ────────────────────────────────────────────────────────────────────────────

function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const numFrames = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numFrames * blockAlign;
  const headerSize = 44;
  const buf = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(buf);

  function writeStr(offset: number, s: string) {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  }

  // RIFF header
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");

  // fmt sub-chunk
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true); // PCM
  view.setUint16(20, 1, true);  // format = 1 (PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // bits per sample

  // data sub-chunk
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);

  // Interleave channels and write 16-bit samples.
  const channelData: Float32Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) channelData.push(buffer.getChannelData(ch));
  let offset = headerSize;
  for (let i = 0; i < numFrames; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      let sample = channelData[ch][i];
      if (sample > 1) sample = 1;
      else if (sample < -1) sample = -1;
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
  }

  return new Blob([buf], { type: "audio/wav" });
}

export async function downloadGeneratedMusic(opts: {
  prompt: string;
  durationSec: number;
  seed: number;
  mood?: string;
}): Promise<void> {
  const { prompt, durationSec, seed, mood } = opts;
  const buffer = await renderMusicBuffer(prompt, durationSec, seed);
  const blob = audioBufferToWav(buffer);
  const tag = mood ? `${mood}-` : "";
  const filename = `avolin-${tag}${safeSlug(prompt)}-${timestamp()}.wav`;
  triggerDownload(blob, filename);
}
