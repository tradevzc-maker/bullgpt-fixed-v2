"use client";
import { ChangeEvent, DragEvent, useRef, useState } from "react";
import { validateImage } from "@/lib/validation/image";
import type { Direction } from "@/types/analysis";

interface Props { onAnalyze: (file: File, settings: { symbol: string; timeframe: string; direction: Direction }) => void; busy: boolean; }
export function ChartUpload({ onAnalyze, busy }: Props) {
  const input = useRef<HTMLInputElement>(null); const [file, setFile] = useState<File | null>(null); const [preview, setPreview] = useState<string | null>(null); const [error, setError] = useState("");
  const [symbol, setSymbol] = useState(""); const [timeframe, setTimeframe] = useState(""); const [direction, setDirection] = useState<Direction>("UNKNOWN");
  function choose(candidate?: File) { if (!candidate) return; const issue = validateImage(candidate); if (issue) { setError(issue); return; } setError(""); setFile(candidate); setPreview(URL.createObjectURL(candidate)); }
  function onDrop(event: DragEvent<HTMLDivElement>) { event.preventDefault(); choose(event.dataTransfer.files[0]); }
  function remove() { setFile(null); setPreview(null); setError(""); if (input.current) input.current.value = ""; }
  return <section className="upload-card" id="analyze">
    <div className="section-kicker">New analysis</div><h2>Bring your setup into focus.</h2><p className="muted">Upload a TradingView or chart screenshot. We’ll keep unknowns as unknowns.</p>
    {!preview ? <div className="dropzone" onDrop={onDrop} onDragOver={(event) => event.preventDefault()} role="button" tabIndex={0} onKeyDown={(event) => event.key === "Enter" && input.current?.click()} onClick={() => input.current?.click()}>
      <span className="upload-icon">↑</span><strong>Drop your chart here</strong><span>or select a file from your device</span><button type="button" className="secondary">Upload chart</button><small>PNG, JPG, JPEG, WEBP · Max 8 MB</small>
    </div> : <div className="preview-wrap"><img src={preview} alt="Selected trading chart" /><button type="button" className="remove" onClick={remove}>Remove image</button></div>}
    <input ref={input} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event: ChangeEvent<HTMLInputElement>) => choose(event.target.files?.[0])} />
    {error && <p className="error" role="alert">{error}</p>}
    <div className="field-grid"><label>Symbol <input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="e.g. BTCUSD (optional)" /></label><label>Timeframe <input value={timeframe} onChange={(e) => setTimeframe(e.target.value)} placeholder="e.g. 1H (optional)" /></label><label>Bias <select value={direction} onChange={(e) => setDirection(e.target.value as Direction)}><option value="UNKNOWN">Auto-detect</option><option value="LONG">Long</option><option value="SHORT">Short</option></select></label></div>
    <button className="primary analyze" disabled={!file || busy} onClick={() => file && onAnalyze(file, { symbol, timeframe, direction })}>{busy ? "Analyzing chart…" : "Analyze setup"}</button>
  </section>;
}
