import React from "react";
import { motion } from "framer-motion";
import { useIsMobile } from "@/hooks/use-mobile";

export function Orb({ state, sizeOverride }: { state: "idle" | "listening" | "thinking" | "responding"; sizeOverride?: number }) {
  const isMobile = useIsMobile();
  const size = sizeOverride ?? (isMobile ? 280 : 480);

  const pulseSpeed = state === "listening" ? 1.2 : state === "thinking" ? 0.8 : state === "responding" ? 0.5 : 3.5;
  const spinSpeed = state === "thinking" ? 2.5 : state === "listening" ? 5 : state === "responding" ? 3 : 18;
  const intensity = state === "idle" ? 1 : 1.2;

  return (
    <motion.div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size, willChange: "transform", transform: "translateZ(0)", backfaceVisibility: "hidden" }}
      animate={{ scale: [1, 1.015 * intensity, 1] }}
      transition={{ duration: pulseSpeed, repeat: Infinity, ease: "easeInOut" }}
    >
      {/* Outer atmospheric blue glow */}
      <div
        className="absolute rounded-full pointer-events-none"
        style={{
          width: size * 1.05,
          height: size * 1.05,
          left: -size * 0.025,
          top: -size * 0.025,
          background: "radial-gradient(circle, rgba(0,150,255,0.18) 0%, rgba(0,100,220,0.08) 40%, transparent 70%)",
          filter: "blur(20px)",
        }}
      />

      {/* Outermost faint ring */}
      <div
        className="absolute rounded-full pointer-events-none"
        style={{
          width: size * 0.95, height: size * 0.95,
          left: size * 0.025, top: size * 0.025,
          border: "1px solid rgba(60,180,255,0.25)",
        }}
      />

      {/* Outer rotating tick ring — full-size SVG so rotation center = orb center */}
      <motion.svg
        className="absolute inset-0 pointer-events-none"
        width={size} height={size}
        style={{ willChange: "transform", transformOrigin: "50% 50%", transformBox: "fill-box" as any, transform: "translateZ(0)" }}
        viewBox="0 0 100 100"
        animate={{ rotate: 360 }}
        transition={{ duration: spinSpeed * 1.5, repeat: Infinity, ease: "linear" }}
      >
        {Array.from({ length: 60 }).map((_, i) => {
          const angle = (i / 60) * 360;
          const isLong = i % 5 === 0;
          // Outer tick ring at radius ~44 (was ~46 in 88%-sized SVG)
          return (
            <line
              key={i}
              x1="50" y1="6"
              x2="50" y2={isLong ? 9.5 : 7.7}
              stroke="rgba(80,200,255,0.5)"
              strokeWidth={isLong ? 0.7 : 0.35}
              transform={`rotate(${angle} 50 50)`}
            />
          );
        })}
      </motion.svg>

      {/* Concentric rings - going inward */}
      {[0.82, 0.74, 0.66, 0.58].map((r, i) => (
        <div
          key={i}
          className="absolute rounded-full pointer-events-none"
          style={{
            width: size * r, height: size * r,
            left: size * (1 - r) / 2, top: size * (1 - r) / 2,
            border: `1px solid rgba(60,180,255,${0.2 + i * 0.08})`,
            boxShadow: i === 1 ? "0 0 15px rgba(0,160,255,0.2)" : "none",
          }}
        />
      ))}

      {/* Bright thick reactor ring with strong glow */}
      <motion.div
        className="absolute rounded-full pointer-events-none"
        style={{
          width: size * 0.5, height: size * 0.5,
          left: size * 0.25, top: size * 0.25,
          border: "3px solid rgba(120,220,255,0.95)",
          boxShadow: "0 0 30px rgba(80,200,255,0.8), 0 0 60px rgba(0,160,255,0.6), inset 0 0 25px rgba(120,220,255,0.5), inset 0 0 50px rgba(0,160,255,0.3)",
          background: "radial-gradient(circle, rgba(0,80,160,0.4) 0%, rgba(0,40,100,0.6) 70%, rgba(0,20,60,0.8) 100%)",
        }}
        animate={{
          boxShadow: [
            "0 0 30px rgba(80,200,255,0.8), 0 0 60px rgba(0,160,255,0.6), inset 0 0 25px rgba(120,220,255,0.5), inset 0 0 50px rgba(0,160,255,0.3)",
            "0 0 40px rgba(80,200,255,1), 0 0 80px rgba(0,160,255,0.8), inset 0 0 30px rgba(120,220,255,0.7), inset 0 0 60px rgba(0,160,255,0.4)",
            "0 0 30px rgba(80,200,255,0.8), 0 0 60px rgba(0,160,255,0.6), inset 0 0 25px rgba(120,220,255,0.5), inset 0 0 50px rgba(0,160,255,0.3)",
          ],
        }}
        transition={{ duration: pulseSpeed * 0.8, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Rotating segmented inner ring (counter rotation) — full-size SVG */}
      <motion.svg
        className="absolute inset-0 pointer-events-none"
        width={size} height={size}
        style={{ willChange: "transform", transformOrigin: "50% 50%", transformBox: "fill-box" as any, transform: "translateZ(0)" }}
        viewBox="0 0 100 100"
        animate={{ rotate: -360 }}
        transition={{ duration: spinSpeed, repeat: Infinity, ease: "linear" }}
      >
        {/* Segmented dashes around (radius scaled from 46 in 42%-SVG to ~19.3 in full SVG) */}
        <circle cx="50" cy="50" r="19.3" fill="none" stroke="rgba(150,230,255,0.7)" strokeWidth="0.65" strokeDasharray="1.3 1.7" />
        <circle cx="50" cy="50" r="17.6" fill="none" stroke="rgba(120,220,255,0.4)" strokeWidth="0.25" />
        {/* Cardinal markers */}
        {[0, 90, 180, 270].map((deg) => (
          <g key={deg} transform={`rotate(${deg} 50 50)`}>
            <rect x="49.2" y="29.7" width="1.7" height="2.5" fill="rgba(180,240,255,0.9)" />
          </g>
        ))}
      </motion.svg>

      {/* Inner rotating ring with brackets — full-size SVG */}
      <motion.svg
        className="absolute inset-0 pointer-events-none"
        width={size} height={size}
        style={{ willChange: "transform", transformOrigin: "50% 50%", transformBox: "fill-box" as any, transform: "translateZ(0)" }}
        viewBox="0 0 100 100"
        animate={{ rotate: 360 }}
        transition={{ duration: spinSpeed * 0.7, repeat: Infinity, ease: "linear" }}
      >
        {/* Inner circle at radius scaled from 46 in 34%-SVG to ~15.6 in full SVG */}
        <circle cx="50" cy="50" r="15.6" fill="none" stroke="rgba(120,220,255,0.6)" strokeWidth="0.34" />
        {/* Bracket marks at 45° intervals */}
        {[45, 135, 225, 315].map((deg) => (
          <g key={deg} transform={`rotate(${deg} 50 50)`}>
            <path d="M 48.6 33.4 L 51.4 33.4 L 51.4 35.1 M 48.6 33.4 L 48.6 35.1" stroke="rgba(160,235,255,0.85)" strokeWidth="0.4" fill="none" />
          </g>
        ))}
      </motion.svg>

      {/* Center reactor core (dark backdrop with glowing triangle) */}
      <div
        className="absolute rounded-full flex items-center justify-center"
        style={{
          width: size * 0.28, height: size * 0.28,
          left: size * 0.36, top: size * 0.36,
          background: "radial-gradient(circle, rgba(180,240,255,0.95) 0%, rgba(80,200,255,0.85) 30%, rgba(0,100,200,0.7) 60%, rgba(0,40,100,0.85) 100%)",
          boxShadow: "0 0 40px rgba(120,220,255,0.9), inset 0 0 20px rgba(255,255,255,0.4)",
          border: "1.5px solid rgba(180,240,255,0.8)",
        }}
      >
        {/* Triangle SVG with "V" marks resembling Iron Man Mark VII reactor */}
        <svg viewBox="0 0 100 100" width="80%" height="80%">
          <defs>
            <radialGradient id="triGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.95)" />
              <stop offset="60%" stopColor="rgba(180,240,255,0.7)" />
              <stop offset="100%" stopColor="rgba(80,200,255,0.4)" />
            </radialGradient>
          </defs>
          {/* Outer triangle frame (downward) */}
          <polygon
            points="50,82 18,28 82,28"
            fill="rgba(20,40,80,0.7)"
            stroke="rgba(200,240,255,0.95)"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          {/* Inner small triangle (downward, glowing white) */}
          <polygon
            points="50,68 32,38 68,38"
            fill="url(#triGlow)"
            stroke="rgba(255,255,255,0.9)"
            strokeWidth="1"
          />
          {/* Side notches like Mark VII reactor */}
          <line x1="14" y1="32" x2="22" y2="32" stroke="rgba(180,240,255,0.8)" strokeWidth="1.5" />
          <line x1="78" y1="32" x2="86" y2="32" stroke="rgba(180,240,255,0.8)" strokeWidth="1.5" />
          <line x1="46" y1="86" x2="54" y2="86" stroke="rgba(180,240,255,0.8)" strokeWidth="1.5" />
        </svg>
      </div>

      {/* Center bright pulse glow */}
      <motion.div
        className="absolute rounded-full pointer-events-none"
        style={{
          width: size * 0.18, height: size * 0.18,
          left: size * 0.41, top: size * 0.41,
          background: "radial-gradient(circle, rgba(255,255,255,0.5) 0%, rgba(180,240,255,0.3) 30%, transparent 70%)",
          filter: "blur(8px)",
        }}
        animate={{ opacity: [0.6, 1, 0.6], scale: [1, 1.15, 1] }}
        transition={{ duration: pulseSpeed * 0.6, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Cardinal nodes (4 bright dots at N, S, E, W on the ring) */}
      {[
        { x: 0.5, y: 0.04 }, { x: 0.5, y: 0.96 },
        { x: 0.04, y: 0.5 }, { x: 0.96, y: 0.5 },
      ].map((p, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{
            width: 8, height: 8,
            left: size * p.x - 4, top: size * p.y - 4,
            background: "rgba(180,240,255,1)",
            boxShadow: "0 0 12px rgba(120,220,255,1), 0 0 24px rgba(80,200,255,0.8)",
          }}
          animate={{ opacity: [1, 0.4, 1] }}
          transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.4 }}
        />
      ))}
    </motion.div>
  );
}
