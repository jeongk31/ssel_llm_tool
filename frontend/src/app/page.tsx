"use client";

import { useState, useRef, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CodebookEntry {
  label: string;
  type: string;
  definition: string;
  encoded_values: string;
}

interface UploadResult {
  file_id: string;
  file_name: string;
  columns: string[];
  row_count: number;
  preview: Record<string, unknown>[];
}

interface GenerateResult {
  script: string;
  filename: string;
}

interface EncodedRow {
  index: number;
  original: Record<string, unknown>;
  encoded: Record<string, unknown>;
}

interface RunProgress {
  current: number;
  total: number;
  percent: number;
}

const PROVIDERS: { value: string; label: string; models: { value: string; label: string }[] }[] = [
  {
    value: "openai", label: "OpenAI", models: [
      { value: "gpt-4o", label: "GPT-4o" },
      { value: "gpt-4o-mini", label: "GPT-4o Mini" },
      { value: "gpt-4-turbo", label: "GPT-4 Turbo" },
      { value: "gpt-4", label: "GPT-4" },
      { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo" },
      { value: "o1", label: "o1" },
      { value: "o1-mini", label: "o1 Mini" },
      { value: "o3-mini", label: "o3 Mini" },
    ],
  },
  {
    value: "anthropic", label: "Anthropic", models: [
      { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
      { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
      { value: "claude-opus-4-20250514", label: "Claude Opus 4" },
      { value: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet" },
      { value: "claude-3-5-haiku-20241022", label: "Claude 3.5 Haiku" },
    ],
  },
  {
    value: "gemini", label: "Google (Gemini)", models: [
      { value: "gemini-2.5-pro-preview-06-05", label: "Gemini 2.5 Pro" },
      { value: "gemini-2.5-flash-preview-05-20", label: "Gemini 2.5 Flash" },
      { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
      { value: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
      { value: "gemini-1.5-flash", label: "Gemini 1.5 Flash" },
    ],
  },
  {
    value: "deepseek", label: "DeepSeek", models: [
      { value: "deepseek-chat", label: "DeepSeek-V3" },
      { value: "deepseek-reasoner", label: "DeepSeek-R1" },
    ],
  },
  {
    value: "mistral", label: "Mistral", models: [
      { value: "mistral-large-latest", label: "Mistral Large" },
      { value: "mistral-medium-latest", label: "Mistral Medium" },
      { value: "mistral-small-latest", label: "Mistral Small" },
      { value: "codestral-latest", label: "Codestral" },
    ],
  },
  {
    value: "together", label: "Together AI", models: [
      { value: "meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8", label: "Llama 4 Maverick" },
      { value: "meta-llama/Llama-4-Scout-17B-16E-Instruct", label: "Llama 4 Scout" },
      { value: "meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo", label: "Llama 3.1 405B" },
      { value: "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo", label: "Llama 3.1 70B" },
      { value: "Qwen/Qwen2.5-72B-Instruct-Turbo", label: "Qwen 2.5 72B" },
      { value: "mistralai/Mixtral-8x22B-Instruct-v0.1", label: "Mixtral 8x22B" },
    ],
  },
];

const CODEBOOK_TYPES = [
  { value: "binary", label: "Binary" },
  { value: "categorical", label: "Categorical" },
  { value: "ordinal", label: "Ordinal" },
  { value: "numeric", label: "Numeric" },
  { value: "text", label: "Text" },
];

const EMPTY_ENTRY: CodebookEntry = { label: "", type: "binary", definition: "", encoded_values: "" };

interface ModelSlot {
  provider: string;
  model: string;
  apiKey: string;
}

const EMPTY_SLOT: ModelSlot = { provider: "openai", model: "gpt-4o", apiKey: "" };

// ── Component ─────────────────────────────────────────────────────────────────

export default function Home() {
  // File upload state
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // Form state
  const [messageColumn, setMessageColumn] = useState("");
  const [experimentInstructions, setExperimentInstructions] = useState("");
  const [encodingInstructions, setEncodingInstructions] = useState("");
  const [codebook, setCodebook] = useState<CodebookEntry[]>([{ ...EMPTY_ENTRY }]);

  // Model slots
  const [modelSlots, setModelSlots] = useState<ModelSlot[]>([{ ...EMPTY_SLOT }]);
  const [runsPerModel, setRunsPerModel] = useState(1);
  const [aggregation, setAggregation] = useState<"mode" | "mean">("mode");

  // Legacy aliases for compatibility with generate/run code
  const provider = modelSlots[0]?.provider ?? "openai";
  const model = modelSlots[0]?.model ?? "gpt-4o";
  const apiKey = modelSlots[0]?.apiKey ?? "";

  // Generate state
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState("");
  const [result, setResult] = useState<GenerateResult | null>(null);

  // Run state
  const [running, setRunning] = useState(false);
  const [runProgress, setRunProgress] = useState<RunProgress | null>(null);
  const [encodedRows, setEncodedRows] = useState<EncodedRow[]>([]);
  const [runErrors, setRunErrors] = useState<string[]>([]);
  const [runComplete, setRunComplete] = useState<{ total_rows: number; encoded_rows: number; file_path: string } | null>(null);
  const [runError, setRunError] = useState("");
  const wsRef = useRef<WebSocket | null>(null);

  // Console log state
  const [consoleLogs, setConsoleLogs] = useState<{ time: string; level: "info" | "warn" | "error"; msg: string }[]>([]);
  const consoleRef = useRef<HTMLDivElement>(null);

  // Right panel view: "script" | "run"
  const [rightView, setRightView] = useState<"script" | "run">("script");

  // Table expand modal: null | "preview" | "codebook" | "live"
  const [expandedTable, setExpandedTable] = useState<string | null>(null);

  // Panel open/close state
  const [openPanels, setOpenPanels] = useState<Set<number>>(new Set([1]));

  const togglePanel = (n: number) => {
    setOpenPanels((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  };

  // ── File upload ─────────────────────────────────────────────────────────────

  const handleUpload = useCallback(async (file: File) => {
    setUploading(true);
    setUploadError("");
    setUploadResult(null);
    setMessageColumn("");

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/encoding/upload", {
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

  // ── Codebook management ─────────────────────────────────────────────────────

  const updateCodebook = (idx: number, field: keyof CodebookEntry, value: string) => {
    setCodebook((prev) => prev.map((entry, i) => (i === idx ? { ...entry, [field]: value } : entry)));
  };

  const addCodebookRow = () => setCodebook((prev) => [...prev, { ...EMPTY_ENTRY }]);

  const removeCodebookRow = (idx: number) => {
    if (codebook.length <= 1) return;
    setCodebook((prev) => prev.filter((_, i) => i !== idx));
  };

  // ── Script generation ───────────────────────────────────────────────────────

  const canGenerate =
    uploadResult &&
    messageColumn &&
    experimentInstructions.trim() &&
    encodingInstructions.trim() &&
    codebook.every((e) => e.label.trim() && e.type && e.definition.trim()) &&
    modelSlots.length > 0 &&
    modelSlots.every((s) => s.provider && s.model && s.apiKey.trim());

  const handleGenerate = async () => {
    if (!canGenerate || !uploadResult) return;

    setGenerating(true);
    setGenerateError("");
    setResult(null);
    setRightView("script");

    try {
      const res = await fetch("/api/encoding/generate-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file_name: uploadResult.file_name,
          message_column: messageColumn,
          experiment_instructions: experimentInstructions,
          encoding_instructions: encodingInstructions,
          codebook,
          provider,
          model,
          api_key: apiKey,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(body.detail || res.statusText);
      }

      const data: GenerateResult = await res.json();
      setResult(data);
    } catch (e: unknown) {
      setGenerateError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = () => {
    if (!result) return;
    const blob = new Blob([result.script], { type: "text/x-python" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = result.filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Console logging helper ───────────────────────────────────────────────────

  const log = (level: "info" | "warn" | "error", msg: string) => {
    const time = new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setConsoleLogs((prev) => [...prev, { time, level, msg }]);
    // Auto-scroll console
    setTimeout(() => consoleRef.current?.scrollTo({ top: consoleRef.current.scrollHeight }), 50);
  };

  // ── Run encoding via WebSocket ──────────────────────────────────────────────

  const handleRun = async () => {
    if (!canGenerate || !uploadResult) return;

    // Reset state
    setRunning(true);
    setRunProgress(null);
    setEncodedRows([]);
    setRunErrors([]);
    setRunComplete(null);
    setRunError("");
    setGenerateError("");
    setConsoleLogs([]);
    setRightView("run");

    // Step 1: Generate the script first
    log("info", "Generating encoding script...");
    try {
      const res = await fetch("/api/encoding/generate-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file_name: uploadResult.file_name,
          message_column: messageColumn,
          experiment_instructions: experimentInstructions,
          encoding_instructions: encodingInstructions,
          codebook,
          provider,
          model,
          api_key: apiKey,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(body.detail || res.statusText);
      }

      const data: GenerateResult = await res.json();
      setResult(data);
      log("info", `Script generated: ${data.filename}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Script generation failed";
      log("error", `Script generation failed: ${msg}`);
      setGenerateError(msg);
      setRunning(false);
      return;
    }

    // Step 2: Connect WebSocket and run encoding
    log("info", `Connecting to encoding service...`);
    const modelNames = modelSlots.map((s) => {
      const p = PROVIDERS.find((p) => p.value === s.provider);
      const m = p?.models.find((m) => m.value === s.model);
      return `${p?.label}/${m?.label}`;
    });
    log("info", `Models: ${modelNames.join(", ")} × ${runsPerModel} run${runsPerModel > 1 ? "s" : ""} each`);
    log("info", `Aggregation: ${aggregation} · File: ${uploadResult.file_name} (${uploadResult.row_count} rows)`);
    log("info", `Codebook: ${codebook.filter((e) => e.label.trim()).map((e) => e.label).join(", ")}`);

    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${wsProtocol}//localhost:8000/api/ws/encoding/run`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      log("info", "Connected. Starting encoding...");
      ws.send(
        JSON.stringify({
          file_id: uploadResult.file_id,
          message_column: messageColumn,
          experiment_instructions: experimentInstructions,
          encoding_instructions: encodingInstructions,
          codebook,
          model_slots: modelSlots.map((s) => ({
            provider: s.provider,
            model: s.model,
            api_key: s.apiKey,
          })),
          runs_per_model: runsPerModel,
          aggregation,
        })
      );
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);

      if (msg.type === "progress") {
        setRunProgress({ current: msg.current, total: msg.total, percent: msg.percent });
        log("info", `Row ${msg.current}/${msg.total} (${msg.percent}%)`);
      } else if (msg.type === "row") {
        setEncodedRows((prev) => [...prev, { index: msg.index, original: msg.original, encoded: msg.encoded }]);
        if (msg.encoded._error) {
          log("warn", `Row ${msg.index + 1}: ${msg.encoded._error}`);
        }
      } else if (msg.type === "error" && msg.index !== undefined) {
        setRunErrors((prev) => [...prev, msg.message]);
        log("error", msg.message);
      } else if (msg.type === "error") {
        setRunError(msg.message);
        log("error", `Fatal: ${msg.message}`);
        setRunning(false);
      } else if (msg.type === "complete") {
        setRunComplete({
          total_rows: msg.total_rows,
          encoded_rows: msg.encoded_rows,
          file_path: msg.file_path,
        });
        log("info", `Encoding complete. ${msg.total_rows} rows processed, ${msg.encoded_rows} encoded.`);
        setRunning(false);
      }
    };

    ws.onerror = () => {
      log("error", "WebSocket connection failed. Is the backend running?");
      setRunError("WebSocket connection failed");
      setRunning(false);
    };

    ws.onclose = (event) => {
      if (event.code !== 1000 && event.code !== 1005) {
        log("warn", `WebSocket closed (code: ${event.code})`);
      }
      setRunning(false);
    };
  };

  const handleStop = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    log("warn", "Encoding stopped by user.");
    setRunning(false);
  };

  const handleDownloadResults = () => {
    if (!runComplete) return;
    window.open(`/api/encoding/download?path=${encodeURIComponent(runComplete.file_path)}`, "_blank");
  };

  // ── Test mode: fill all fields with sample data ──────────────────────────────

  const handleTestFill = async () => {
    // Upload the test CSV
    try {
      const res = await fetch("/test_messages.csv");
      const blob = await res.blob();
      const file = new File([blob], "charness_dufwenberg_messages.csv", { type: "text/csv" });

      setUploading(true);
      setUploadError("");
      const formData = new FormData();
      formData.append("file", file);

      const uploadRes = await fetch("/api/encoding/upload", {
        method: "POST",
        body: formData,
      });
      if (!uploadRes.ok) throw new Error("Upload failed");
      const data: UploadResult = await uploadRes.json();
      setUploadResult(data);
      setUploading(false);
    } catch {
      setUploading(false);
      setUploadError("Could not load test CSV. Make sure the file is in the public folder.");
    }

    // Set message column
    setMessageColumn("Message");

    // Set experiment instructions
    setExperimentInstructions(`In this experiment (Charness & Dufwenberg, 2006), participants played a one-shot trust game:
- Participants were paired as Player A (principal) and Player B (agent).
- Player A decides whether to enter a partnership ("In") or opt out ("Out").
- If A chooses "Out", both players receive $5 each.
- If A chooses "In", Player B decides to:
  - "Roll": A six-sided die is rolled.
    5/6 probability → A gets $12, B gets $10
    1/6 probability → A gets $0, B gets $10
  - "Don't Roll": A gets $0, B gets $14.
- In some treatments, Player B could send a pre-play free-form message to Player A before decisions were made. These messages were non-binding.
All amounts are in addition to a $5 show-up fee.`);

    // Set encoding instructions
    setEncodingInstructions(`Read each message sent by Player B carefully. Classify each message into the following categories. Each category is independent — a message can be classified as YES (1) or NO (0) for each.

Consider the game context: Player B is sending a message to Player A before A decides to choose "In" or "Out". B's message may try to influence A's decision.

For each variable, output 1 if the message fits the category, 0 if it does not.
If the message field is empty/blank, classify as: Promise=0, Empty_Talk=0, No_Message=1.`);

    // Set codebook
    setCodebook([
      {
        label: "Promise",
        type: "binary",
        definition: "The message explicitly states an intention to choose 'Roll' (i.e. to cooperate) if Player A chooses 'In'. This includes direct promises, commitments, or statements of intended action. Example YES: 'I will choose roll.' Example NO: 'Please choose In so we can get paid more.'",
        encoded_values: "0,1",
      },
      {
        label: "Empty_Talk",
        type: "binary",
        definition: "The message does not express any promise or intention to Roll. This includes greetings, good luck wishes, jokes, general thoughts, comments irrelevant to the game decision, or messages expressing uncertainty about their intended action. Example YES: 'Please choose In so we can get paid more.' Example NO: 'I will choose roll.'",
        encoded_values: "0,1",
      },
      {
        label: "No_Message",
        type: "binary",
        definition: "No message was sent (blank or opted out). This category applies when Player B had the option to send a message but explicitly declined to do so. The message field will be empty.",
        encoded_values: "0,1",
      },
    ]);

    // Set model slots
    setModelSlots([{ provider: "openai", model: "gpt-4o-mini", apiKey: "" }]);
    setRunsPerModel(1);
    setAggregation("mode");

    // Open all panels
    setOpenPanels(new Set([1, 2, 3, 4, 5, 6]));
  };

  // ── Derived values ──────────────────────────────────────────────────────────

  const codebookLabels = codebook.filter((e) => e.label.trim()).map((e) => e.label);
  const visibleRows = encodedRows.slice(-5);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      <nav className="topbar">
        <div className="topbar-left">
          <img src="/ssel_logo.png" alt="SSELab" className="topbar-logo" />
          <div className="topbar-sep" />
          <span className="topbar-title">LLM Measurement Toolkit</span>
          <span className="topbar-badge">beta</span>
        </div>
        <div className="topbar-right">
          <button className="btn btn-ghost btn-xs" onClick={handleTestFill} style={{ color: "var(--text-3)" }}>Load demo</button>
          <div className="status-chip">
            <span className="status-dot" style={{ background: running ? "var(--mid)" : "var(--good)" }} />
            {running ? "Running" : "Ready"}
          </div>
        </div>
      </nav>

      <div className="layout">
        <main className="main">
          <div className="tool-page active">
            <div className="tool-header">
              <div>
                <h1>LLM Encoding</h1>
                <p className="tool-desc">
                  Upload data, configure codebook variables, and encode with one or more LLMs.
                </p>
              </div>
            </div>

            <div className="pipeline-layout split">
              {/* ── Left: Config Column ── */}
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
                          <label>Select the column containing the text to encode</label>
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

                  {/* Panel 3: Experiment Instructions */}
                  <div className={`panel ${openPanels.has(3) ? "open" : ""}`}>
                    <button className="panel-head" onClick={() => togglePanel(3)}>
                      <div className="panel-head-left">
                        <span className="step-badge">3</span>
                        <span className="panel-label">Experiment Instructions</span>
                        {experimentInstructions.trim() && <span className="tag">set</span>}
                      </div>
                      <svg className="chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6l4 4 4-4" /></svg>
                    </button>
                    <div className="panel-content">
                      <div className="f">
                        <label>Describe the experiment context</label>
                        <textarea
                          rows={5}
                          value={experimentInstructions}
                          onChange={(e) => setExperimentInstructions(e.target.value)}
                          placeholder="E.g., This dataset contains negotiation transcripts between pairs of participants. Each row is one message in a conversation..."
                        />
                        <p className="hint">Provide context about what the data represents and the research goals.</p>
                      </div>
                    </div>
                  </div>

                  {/* Panel 4: Encoding Instructions */}
                  <div className={`panel ${openPanels.has(4) ? "open" : ""}`}>
                    <button className="panel-head" onClick={() => togglePanel(4)}>
                      <div className="panel-head-left">
                        <span className="step-badge">4</span>
                        <span className="panel-label">Encoding Instructions</span>
                        {encodingInstructions.trim() && <span className="tag">set</span>}
                      </div>
                      <svg className="chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6l4 4 4-4" /></svg>
                    </button>
                    <div className="panel-content">
                      <div className="f">
                        <label>Describe how encoding should be performed</label>
                        <textarea
                          rows={5}
                          value={encodingInstructions}
                          onChange={(e) => setEncodingInstructions(e.target.value)}
                          placeholder="E.g., Read each message carefully. Classify the tone, intent, and strategy used by the sender..."
                        />
                        <p className="hint">Specific instructions for the LLM on how to apply the codebook to each row.</p>
                      </div>
                    </div>
                  </div>

                  {/* Panel 5: Codebook */}
                  <div className={`panel ${openPanels.has(5) ? "open" : ""}`}>
                    <button className="panel-head" onClick={() => togglePanel(5)}>
                      <div className="panel-head-left">
                        <span className="step-badge">5</span>
                        <span className="panel-label">Codebook</span>
                        {codebook.some((e) => e.label.trim()) && (
                          <span className="tag">{codebook.filter((e) => e.label.trim()).length} var{codebook.filter((e) => e.label.trim()).length !== 1 ? "s" : ""}</span>
                        )}
                      </div>
                      <svg className="chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6l4 4 4-4" /></svg>
                    </button>
                    <div className="panel-content">
                      <div className="table-wrap table-clickable" onClick={() => setExpandedTable("codebook")} title="Click to expand">
                        <table className="tbl editable">
                          <thead>
                            <tr>
                              <th>Label</th>
                              <th>Type</th>
                              <th>Definition</th>
                              <th>Encoded Values</th>
                              <th style={{ width: 30 }} />
                            </tr>
                          </thead>
                          <tbody>
                            {codebook.map((entry, idx) => (
                              <tr key={idx}>
                                <td>
                                  <input
                                    type="text"
                                    value={entry.label}
                                    onChange={(e) => updateCodebook(idx, "label", e.target.value)}
                                    placeholder="e.g., sentiment"
                                  />
                                </td>
                                <td>
                                  <select
                                    value={entry.type}
                                    onChange={(e) => updateCodebook(idx, "type", e.target.value)}
                                  >
                                    {CODEBOOK_TYPES.map((t) => (
                                      <option key={t.value} value={t.value}>{t.label}</option>
                                    ))}
                                  </select>
                                </td>
                                <td>
                                  <input
                                    type="text"
                                    value={entry.definition}
                                    onChange={(e) => updateCodebook(idx, "definition", e.target.value)}
                                    placeholder="What this variable measures"
                                  />
                                </td>
                                <td>
                                  <input
                                    type="text"
                                    value={entry.encoded_values}
                                    onChange={(e) => updateCodebook(idx, "encoded_values", e.target.value)}
                                    placeholder="e.g., 0,1 or positive,neutral,negative"
                                  />
                                </td>
                                <td>
                                  <button
                                    className="row-rm"
                                    onClick={() => removeCodebookRow(idx)}
                                    title="Remove row"
                                    disabled={codebook.length <= 1}
                                  >
                                    ×
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <button className="btn btn-ghost btn-xs" onClick={addCodebookRow}>
                        + Add Variable
                      </button>
                      <p className="hint" style={{ marginTop: 8 }}>
                        <code>binary</code>: 0/1 · <code>categorical</code>: named categories · <code>ordinal</code>: ordered scale · <code>numeric</code>: number · <code>text</code>: free text
                      </p>
                    </div>
                  </div>

                  {/* Panel 6: Models + Voting */}
                  <div className={`panel ${openPanels.has(6) ? "open" : ""}`}>
                    <button className="panel-head" onClick={() => togglePanel(6)}>
                      <div className="panel-head-left">
                        <span className="step-badge">6</span>
                        <span className="panel-label">Models &amp; Voting</span>
                        <span className="tag">
                          {modelSlots.length} model{modelSlots.length !== 1 ? "s" : ""} × {runsPerModel} run{runsPerModel !== 1 ? "s" : ""}
                        </span>
                      </div>
                      <svg className="chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6l4 4 4-4" /></svg>
                    </button>
                    <div className="panel-content">

                      {/* Model slots */}
                      <div className="model-slots">
                        {modelSlots.map((slot, idx) => {
                          const provInfo = PROVIDERS.find((p) => p.value === slot.provider);
                          const modelInfo = provInfo?.models.find((m) => m.value === slot.model);
                          return (
                            <div className="model-slot" key={idx}>
                              <div className="slot-header">
                                <span className="slot-num" style={{ background: "var(--purple)" }}>{idx + 1}</span>
                                <span className="slot-title">{provInfo?.label ?? slot.provider} — {modelInfo?.label ?? slot.model}</span>
                                <div style={{ flex: 1 }} />
                                {modelSlots.length > 1 && (
                                  <button
                                    className="row-rm"
                                    onClick={() => setModelSlots((prev) => prev.filter((_, i) => i !== idx))}
                                    title="Remove model"
                                  >×</button>
                                )}
                              </div>
                              <div className="slot-body">
                                <div className="fg cols-3">
                                  <div className="f">
                                    <label>Provider</label>
                                    <select
                                      value={slot.provider}
                                      onChange={(e) => {
                                        const np = e.target.value;
                                        const ms = PROVIDERS.find((p) => p.value === np)?.models ?? [];
                                        setModelSlots((prev) => prev.map((s, i) => i === idx ? { ...s, provider: np, model: ms[0]?.value ?? "" } : s));
                                      }}
                                    >
                                      {PROVIDERS.map((p) => (
                                        <option key={p.value} value={p.value}>{p.label}</option>
                                      ))}
                                    </select>
                                  </div>
                                  <div className="f">
                                    <label>Model</label>
                                    <select
                                      value={slot.model}
                                      onChange={(e) => setModelSlots((prev) => prev.map((s, i) => i === idx ? { ...s, model: e.target.value } : s))}
                                    >
                                      {(provInfo?.models ?? []).map((m) => (
                                        <option key={m.value} value={m.value}>{m.label}</option>
                                      ))}
                                    </select>
                                  </div>
                                  <div className="f">
                                    <label>API Key</label>
                                    <input
                                      type="password"
                                      value={slot.apiKey}
                                      onChange={(e) => setModelSlots((prev) => prev.map((s, i) => i === idx ? { ...s, apiKey: e.target.value } : s))}
                                      placeholder="sk-..."
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <button
                        className="btn btn-ghost btn-xs"
                        style={{ marginTop: 8 }}
                        onClick={() => setModelSlots((prev) => [...prev, { ...EMPTY_SLOT }])}
                      >
                        + Add Model
                      </button>

                      {/* Voting settings */}
                      <div className="enc-voting-settings">
                        <div className="enc-voting-row">
                          <div className="f" style={{ flex: 1 }}>
                            <label>Runs per model <span className="fv">{runsPerModel}×</span></label>
                            <input
                              type="range"
                              min={1}
                              max={10}
                              value={runsPerModel}
                              onChange={(e) => setRunsPerModel(Number(e.target.value))}
                            />
                          </div>
                          <div className="f" style={{ width: 160, flexShrink: 0 }}>
                            <label>Aggregation</label>
                            <select value={aggregation} onChange={(e) => setAggregation(e.target.value as "mode" | "mean")}>
                              <option value="mode">Mode (majority vote)</option>
                              <option value="mean">Mean (average)</option>
                            </select>
                          </div>
                        </div>
                        <div className="enc-voting-summary">
                          <span className="enc-voting-calc">
                            {modelSlots.length} model{modelSlots.length !== 1 ? "s" : ""} × {runsPerModel} run{runsPerModel !== 1 ? "s" : ""} = <strong>{modelSlots.length * runsPerModel}</strong> calls/row
                          </span>
                          {modelSlots.length * runsPerModel > 1 && (
                            <span className="enc-voting-agg">
                              {aggregation === "mode" ? "Majority vote" : "Average"} across all calls
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                </div>

                {/* Run bar */}
                <div className="run-bar">
                  {generateError && <span className="enc-error" style={{ flex: 1, marginRight: 8 }}>{generateError}</span>}
                  <button
                    className="btn btn-outline btn-sm"
                    disabled={!canGenerate || generating || running}
                    onClick={handleGenerate}
                  >
                    {generating ? "Generating..." : "Script only"}
                  </button>
                  {running ? (
                    <button className="btn btn-sm" style={{ background: "var(--bad)", color: "white", border: "1px solid var(--bad)" }} onClick={handleStop}>
                      Stop
                    </button>
                  ) : (
                    <button
                      className="btn btn-run"
                      disabled={!canGenerate || generating}
                      onClick={handleRun}
                    >
                      Run Encoding
                      {modelSlots.length * runsPerModel > 1 && (
                        <span style={{ opacity: 0.7, fontWeight: 400, marginLeft: 4 }}>
                          ({modelSlots.length}×{runsPerModel})
                        </span>
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* ── Right: Results Column ── */}
              <div className="results-col" style={{ display: "block" }}>

                {/* Tab strip to switch views */}
                {(result || encodedRows.length > 0 || running) && (
                  <div className="tab-strip" style={{ marginBottom: 16 }}>
                    <button className={`tab ${rightView === "run" ? "active" : ""}`} onClick={() => setRightView("run")}>
                      Live Encoding
                      {running && <span className="enc-pulse" />}
                    </button>
                    <button className={`tab ${rightView === "script" ? "active" : ""}`} onClick={() => setRightView("script")}>
                      Script Preview
                    </button>
                  </div>
                )}

                {/* ── Run View ── */}
                {rightView === "run" && (running || encodedRows.length > 0 || runComplete) ? (
                  <div className="tab-pane">
                    {/* Progress bar */}
                    {(runProgress || running) && (
                      <div className="enc-progress-wrap">
                        <div className="enc-progress-header">
                          <span className="enc-progress-label">
                            {runComplete
                              ? "Encoding complete"
                              : running
                                ? `Encoding row ${runProgress?.current ?? 0} of ${runProgress?.total ?? "?"}...`
                                : "Ready"}
                          </span>
                          <span className="enc-progress-pct">{runProgress?.percent ?? 0}%</span>
                        </div>
                        <div className="enc-progress-track">
                          <div
                            className={`enc-progress-fill ${runComplete ? "complete" : ""}`}
                            style={{ width: `${runProgress?.percent ?? 0}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Stats row */}
                    {(runProgress || runComplete) && (
                      <div className="stat-row" style={{ marginTop: 12 }}>
                        <div className="stat">
                          <div className="stat-v">{runProgress?.current ?? 0}</div>
                          <div className="stat-l">Processed</div>
                        </div>
                        <div className="stat">
                          <div className="stat-v">{runProgress?.total ?? 0}</div>
                          <div className="stat-l">Total</div>
                        </div>
                        <div className="stat">
                          <div className="stat-v">{runErrors.length}</div>
                          <div className="stat-l">Errors</div>
                        </div>
                      </div>
                    )}

                    {/* Live results table — last 5 rows */}
                    {visibleRows.length > 0 && (
                      <div className="res-section" style={{ marginTop: 12 }}>
                        <div className="res-section-h">
                          Live Results (last {Math.min(5, encodedRows.length)} of {encodedRows.length} rows)
                        </div>
                        <div className="enc-live-table-wrap table-clickable" onClick={() => setExpandedTable("live")} title="Click to expand">
                          <table className="tbl tbl-compact">
                            <thead>
                              <tr>
                                <th>#</th>
                                <th>{messageColumn || "Message"}</th>
                                {codebookLabels.map((l) => (
                                  <th key={l} className="enc-encoded-col">{l}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {visibleRows.map((row) => (
                                <tr key={row.index} className="enc-row-animate">
                                  <td className="mono" style={{ color: "var(--text-3)" }}>{row.index + 1}</td>
                                  <td style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {String(row.original[messageColumn] ?? "")}
                                  </td>
                                  {codebookLabels.map((label) => (
                                    <td key={label} className="enc-encoded-col">
                                      <span className={`pill ${row.encoded._error ? "bad" : "lbl"}`}>
                                        {row.encoded._error ? "err" : String(row.encoded[label] ?? "—")}
                                      </span>
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Errors */}
                    {runErrors.length > 0 && (
                      <div className="res-section" style={{ marginTop: 12 }}>
                        <div className="res-section-h" style={{ color: "var(--bad)" }}>Errors ({runErrors.length})</div>
                        <div style={{ padding: "8px 14px", fontSize: 12, maxHeight: 120, overflowY: "auto" }}>
                          {runErrors.slice(-5).map((err, i) => (
                            <div key={i} style={{ color: "var(--bad)", marginBottom: 4 }}>{err}</div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Run error */}
                    {runError && <p className="enc-error" style={{ marginTop: 12 }}>{runError}</p>}

                    {/* Complete — download button */}
                    {runComplete && (
                      <div className="enc-complete-bar">
                        <div>
                          <strong>{runComplete.total_rows}</strong> rows encoded
                          {runErrors.length > 0 && <span style={{ color: "var(--mid)" }}> · {runErrors.length} errors</span>}
                        </div>
                        <button className="btn btn-primary" onClick={handleDownloadResults}>
                          Download encoded_results.csv
                        </button>
                      </div>
                    )}

                    {/* Console */}
                    {consoleLogs.length > 0 && (
                      <div className="enc-console" style={{ marginTop: 12 }}>
                        <div className="enc-console-header">
                          <span>Console</span>
                          <button className="btn btn-ghost btn-xs" onClick={() => setConsoleLogs([])}>Clear</button>
                        </div>
                        <div className="enc-console-body" ref={consoleRef}>
                          {consoleLogs.map((entry, i) => (
                            <div key={i} className={`enc-console-line ${entry.level}`}>
                              <span className="enc-console-time">{entry.time}</span>
                              <span className={`enc-console-level ${entry.level}`}>{entry.level.toUpperCase()}</span>
                              <span className="enc-console-msg">{entry.msg}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : rightView === "run" ? (
                  <div className="results-empty">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                    <p>Click Run Encoding to start</p>
                    <span style={{ fontSize: 12 }}>Live progress and results will appear here</span>
                  </div>
                ) : null}

                {/* ── Script View ── */}
                {rightView === "script" && result ? (
                  <div className="tab-pane">
                    <div className="res-head">
                      <h2>Generated Script</h2>
                      <span className="res-meta">{result.filename}</span>
                    </div>

                    <div className="stat-row">
                      <div className="stat">
                        <div className="stat-v">{uploadResult?.row_count ?? 0}</div>
                        <div className="stat-l">Rows</div>
                      </div>
                      <div className="stat">
                        <div className="stat-v">{codebookLabels.length}</div>
                        <div className="stat-l">Variables</div>
                      </div>
                      <div className="stat">
                        <div className="stat-v">{modelSlots.length} × {runsPerModel}</div>
                        <div className="stat-l">Models × Runs</div>
                      </div>
                    </div>

                    <div className="res-section" style={{ marginBottom: 12 }}>
                      <div className="res-section-h" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span>Script Preview</span>
                        <button className="btn btn-primary btn-xs" onClick={handleDownload}>
                          Download .py
                        </button>
                      </div>
                      <div className="script-preview">
                        <pre className="code-block">{result.script}</pre>
                      </div>
                    </div>
                  </div>
                ) : rightView === "script" && !result ? (
                  <div className="results-empty">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                      <path d="M14 2v6h6M10 12l-2 2 2 2M14 12l2 2-2 2" />
                    </svg>
                    <p>Your generated script will appear here</p>
                    <span style={{ fontSize: 12 }}>Fill in the configuration and click Generate Script</span>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* ── Fullscreen Table Modal ── */}
      {expandedTable && (
        <div className="modal-overlay" onClick={() => setExpandedTable(null)}>
          <div className="modal modal-table" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span style={{ fontWeight: 600 }}>
                {expandedTable === "preview" && "Data Preview"}
                {expandedTable === "codebook" && "Codebook"}
                {expandedTable === "live" && `Encoded Results (${encodedRows.length} rows)`}
              </span>
              <button className="btn btn-ghost btn-sm" onClick={() => setExpandedTable(null)}>✕</button>
            </div>
            <div className="modal-body">
              {/* Preview table */}
              {expandedTable === "preview" && uploadResult && (
                <table className="tbl">
                  <thead>
                    <tr>
                      {uploadResult.columns.map((col) => (
                        <th key={col} className={col === messageColumn ? "col-msg" : ""}>{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {uploadResult.preview.map((row, i) => (
                      <tr key={i}>
                        {uploadResult.columns.map((col) => (
                          <td key={col}>{String(row[col] ?? "")}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {/* Codebook table */}
              {expandedTable === "codebook" && (
                <table className="tbl editable">
                  <thead>
                    <tr>
                      <th style={{ width: "12%" }}>Label</th>
                      <th style={{ width: "8%" }}>Type</th>
                      <th className="col-def">Definition</th>
                      <th style={{ width: "14%" }}>Encoded Values</th>
                      <th style={{ width: 30 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {codebook.map((entry, idx) => (
                      <tr key={idx}>
                        <td>
                          <input
                            type="text"
                            value={entry.label}
                            onChange={(e) => updateCodebook(idx, "label", e.target.value)}
                            placeholder="e.g., sentiment"
                          />
                        </td>
                        <td>
                          <select
                            value={entry.type}
                            onChange={(e) => updateCodebook(idx, "type", e.target.value)}
                          >
                            {CODEBOOK_TYPES.map((t) => (
                              <option key={t.value} value={t.value}>{t.label}</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <textarea
                            rows={3}
                            value={entry.definition}
                            onChange={(e) => updateCodebook(idx, "definition", e.target.value)}
                            placeholder="What this variable measures"
                            style={{ fontSize: 12, lineHeight: 1.5, resize: "vertical" }}
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            value={entry.encoded_values}
                            onChange={(e) => updateCodebook(idx, "encoded_values", e.target.value)}
                            placeholder="e.g., 0,1 or positive,neutral,negative"
                          />
                        </td>
                        <td>
                          <button
                            className="row-rm"
                            onClick={() => removeCodebookRow(idx)}
                            title="Remove row"
                            disabled={codebook.length <= 1}
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {expandedTable === "codebook" && (
                <div style={{ marginTop: 8 }}>
                  <button className="btn btn-ghost btn-xs" onClick={addCodebookRow}>+ Add Variable</button>
                </div>
              )}

              {/* Live results table — all rows */}
              {expandedTable === "live" && encodedRows.length > 0 && (
                <table className="tbl">
                  <thead>
                    <tr>
                      <th style={{ width: 40 }}>#</th>
                      <th className="col-msg">{messageColumn || "Message"}</th>
                      {codebookLabels.map((l) => (
                        <th key={l}>{l}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {encodedRows.map((row) => (
                      <tr key={row.index}>
                        <td className="mono" style={{ color: "var(--text-3)" }}>{row.index + 1}</td>
                        <td>
                          {String(row.original[messageColumn] ?? "")}
                        </td>
                        {codebookLabels.map((label) => (
                          <td key={label} style={{ textAlign: "center" }}>
                            <span className={`pill ${row.encoded._error ? "bad" : "lbl"}`}>
                              {row.encoded._error ? "err" : String(row.encoded[label] ?? "—")}
                            </span>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
