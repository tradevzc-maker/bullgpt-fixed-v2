"use client";
import { useState } from "react";
import { ChartUpload } from "@/components/upload/chart-upload";
import { AnalysisLoading } from "@/components/analysis/loading";
import { AnalysisDashboard } from "@/components/analysis/dashboard";
import { AnalysisPreview } from "@/components/landing/analysis-preview";
import type { AnalysisResult, Direction } from "@/types/analysis";

export default function Home() {
  const [result, setResult] = useState<AnalysisResult | null>(null); const [image, setImage] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function analyze(file: File, settings: { symbol: string; timeframe: string; direction: Direction }) {
    setBusy(true); setError(""); setResult(null); setImage(URL.createObjectURL(file));
    const form = new FormData(); form.set("image", file); form.set("symbol", settings.symbol); form.set("timeframe", settings.timeframe); form.set("direction", settings.direction);
    try { const response = await fetch("/api/analyze", { method: "POST", body: form }); const data: unknown = await response.json(); if (!response.ok || !data || typeof data !== "object" || !("probabilities" in data)) throw new Error((data as { error?: string }).error || "We couldn't analyze this chart. Please try again."); setResult(data as AnalysisResult); setTimeout(() => document.querySelector("#result")?.scrollIntoView({ behavior: "smooth" }), 50); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "We couldn't analyze this chart. Please try again."); } finally { setBusy(false); }
  }
  return <main><nav><a className="logo" href="#top">BULL<span>GPT</span></a><a href="#analyze" className="nav-link">Analyze chart <span>→</span></a></nav>
    <header id="top" className="hero"><div><div className="eyebrow">AI chart decision support</div><h1>Analyze your trade <em>before</em> you take it.</h1><p>Upload a trading chart screenshot. BullGPT assesses the setup and returns scenario probabilities, risk analysis, and clear invalidation conditions.</p><div className="hero-actions"><a className="primary" href="#analyze">Analyze a chart <span>→</span></a><span>PNG · JPG · WEBP</span></div><small className="disclaimer">Decision support only. Not financial advice. Markets are uncertain.</small></div><AnalysisPreview /></header>
    <ChartUpload onAnalyze={analyze} busy={busy}/>{error && <p className="api-error" role="alert">{error}</p>}{busy && <AnalysisLoading/>}{result && <AnalysisDashboard result={result} image={image}/>}<footer>© {new Date().getFullYear()} BullGPT · Built for clarity, not certainty.</footer>
  </main>;
}
