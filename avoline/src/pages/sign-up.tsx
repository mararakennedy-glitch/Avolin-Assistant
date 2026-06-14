import { SignUp } from "@clerk/react";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";

export default function SignUpPage() {
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  return (
    <div
      className="min-h-[100dvh] flex flex-col items-center justify-center p-6 dark relative overflow-hidden"
      style={{ background: "#000208", fontFamily: "'Rajdhani', sans-serif" }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: "radial-gradient(ellipse 60% 50% at 50% 40%, rgba(0,80,160,0.25) 0%, transparent 60%)" }}
      />
      <Link
        to="/"
        className="absolute top-6 left-6 inline-flex items-center gap-2 text-xs font-mono text-cyan-400/60 hover:text-cyan-300 tracking-widest uppercase z-10"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back to Avolin
      </Link>
      <div className="relative z-10 mb-6 text-center">
        <h1
          className="text-3xl tracking-[0.4em] font-bold text-cyan-100"
          style={{ fontFamily: "'Orbitron', sans-serif", textShadow: "0 0 20px rgba(0,220,255,0.5)" }}
        >
          AVOLIN
        </h1>
        <p className="text-cyan-400/55 text-xs font-mono tracking-widest uppercase mt-2">
          Create your assistant account
        </p>
      </div>
      <div className="relative z-10">
        <SignUp
          routing="path"
          path={`${basePath}/sign-up`}
          signInUrl={`${basePath}/sign-in`}
          forceRedirectUrl={`${basePath}/`}
          fallbackRedirectUrl={`${basePath}/`}
        />
      </div>
      <p className="relative z-10 mt-6 text-[10px] font-mono tracking-widest uppercase text-cyan-400/30">
        Powered by Avolin · Built by Kennedy Marara
      </p>
    </div>
  );
}
