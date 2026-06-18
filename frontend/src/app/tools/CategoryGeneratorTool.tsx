'use client'

import { useState, useEffect, useRef, useCallback } from "react";

interface UploadResult {
  file_id: string;
  file_name: string;
  columns: string[];
  row_count: number;
  preview: Record<string, unknown>[];
}

interface CodebookEntry {
  label: string;
  type: string;
  definition: string;
  coded_values: string;
}

const EMPTY_ENTRY: CodebookEntry = { label: "", type: "binary", definition: "", coded_values: "" };


interface Category {
  // shared
  label: string;
  definition: string;
  example: string;
  values: string;
  // rate
  scale_min?: number;
  scale_max?: number;
  anchor_low?: string;
  anchor_high?: string;
  // extract
  format?: string;
}

interface ProviderModel {
  value: string;
  label: string;
  models: { value: string; label: string }[];
}

interface Props {
  providers: ProviderModel[];
}

export default function CategoryGenerator({ providers }: Props) {
  const [goals, setGoals] = useState("");
  const [hypothesis, setHypothesis] = useState("");
  const [outputType, setOutputType] = useState("classify");
  const [targetCount, setTargetCount] = useState(6);
  const [domain, setDomain] = useState("");
  const [references, setReferences] = useState("");
  const [openPanels, setOpenPanels] = useState(new Set([1, 2, 3, 4, 5]));
  const [genConfig, setGenConfig] = useState({
    provider: "openai",
    model: "gpt-4o",
    apiKey: "",
  });

  const togglePanel = (n: number) => {
    setOpenPanels((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  };

  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // // File upload state
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // Table expand modal: null | "preview" | "codebook" | "live". will use this for object types
  const [expandedTable, setExpandedTable] = useState<string | null>(null);

  // Form state
  const [messageColumn, setMessageColumn] = useState("");
  const [experimentInstructions, setExperimentInstructions] = useState("");  //get rid of
  const [codingInstructions, setCodingInstructions] = useState("");    //get ride of
  const [codebook, setCodebook] = useState<CodebookEntry[]>([{ ...EMPTY_ENTRY }]);   //change to object types -> not codebook naming

  
  const handleUpload = useCallback(async (file: File) => {
    setUploading(true);
    setUploadError("");
    setUploadResult(null);
    setMessageColumn("");

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/coding/upload", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(body.detail || res.statusText);
      }
      const data: UploadResult = await res.json();
      setUploadResult(data);
      setOpenPanels((prev) => new Set([...prev, 2]));
    } catch (e: unknown) {
      setUploadError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }, []);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleUpload(file);
  };

  const handleGenerate = async () => {
    if (!goals.trim()) { alert("Please enter research goals."); return; }
    if (!hypothesis.trim()) { alert("Please enter a hypothesis."); return; }
    if (!domain.trim()) { alert("Please enter a domain."); return; }
    if (!genConfig.provider || !genConfig.model || !genConfig.apiKey.trim()) {
      alert("Please select a provider, model, and enter an API key.");
      return;
    }

    // Reset
    setCategories([]);
    setProgress(null);
    setLoading(true);

    // const dataSample = dataSampleText
    //   .split("\n")
    //   .filter(line => line.trim() !== "")
    //   .map((line, idx) => ({ id: idx + 1, text: line.trim() }));

    const rawApi = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const apiBase = /^https?:\/\//.test(rawApi) ? rawApi : `https://${rawApi}`;
    const ws = new WebSocket(`${apiBase.replace(/^http/, "ws")}/api/ws/generate/categories`);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({
        api_key: genConfig.apiKey,
        model: genConfig.model,
        provider: genConfig.provider,
        goals,
        hypothesis,
        output_type: outputType,
        target_count: targetCount,
        domain,
        references,
        message_column: messageColumn,       
        file_id: uploadResult?.file_id ?? null, 
      }));
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);

      if (msg.type === "category") {
        setCategories(prev => [...prev, msg.data]);
        setProgress({ current: msg.index + 1, total: msg.total });
      } else if (msg.type === "complete") {
        setLoading(false);
        setProgress(null);
      } else if (msg.type === "error") {
        alert(`Error: ${msg.message}`);
        setLoading(false);
        setProgress(null);
      }
    };

    ws.onerror = () => {
      alert("WebSocket connection failed. Is the backend running?");
      setLoading(false);
    };

    ws.onclose = () => {
      setLoading(false);
    };
  };


  return (
    <div className="tool-page active">
      <div className="tool-header">
        <div>
          <h1>Category Generator</h1>
          <p className="tool-desc">
            Automatically generate coding categories, tags, or schemas from your research context.
          </p>
        </div>
      </div>

      <div className="pipeline-layout split">
        <div className="config-col">
          <div className="config-scroll">
            {/* Panel 1: Upload Dataset */}
            <div className={`panel ${openPanels.has(1) ? "open" : ""}`}>
              <button className="panel-head" onClick={() => togglePanel(1)}>
                <div className="panel-head-left">
                  <span className="step-badge">1</span>
                  <span className="panel-label">Upload Dataset</span>
                  {uploadResult && <span className="tag">uploaded</span>}
                </div>
                <svg className="chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6l4 4 4-4" /></svg>
              </button>
              <div className="panel-content">
                <div
                  className="dropzone"
                  onClick={() => fileRef.current?.click()}
                  onDrop={onDrop}
                  onDragOver={(e) => e.preventDefault()}
                >
                  <div className="dz-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="28" height="28">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                    </svg>
                  </div>
                  <p className="dz-text">
                    {uploading ? "Uploading..." : "Drop a CSV or Excel file here, or click to browse"}
                  </p>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={onFileChange}
                  style={{ display: "none" }}
                />

                {uploadError && <p className="enc-error">{uploadError}</p>}

                {uploadResult && (
                  <div style={{ marginTop: 12 }}>
                    <div className="file-chip">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" /></svg>
                      {uploadResult.file_name}
                      <span className="chip-meta">{uploadResult.row_count} rows · {uploadResult.columns.length} cols</span>
                    </div>

                    <div className="table-wrap table-clickable" onClick={() => setExpandedTable("preview")} title="Click to expand">
                      <table className="tbl tbl-compact">
                        <thead>
                          <tr>
                            {uploadResult.columns.map((col) => (
                              <th key={col}>{col}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {uploadResult.preview.map((row, i) => (
                            <tr key={i}>
                              {uploadResult.columns.map((col) => (
                                <td key={col} className="mono">{String(row[col] ?? "")}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Panel 2: Select Message Column */}
            <div className={`panel ${openPanels.has(2) ? "open" : ""}`}>
              <button className="panel-head" onClick={() => togglePanel(2)}>
                <div className="panel-head-left">
                  <span className="step-badge">2</span>
                  <span className="panel-label">Message Column</span>
                  {messageColumn && <span className="tag">{messageColumn}</span>}
                </div>
                <svg className="chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6l4 4 4-4" /></svg>
              </button>
              <div className="panel-content">
                {uploadResult ? (
                  <div className="f">
                    <label>Select the column containing the text to code</label>
                    <select value={messageColumn} onChange={(e) => setMessageColumn(e.target.value)}>
                      <option value="">— Choose column —</option>
                      {uploadResult.columns.map((col) => (
                        <option key={col} value={col}>{col}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <p className="hint">Upload a file first to see available columns.</p>
                )}
              </div>
            </div>
            {/* Panel 1: Research Context */}
            <div className={`panel ${openPanels.has(3) ? "open" : ""}`}>
              <button className="panel-head" onClick={() => togglePanel(3)}>
                <div className="panel-head-left">
                  <span className="step-badge">3</span>
                  <span className="panel-label">Research Context</span>
                </div>
                <svg className="chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6l4 4 4-4" /></svg>
              </button>
              <div className="panel-content">
                <div className="f">
                  <label>Goals</label>
                  <textarea rows={3} value={goals} onChange={(e) => setGoals(e.target.value)} />
                  <label>Hypothesis</label>
                  <textarea rows={2} value={hypothesis} onChange={(e) => setHypothesis(e.target.value)} />
                </div>
              </div>
            </div>

            {/* Panel 2: Generation Settings */}
            <div className={`panel ${openPanels.has(4) ? "open" : ""}`}>
              <button className="panel-head" onClick={() => togglePanel(4)}>
                <div className="panel-head-left">
                  <span className="step-badge">4</span>
                  <span className="panel-label">Generation Settings</span>
                </div>
                <svg className="chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6l4 4 4-4" /></svg>
              </button>
              <div className="panel-content">
                <div className="f">
                  <div className="catgen-page">
                    <div className="flex-row">
                      <div className="f">
                        <label>Output type</label>
                        <select value={outputType} onChange={(e) => setOutputType(e.target.value)}>
                          <option value="classify">Classify (single label)</option>
                          <option value="tag">Tag (multi-label)</option>
                          <option value="rate">Rate (scaled)</option>
                          <option value="extract">Extract (structured)</option>
                        </select>
                      </div>
                      <div className="f">
                        <label>Target count: {targetCount}</label>
                        <input
                          type="range" min={3} max={20} value={targetCount}
                          onChange={(e) => setTargetCount(Number(e.target.value))}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="f">
                    <label>Domain</label>
                    <input value={domain} onChange={(e) => setDomain(e.target.value)} style={{ width: "100%" }} />
                  </div>
                  <div className="f">
                    <label>Generator Provider</label>
                    <select
                      value={genConfig.provider}
                      onChange={(e) => {
                        const provider = e.target.value;
                        const firstModel = providers.find((p) => p.value === provider)?.models?.[0]?.value ?? "";
                        setGenConfig((prev) => ({ ...prev, provider, model: firstModel }));
                      }}
                    >
                      {providers.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                  </div>
                  <div className="f">
                    <label>Generator Model</label>
                    <select
                      value={genConfig.model}
                      onChange={(e) => setGenConfig((prev) => ({ ...prev, model: e.target.value }))}
                    >
                      {(providers.find((p) => p.value === genConfig.provider)?.models ?? []).map((m) => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="f">
                    <label>API Key</label>
                    <input
                      type="password" value={genConfig.apiKey} placeholder="Enter API key"
                      onChange={(e) => setGenConfig((prev) => ({ ...prev, apiKey: e.target.value }))}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Panel 3: References */}
            <div className={`panel ${openPanels.has(5) ? "open" : ""}`}>
              <button className="panel-head" onClick={() => togglePanel(5)}>
                <div className="panel-head-left">
                  <span className="step-badge">5</span>
                  <span className="panel-label">References (optional)</span>
                </div>
                <svg className="chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6l4 4 4-4" /></svg>
              </button>
              <div className="panel-content">
                <textarea rows={3} value={references} onChange={(e) => setReferences(e.target.value)} />
              </div>
            </div>


          </div>

          <div className="run-bar">
            <button className="btn btn-run" onClick={handleGenerate} disabled={loading}>
              {loading ? "Generating..." : "Generate Categories"}
            </button>
          </div>
        </div>

        {/* ── RIGHT: RESULTS ── */}
        <div className="results-col">
          <div className="res-section">
            <div className="res-section-h">
              Generated Categories
              {progress && (
                <span style={{ fontWeight: 400, fontSize: 12, color: "var(--text-3)", marginLeft: 8 }}>
                  {progress.current} / {progress.total}
                </span>
              )}
            </div>

            {categories.length === 0 ? (
              <div className="results-empty">
                <p>{loading ? "Generating..." : "No categories generated yet"}</p>
              </div>
            ) : (
              <div className="catgen-results">
                {categories.map((cat, idx) => (
                  <div key={idx} className="catgen-card">
                    <div className="catgen-card-h">
                      <div className="catgen-num">{idx + 1}</div>
                      <strong>{cat.label}</strong>
                    </div>
                    <div className="catgen-card-body">
                      <div className="catgen-field">
                        <span className="catgen-label">Definition:</span>
                        {cat.definition}
                      </div>
                      <div className="catgen-field">
                        <span className="catgen-label">Values:</span>
                        {cat.values}
                      </div>

                      {/* rate */}
                      {cat.scale_min !== undefined && (
                        <div className="catgen-field">
                          <span className="catgen-label">Scale:</span>
                          {cat.scale_min} – {cat.scale_max}
                        </div>
                      )}
                      {cat.anchor_low && (
                        <div className="catgen-field">
                          <span className="catgen-label">Low anchor:</span>
                          {cat.anchor_low}
                        </div>
                      )}
                      {cat.anchor_high && (
                        <div className="catgen-field">
                          <span className="catgen-label">High anchor:</span>
                          {cat.anchor_high}
                        </div>
                      )}

                      {/* extract */}
                      {cat.format && (
                        <div className="catgen-field">
                          <span className="catgen-label">Format:</span>
                          {cat.format}
                        </div>
                      )}

                      <div className="catgen-field">
                        <span className="catgen-label">Example:</span>
                        <em>{cat.example}</em>
                      </div>
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="catgen-card" style={{ opacity: 0.4 }}>
                    <div className="catgen-card-h">
                      <div className="catgen-num">···</div>
                      <strong>Generating...</strong>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}