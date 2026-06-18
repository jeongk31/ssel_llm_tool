"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import CategoryGenerator from "@/app/tools/CategoryGeneratorTool";
import Instructions from "@/app/tools/HowToPage";


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

interface ValidationIssue {
  rowIndex: number;
  variable: string;
  value: unknown;
  expected: string;
  issueType: "out_of_range" | "not_numeric" | "api_error";
}

interface ValidationReport {
  totalRows: number;
  validRows: number;
  errorRows: number;
  outOfRangeRows: number;
  issues: ValidationIssue[];
  problematicIndices: number[];
}

interface MetricResult {
  estimate: number | null;
  se: number | null;
  ci_lower: number | null;
  ci_upper: number | null;
}

interface VariableMetrics {
  variable: string;
  variable_type: string;
  n_items: number;
  n_raters: number;
  percent_agreement: MetricResult;
  cohens_kappa: MetricResult;
  gwets_ac1: MetricResult;
  error?: string;
}


function validateEncodedRows(rows: EncodedRow[], codebook: CodebookEntry[]): ValidationReport {
  const issues: ValidationIssue[] = [];

  for (const row of rows) {
    const enc = row.encoded;

    if (enc._error) {
      issues.push({ rowIndex: row.index, variable: "_error", value: enc._error, expected: "", issueType: "api_error" });
      continue;
    }

    for (const entry of codebook) {
      if (!entry.label.trim()) continue;
      const value = enc[entry.label];

      if (entry.encoded_values.trim()) {
        const allowed = entry.encoded_values.split(",").map((v) => v.trim().toLowerCase());
        const actual = String(value ?? "").trim().toLowerCase();
        if (!allowed.includes(actual)) {
          issues.push({ rowIndex: row.index, variable: entry.label, value, expected: entry.encoded_values, issueType: "out_of_range" });
        }
      }

      if (entry.type === "numeric" && value != null && value !== "") {
        if (isNaN(Number(value))) {
          issues.push({ rowIndex: row.index, variable: entry.label, value, expected: "numeric value", issueType: "not_numeric" });
        }
      }
    }
  }

  const problematicIndices = [...new Set(issues.map((i) => i.rowIndex))];
  const errorRows = new Set(issues.filter((i) => i.issueType === "api_error").map((i) => i.rowIndex)).size;
  const outOfRangeRows = new Set(issues.filter((i) => i.issueType !== "api_error").map((i) => i.rowIndex)).size;

  return {
    totalRows: rows.length,
    validRows: rows.length - problematicIndices.length,
    errorRows,
    outOfRangeRows,
    issues,
    problematicIndices,
  };
}

const PROVIDERS: { value: string; label: string; models: { value: string; label: string }[] }[] = [
  {
    value: "openai", label: "OpenAI", models: [
      { value: "gpt-4.1", label: "GPT-4.1" },
      { value: "gpt-4.1-mini", label: "GPT-4.1 Mini" },
      { value: "gpt-4.1-nano", label: "GPT-4.1 Nano" },
      { value: "gpt-4o", label: "GPT-4o" },
      { value: "gpt-4o-mini", label: "GPT-4o Mini" },
      { value: "o3", label: "o3" },
      { value: "o3-mini", label: "o3 Mini" },
      { value: "o4-mini", label: "o4 Mini" },
      { value: "o1", label: "o1" },
      { value: "o1-mini", label: "o1 Mini" },
      { value: "gpt-4-turbo", label: "GPT-4 Turbo" },
      { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo" },
    ],
  },
  {
    value: "anthropic", label: "Anthropic", models: [
      { value: "claude-opus-4-20250514", label: "Claude Opus 4" },
      { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
      { value: "claude-3-7-sonnet-20250219", label: "Claude 3.7 Sonnet" },
      { value: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet" },
      { value: "claude-3-5-haiku-20241022", label: "Claude 3.5 Haiku" },
      { value: "claude-3-opus-20240229", label: "Claude 3 Opus" },
      { value: "claude-3-haiku-20240307", label: "Claude 3 Haiku" },
    ],
  },
  {
    value: "gemini", label: "Google (Gemini)", models: [
      { value: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro (Preview)" },
      { value: "gemini-3-flash-preview", label: "Gemini 3 Flash (Preview)" },
      { value: "gemini-3.1-flash-lite-preview", label: "Gemini 3.1 Flash Lite (Preview)" },
      { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
      { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
      { value: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite" },
    ],
  },
  {
    value: "deepseek", label: "DeepSeek", models: [
      { value: "deepseek-chat", label: "DeepSeek V3" },
      { value: "deepseek-reasoner", label: "DeepSeek R1" },
    ],
  },
  {
    value: "mistral", label: "Mistral", models: [
      { value: "mistral-large-latest", label: "Mistral Large" },
      { value: "mistral-small-latest", label: "Mistral Small" },
      { value: "codestral-latest", label: "Codestral" },
      { value: "ministral-8b-latest", label: "Ministral 8B" },
      { value: "ministral-3b-latest", label: "Ministral 3B" },
      { value: "pixtral-large-latest", label: "Pixtral Large" },
      { value: "open-mistral-nemo", label: "Mistral Nemo" },
      { value: "open-mixtral-8x22b", label: "Mixtral 8x22B" },
    ],
  },
  {
    value: "together", label: "Together AI", models: [
      { value: "meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8", label: "Llama 4 Maverick" },
      { value: "meta-llama/Llama-4-Scout-17B-16E-Instruct", label: "Llama 4 Scout" },
      { value: "meta-llama/Meta-Llama-3.3-70B-Instruct-Turbo", label: "Llama 3.3 70B" },
      { value: "meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo", label: "Llama 3.1 405B" },
      { value: "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo", label: "Llama 3.1 70B" },
      { value: "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo", label: "Llama 3.1 8B" },
      { value: "deepseek-ai/DeepSeek-R1", label: "DeepSeek R1 (via Together)" },
      { value: "deepseek-ai/DeepSeek-V3", label: "DeepSeek V3 (via Together)" },
      { value: "Qwen/Qwen2.5-72B-Instruct-Turbo", label: "Qwen 2.5 72B" },
      { value: "Qwen/QwQ-32B", label: "QwQ 32B" },
      { value: "google/gemma-2-27b-it", label: "Gemma 2 27B" },
      { value: "google/gemma-2-9b-it", label: "Gemma 2 9B" },
      { value: "mistralai/Mixtral-8x22B-Instruct-v0.1", label: "Mixtral 8x22B" },
      { value: "mistralai/Mistral-Small-24B-Instruct-2501", label: "Mistral Small 24B" },
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

function TagInput({ value, onChange, type }: { value: string; onChange: (v: string) => void; type: string }) {
  const [input, setInput] = useState("");
  const tags = value ? value.split(",").map((t) => t.trim()).filter(Boolean) : [];

  const addTag = (raw: string) => {
    const tag = raw.trim();
    if (!tag) return;
    if (tags.some((t) => t.toLowerCase() === tag.toLowerCase())) return;
    onChange([...tags, tag].join(","));
    setInput("");
  };

  const removeTag = (idx: number) => {
    onChange(tags.filter((_, i) => i !== idx).join(","));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(input);
    } else if (e.key === "Backspace" && !input && tags.length > 0) {
      removeTag(tags.length - 1);
    }
  };

  const placeholder = tags.length === 0
    ? type === "binary" ? "e.g. 0, 1" : type === "numeric" ? "e.g. 0, 10" : "Type a value, press Enter"
    : "Add...";

  return (
    <div className="tag-input">
      {tags.map((tag, i) => (
        <span key={i} className="tag-chip">
          {tag}
          <button className="tag-chip-rm" onClick={() => removeTag(i)} type="button">&times;</button>
        </span>
      ))}
      <input
        className="tag-input-field"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => addTag(input)}
        placeholder={placeholder}
      />
    </div>
  );
}

interface ModelSlot {
  provider: string;
  model: string;
  apiKey: string;
  showKey?: boolean;
}

const EMPTY_SLOT: ModelSlot = { provider: "openai", model: "gpt-4.1-mini", apiKey: "", showKey: false };

type Tool = "encoding" | "catgen" | "newtool1" | "newtool2";
const TOOLS: { value: Tool; label: string }[] = [
  { value: "encoding", label: "LLM Encoding" },
  { value: "catgen", label: "Category Generator" },
];


// ── Component ─────────────────────────────────────────────────────────────────

export default function Home() {
    // Tool switching
  const [activeTool, setActiveTool] = useState<"encoding" | "catgen" | "analysis" | "instructions">("encoding");

  // File upload state
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);


  // Form state
  const [messageColumn, setMessageColumn] = useState("");
  const [experimentInstructions, setExperimentInstructions] = useState("");
  const [encodingInstructions, setEncodingInstructions] = useState("");
  const [codebook, setCodebook] = useState<CodebookEntry[]>([{ ...EMPTY_ENTRY }]);

  // Row filter
  const [rowFilter, setRowFilter] = useState("");
  const [rowFilterError, setRowFilterError] = useState("");

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
  const [validationReport, setValidationReport] = useState<ValidationReport | null>(null);
  const [hasRerun, setHasRerun] = useState(false);
  const encodedRowsRef = useRef<EncodedRow[]>([]);

  // Analysis page state
  const [analysisRaters, setAnalysisRaters] = useState<{ name: string; type: "human" | "llm"; uploadResult: UploadResult | null; uploading: boolean }[]>([]);
  const [episodeColumns, setEpisodeColumns] = useState<string[]>([]);
  const [analysisVariables, setAnalysisVariables] = useState<string[]>([]);
  const [crossCheckResult, setCrossCheckResult] = useState<{ ok: boolean; common_episodes: number; per_rater: { name: string; total_episodes: number }[]; warnings: string[]; missing_columns: { rater: string; missing?: string[]; error?: string }[] } | null>(null);
  const [analysisResults, setAnalysisResults] = useState<Record<string, unknown> | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Console log state
  const [consoleLogs, setConsoleLogs] = useState<{ time: string; level: "info" | "warn" | "error"; msg: string }[]>([]);
  const consoleRef = useRef<HTMLDivElement>(null);

  // Empty-message handling for encoding
  const [emptyMessageHandling, setEmptyMessageHandling] = useState<"error" | "ignore" | "encode">("ignore");

  // Right panel view: "script" | "run"
  const [rightView, setRightView] = useState<"script" | "run">("script");

  // Table expand modal: null | "preview" | "codebook" | "live"
  const [expandedTable, setExpandedTable] = useState<string | null>(null);

  // Toast
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3000);
  };

  // Panel open/close state
  const [openPanels, setOpenPanels] = useState<Set<number>>(new Set([1]));
  const [skipPanelAnim, setSkipPanelAnim] = useState(false);

  const togglePanel = (n: number) => {
    setSkipPanelAnim(false);
    setOpenPanels((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  };

  const openAllPanels = () => {
    setSkipPanelAnim(true);
    setOpenPanels(new Set([1, 2, 3, 4, 5, 6]));
  };

  // Keep ref in sync for use in useEffect
  useEffect(() => { encodedRowsRef.current = encodedRows; }, [encodedRows]);

  // Validate results when encoding completes
  useEffect(() => {
    if (runComplete && encodedRowsRef.current.length > 0) {
      const report = validateEncodedRows(encodedRowsRef.current, codebook);
      setValidationReport(report);
      if (report.problematicIndices.length === 0) {
        log("info", "Validation passed: all rows within expected ranges.");
      } else {
        log("warn", `Validation: ${report.problematicIndices.length} rows with issues (${report.errorRows} errors, ${report.outOfRangeRows} out-of-range).`);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runComplete]);

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
      showToast(`Uploaded ${data.file_name} (${data.row_count} rows)`);
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
    modelSlots.every((s) => s.provider && s.model && s.apiKey.trim()) &&
    !rowFilterError;

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
          empty_message_handling: emptyMessageHandling,
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
    setValidationReport(null);
    setHasRerun(false);
    setAnalysisResults(null);
    setAnalysisError("");
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
          empty_message_handling: emptyMessageHandling,
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

    // Step 2: Validate all model slots
    log("info", "Validating API keys and models...");
    try {
      const valRes = await fetch("/api/encoding/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model_slots: modelSlots.map((s) => ({
            provider: s.provider,
            model: s.model,
            api_key: s.apiKey,
          })),
        }),
      });

      if (!valRes.ok) {
        throw new Error("Validation request failed");
      }

      const valData = await valRes.json();
      for (const r of valData.results) {
        if (r.ok) {
          log("info", `  ${r.label} — OK`);
        } else {
          log("error", `  ${r.label} — FAILED: ${r.error}`);
        }
      }

      if (!valData.ok) {
        log("error", "Validation failed. Fix the errors above before running.");
        setRunning(false);
        return;
      }

      log("info", "All models validated successfully.");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Validation failed";
      log("error", `Validation error: ${msg}`);
      setRunning(false);
      return;
    }

    // Step 3: Connect WebSocket and run encoding
    log("info", `Connecting to encoding service...`);
    const modelNames = modelSlots.map((s) => {
      const p = PROVIDERS.find((p) => p.value === s.provider);
      const m = p?.models.find((m) => m.value === s.model);
      return `${p?.label}/${m?.label}`;
    });
    log("info", `Models: ${modelNames.join(", ")} × ${runsPerModel} run${runsPerModel > 1 ? "s" : ""} each`);
    log("info", `Aggregation: ${aggregation} · File: ${uploadResult.file_name} (${filterActive ? `${parsedFilter.indices.length} of ` : ""}${uploadResult.row_count} rows)`);
    log("info", `Codebook: ${codebook.filter((e) => e.label.trim()).map((e) => e.label).join(", ")}`);

    const rawApi = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const apiBase = /^https?:\/\//.test(rawApi) ? rawApi : `https://${rawApi}`;
    const wsUrl = `${apiBase.replace(/^http/, "ws")}/api/ws/encoding/run`;
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
          empty_message_handling: emptyMessageHandling,

          codebook,
          model_slots: modelSlots.map((s) => ({
            provider: s.provider,
            model: s.model,
            api_key: s.apiKey,
          })),
          runs_per_model: runsPerModel,
          aggregation,
          row_indices: filterActive ? parsedFilter.indices : null,
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
    showToast("Download started");
  };

  const handleDownloadMerged = () => {
    if (encodedRows.length === 0) return;
    const labels = codebook.filter((e) => e.label.trim()).map((e) => e.label);
    const origCols = Object.keys(encodedRows[0].original);
    const headers = [...origCols, ...labels];
    const csvRows = encodedRows.map((r) => {
      return headers.map((h) => {
        const val = origCols.includes(h) ? r.original[h] : r.encoded[h];
        const str = String(val ?? "");
        return str.includes(",") || str.includes('"') || str.includes("\n")
          ? `"${str.replace(/"/g, '""')}"` : str;
      }).join(",");
    });
    const csv = [headers.join(","), ...csvRows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "encoded_results.csv"; a.click();
    URL.revokeObjectURL(url);
    showToast("Download started");
  };

  // ── Analysis page handlers ──────────────────────────────────────────────────

  const handleAnalysisRaterUpload = async (idx: number, file: File) => {
    setAnalysisRaters((prev) => prev.map((r, i) => i === idx ? { ...r, uploading: true } : r));
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/encoding/upload", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Upload failed");
      const data: UploadResult = await res.json();
      setAnalysisRaters((prev) => prev.map((r, i) => i === idx ? { ...r, uploadResult: data, uploading: false } : r));
    } catch {
      setAnalysisRaters((prev) => prev.map((r, i) => i === idx ? { ...r, uploading: false } : r));
    }
  };

  const handleCrossCheck = async () => {
    setAnalysisLoading(true);
    setAnalysisError("");
    setCrossCheckResult(null);
    try {
      const res = await fetch("/api/agreement/cross-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          raters: analysisRaters.filter((r) => r.uploadResult).map((r) => ({
            file_id: r.uploadResult!.file_id, name: r.name, rater_type: r.type,
          })),
          episode_columns: episodeColumns,
          analysis_variables: analysisVariables,
        }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({ detail: "Failed" })); throw new Error(err.detail || "Cross-check failed"); }
      setCrossCheckResult(await res.json());
    } catch (e: unknown) {
      setAnalysisError(e instanceof Error ? e.message : "Cross-check failed");
    } finally {
      setAnalysisLoading(false);
    }
  };

  const handleComputeAnalysis = async () => {
    setAnalysisLoading(true);
    setAnalysisError("");
    setAnalysisResults(null);
    try {
      const res = await fetch("/api/agreement/compute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          raters: analysisRaters.filter((r) => r.uploadResult).map((r) => ({
            file_id: r.uploadResult!.file_id, name: r.name, rater_type: r.type,
          })),
          episode_columns: episodeColumns,
          analysis_variables: analysisVariables,
        }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({ detail: "Failed" })); throw new Error(err.detail || "Computation failed"); }
      setAnalysisResults(await res.json());
    } catch (e: unknown) {
      setAnalysisError(e instanceof Error ? e.message : "Computation failed");
    } finally {
      setAnalysisLoading(false);
    }
  };

  // All columns from uploaded rater files (intersection)
  const allRaterColumns = (() => {
    const uploaded = analysisRaters.filter((r) => r.uploadResult);
    if (uploaded.length === 0) return [];
    let cols = new Set(uploaded[0].uploadResult!.columns);
    for (const r of uploaded.slice(1)) {
      cols = new Set([...cols].filter((c) => r.uploadResult!.columns.includes(c)));
    }
    return [...cols];
  })();

  const handleRerun = (indices: number[] | null) => {
    if (!uploadResult) return;

    setRunning(true);
    setRunProgress(null);
    setRunErrors([]);
    setRunComplete(null);
    setValidationReport(null);
    setRunError("");
    setConsoleLogs([]);

    if (indices) {
      setHasRerun(true);
      log("info", `Re-running ${indices.length} problematic rows...`);
    } else {
      setEncodedRows([]);
      setHasRerun(false);
      log("info", "Re-running all rows from scratch...");
    }

    const rawApi = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const apiBase = /^https?:\/\//.test(rawApi) ? rawApi : `https://${rawApi}`;
    const wsUrl = `${apiBase.replace(/^http/, "ws")}/api/ws/encoding/run`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      log("info", "Connected. Starting re-encoding...");
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
          row_indices: indices,
        })
      );
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);

      if (msg.type === "progress") {
        setRunProgress({ current: msg.current, total: msg.total, percent: msg.percent });
        log("info", `Row ${msg.current}/${msg.total} (${msg.percent}%)`);
      } else if (msg.type === "row") {
        if (indices) {
          // Merge: replace existing row at this index
          setEncodedRows((prev) =>
            prev.map((r) =>
              r.index === msg.index
                ? { index: msg.index, original: msg.original, encoded: msg.encoded }
                : r
            )
          );
        } else {
          setEncodedRows((prev) => [...prev, { index: msg.index, original: msg.original, encoded: msg.encoded }]);
        }
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
        log("info", `Re-encoding complete. ${msg.total_rows} rows processed, ${msg.encoded_rows} encoded.`);
        setRunning(false);
      }
    };

    ws.onerror = () => {
      log("error", "WebSocket connection failed.");
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

  // ── Reset everything ─────────────────────────────────────────────────────────

  const handleReset = () => {
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    setUploadResult(null);
    setUploading(false);
    setUploadError("");
    setDragOver(false);
    setMessageColumn("");
    setExperimentInstructions("");
    setEncodingInstructions("");
    setCodebook([{ ...EMPTY_ENTRY }]);
    setRowFilter("");
    setRowFilterError("");
    setModelSlots([{ ...EMPTY_SLOT }]);
    setRunsPerModel(1);
    setAggregation("mode");
    setGenerating(false);
    setGenerateError("");
    setResult(null);
    setRunning(false);
    setRunProgress(null);
    setEncodedRows([]);
    setRunErrors([]);
    setRunComplete(null);
    setRunError("");
    setValidationReport(null);
    setHasRerun(false);
    setAnalysisRaters([]);
    setAnalysisResults(null);
    setAnalysisError("");
    setCrossCheckResult(null);
    setEpisodeColumns([]);
    setAnalysisVariables([]);
    setConsoleLogs([]);
    setRightView("script");
    setExpandedTable(null);
    setOpenPanels(new Set([1]));
    if (fileRef.current) fileRef.current.value = "";
    showToast("All fields cleared");
  };

  // ── Row filter parsing ───────────────────────────────────────────────────────

  const parseRowFilter = (input: string, maxRow: number): { indices: number[]; error: string } => {
    const trimmed = input.trim();
    if (!trimmed) return { indices: [], error: "" }; // empty = all rows

    // Validate format: only digits, commas, dashes, spaces
    if (!/^[\d,\-\s]+$/.test(trimmed)) {
      return { indices: [], error: "Invalid characters. Use numbers, commas, and dashes (e.g. 1-5, 8, 12-15)." };
    }

    const parts = trimmed.split(",").map((s) => s.trim()).filter(Boolean);
    const indices: Set<number> = new Set();

    for (const part of parts) {
      if (part.includes("-")) {
        const [startStr, endStr, ...rest] = part.split("-");
        if (rest.length > 0 || !startStr || !endStr) {
          return { indices: [], error: `Invalid range: "${part}". Use format like 1-5.` };
        }
        const start = parseInt(startStr, 10);
        const end = parseInt(endStr, 10);
        if (isNaN(start) || isNaN(end)) {
          return { indices: [], error: `Invalid range: "${part}".` };
        }
        if (start > end) {
          return { indices: [], error: `Invalid range: "${part}". Start must be ≤ end.` };
        }
        if (start < 1 || end > maxRow) {
          return { indices: [], error: `Range ${part} is out of bounds (1–${maxRow}).` };
        }
        for (let i = start; i <= end; i++) indices.add(i - 1); // 0-indexed
      } else {
        const num = parseInt(part, 10);
        if (isNaN(num)) {
          return { indices: [], error: `Invalid number: "${part}".` };
        }
        if (num < 1 || num > maxRow) {
          return { indices: [], error: `Row ${num} is out of bounds (1–${maxRow}).` };
        }
        indices.add(num - 1);
      }
    }

    return { indices: Array.from(indices).sort((a, b) => a - b), error: "" };
  };

  const handleRowFilterChange = (value: string) => {
    setRowFilter(value);
    if (!value.trim()) {
      setRowFilterError("");
      return;
    }
    const maxRow = uploadResult?.row_count ?? 0;
    if (maxRow === 0) {
      setRowFilterError("Upload a file first.");
      return;
    }
    const { error } = parseRowFilter(value, maxRow);
    setRowFilterError(error);
  };

  // ── Derived values ──────────────────────────────────────────────────────────

  const codebookLabels = codebook.filter((e) => e.label.trim()).map((e) => e.label);
  const visibleRows = encodedRows.slice(-5);
  const parsedFilter = uploadResult ? parseRowFilter(rowFilter, uploadResult.row_count) : { indices: [], error: "" };
  const filterActive = rowFilter.trim() !== "" && !parsedFilter.error;
  const filteredRowCount = filterActive ? parsedFilter.indices.length : (uploadResult?.row_count ?? 0);

  // ── Agreement helpers ───────────────────────────────────────────────────────
  const _metricColor = (v: number | null) => {
    if (v == null) return "";
    if (v >= 0.8) return "metric-good";
    if (v >= 0.6) return "metric-mid";
    return "metric-bad";
  };
  const _fmtMetric = (m: MetricResult) => {
    if (m.estimate == null) return "—";
    const est = m.estimate.toFixed(3);
    if (m.ci_lower != null && m.ci_upper != null) {
      return `${est} (${m.ci_lower.toFixed(2)}–${m.ci_upper.toFixed(2)})`;
    }
    return est;
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      <nav className="topbar">
        <div className="topbar-left">
          <img src="/ssel_logo.png" alt="SSELab" className="topbar-logo" />
          <div className="topbar-sep" />
          <span className="topbar-title">LLM Measurement Toolkit</span>
          <span className="topbar-badge">beta</span>
          <div className="topbar-sep" />
          <div className="topbar-tabs">
            <button className={`topbar-tab ${activeTool === "encoding" ? "active" : ""}`} onClick={() => setActiveTool("encoding")}>Encoding</button>
            <button className={`topbar-tab ${activeTool === "catgen" ? "active" : ""}`} onClick={() => setActiveTool("catgen")}>Category Generator</button>
            <button className={`topbar-tab ${activeTool === "analysis" ? "active" : ""}`} onClick={() => setActiveTool("analysis")}>Results Analysis</button>
            <button className={`topbar-tab ${activeTool === "instructions" ? "active" : ""}`} onClick={() => setActiveTool("instructions")}>Learn the Toolkit</button>
          </div>
        </div>
        <div className="topbar-right">
          <button className="btn btn-ghost btn-xs text-muted" onClick={handleReset}>Reset</button>
          <div className="status-chip">
            <span className={`status-dot ${running ? "status-running" : ""}`} />
            {running ? "Running" : "Ready"}
          </div>
        </div>
      </nav>

      <div className="layout">
        <main className="main">
          <div className={`tool-page ${activeTool === "encoding" ? "active" : ""}`}>

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
                  <div className={`panel ${openPanels.has(1) ? "open" : ""}${skipPanelAnim ? " no-animate" : ""}`}>
                    <button className="panel-head" onClick={() => togglePanel(1)}>
                      <div className="panel-head-left">
                        <span className="step-badge">1</span>
                        <span className="panel-label">Upload Dataset</span>
                        {uploadResult && <span className="tag">uploaded</span>}
                      </div>
                      <svg className="chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6l4 4 4-4" /></svg>
                    </button>
                    <div className="panel-content-wrap"><div className="panel-content"><div className="panel-content-inner">
                      <div
                        className={`dropzone${dragOver ? " drag-active" : ""}`}
                        onClick={() => fileRef.current?.click()}
                        onDrop={(e) => { setDragOver(false); onDrop(e); }}
                        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                        onDragLeave={() => setDragOver(false)}
                      >
                        <div className="dz-icon">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="28" height="28">
                            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                          </svg>
                        </div>
                        <p className="dz-text">
                          {uploading ? <><span className="spinner" /> Uploading...</> : "Drop a CSV or Excel file here, or click to browse"}
                        </p>
                      </div>
                      <input
                        ref={fileRef}
                        type="file"
                        accept=".csv,.xlsx,.xls"
                        onChange={onFileChange}
                        className="input-hidden"
                      />

                      {uploadError && <p className="enc-error">{uploadError}</p>}

                      {uploadResult && (
                        <div className="mt-12">
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
                                {uploadResult.preview.slice(0, 5).map((row, i) => (
                                  <tr key={i}>
                                    {uploadResult.columns.map((col) => (
                                      <td key={col} className="mono">{String(row[col] ?? "")}</td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {uploadResult.preview.length > 5 && (
                              <div className="table-more">Click to see all {uploadResult.preview.length} rows</div>
                            )}
                          </div>
                        </div>
                      )}
                    </div></div></div>
                  </div>

                  {/* Panel 2: Select Message Column */}
                  <div className={`panel ${openPanels.has(2) ? "open" : ""}${skipPanelAnim ? " no-animate" : ""}`}>
                    <button className="panel-head" onClick={() => togglePanel(2)}>
                      <div className="panel-head-left">
                        <span className="step-badge">2</span>
                        <span className="panel-label">Column &amp; Rows</span>
                        {messageColumn && <span className="tag">{messageColumn}</span>}
                        {filterActive && <span className="tag">{parsedFilter.indices.length} rows</span>}
                      </div>
                      <svg className="chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6l4 4 4-4" /></svg>
                    </button>
                    <div className="panel-content-wrap"><div className="panel-content"><div className="panel-content-inner">
                      {uploadResult ? (
                        <>
                          <div className="f">
                            <label>Select the column containing the text to encode</label>
                            <select value={messageColumn} onChange={(e) => setMessageColumn(e.target.value)}>
                              <option value="">— Choose column —</option>
                              {uploadResult.columns.map((col) => (
                                <option key={col} value={col}>{col}</option>
                              ))}
                            </select>
                          </div>
                          <div className="f">
                            <label>Row filter <span className="hint-inline">(optional)</span></label>
                            <input
                              type="text"
                              value={rowFilter}
                              onChange={(e) => handleRowFilterChange(e.target.value)}
                              placeholder={`e.g. 1-10, 15, 20-25  (1–${uploadResult.row_count})`}
                              className="mono-input"
                            />
                            {rowFilterError && <p className="enc-error mt-4">{rowFilterError}</p>}
                            {filterActive && (
                              <p className="hint text-accent">
                                {parsedFilter.indices.length} of {uploadResult.row_count} rows selected
                              </p>
                            )}
                            {!rowFilter.trim() && <p className="hint">Leave empty to encode all rows. Use commas and dashes: 1-5, 8, 12-15</p>}
                          </div>
                        </>
                      ) : (
                        <p className="hint">Upload a file first to see available columns.</p>
                      )}
                    </div></div></div>
                  </div>

                  {/* Panel 3: Experiment Instructions */}
                  <div className={`panel ${openPanels.has(3) ? "open" : ""}${skipPanelAnim ? " no-animate" : ""}`}>
                    <button className="panel-head" onClick={() => togglePanel(3)}>
                      <div className="panel-head-left">
                        <span className="step-badge">3</span>
                        <span className="panel-label">Experiment Instructions</span>
                        {experimentInstructions.trim() && <span className="tag">set</span>}
                      </div>
                      <svg className="chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6l4 4 4-4" /></svg>
                    </button>
                    <div className="panel-content-wrap"><div className="panel-content"><div className="panel-content-inner">
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
                    </div></div></div>
                  </div>

                  {/* Panel 4: Encoding Instructions */}
                  <div className={`panel ${openPanels.has(4) ? "open" : ""}${skipPanelAnim ? " no-animate" : ""}`}>
                    <button className="panel-head" onClick={() => togglePanel(4)}>
                      <div className="panel-head-left">
                        <span className="step-badge">4</span>
                        <span className="panel-label">Encoding Instructions</span>
                        {encodingInstructions.trim() && <span className="tag">set</span>}
                      </div>
                      <svg className="chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6l4 4 4-4" /></svg>
                    </button>
                    <div className="panel-content-wrap"><div className="panel-content"><div className="panel-content-inner">
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
                      <div className="f" style={{ marginTop: 12 }}>
                        <label>Empty message handling</label>
                        <select
                          value={emptyMessageHandling}
                          onChange={(e) => setEmptyMessageHandling(e.target.value as "error" | "ignore" | "encode")}
                        >
                          <option value="error">Flag as error</option>
                          <option value="ignore">Ignore (skip row)</option>
                          <option value="encode">Encode as value</option>
                        </select>
                        <p className="hint">
                          {emptyMessageHandling === "ignore" && "Empty rows will be skipped and excluded from output."}
                          {emptyMessageHandling === "encode" && "Variables for empty rows will be filled according to the coding instructions and codebook description."}
                          {emptyMessageHandling === "error" && "Empty rows will be flagged with an error in the output."}
                        </p>
                      </div>
                    </div></div></div>
                  </div>

                  {/* Panel 5: Codebook */}
                  <div className={`panel ${openPanels.has(5) ? "open" : ""}${skipPanelAnim ? " no-animate" : ""}`}>
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
                    <div className="panel-content-wrap"><div className="panel-content"><div className="panel-content-inner">
                      <div className="table-wrap table-clickable" onClick={() => setExpandedTable("codebook")} title="Click to expand">
                        <table className="tbl editable">
                          <thead>
                            <tr>
                              <th>Label</th>
                              <th>Type</th>
                              <th>Definition</th>
                              <th>Encoded Values</th>
                              <th className="th-narrow" />
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
                                  <TagInput
                                    value={entry.encoded_values}
                                    onChange={(v) => updateCodebook(idx, "encoded_values", v)}
                                    type={entry.type}
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
                      <p className="hint mt-8">
                        <code>binary</code>: 0/1 · <code>categorical</code>: named categories · <code>ordinal</code>: ordered scale · <code>numeric</code>: number · <code>text</code>: free text
                      </p>
                    </div></div></div>
                  </div>

                  {/* Panel 6: Models + Voting */}
                  <div className={`panel ${openPanels.has(6) ? "open" : ""}${skipPanelAnim ? " no-animate" : ""}`}>
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
                    <div className="panel-content-wrap"><div className="panel-content"><div className="panel-content-inner">

                      {/* Model slots */}
                      <div className="model-slots">
                        {modelSlots.map((slot, idx) => {
                          const provInfo = PROVIDERS.find((p) => p.value === slot.provider);
                          const modelInfo = provInfo?.models.find((m) => m.value === slot.model);
                          return (
                            <div className="model-slot" key={idx}>
                              <div className="slot-header">
                                <span className="slot-num">{idx + 1}</span>
                                <span className="slot-title">{provInfo?.label ?? slot.provider} — {modelInfo?.label ?? slot.model}</span>
                                <div className="flex-1" />
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
                                    <div className="enc-key-wrap">
                                      <input
                                        type={slot.showKey ? "text" : "password"}
                                        value={slot.apiKey}
                                        onChange={(e) => setModelSlots((prev) => prev.map((s, i) => i === idx ? { ...s, apiKey: e.target.value } : s))}
                                        placeholder="sk-..."
                                      />
                                      <button
                                        className="enc-key-toggle"
                                        onClick={() => setModelSlots((prev) => prev.map((s, i) => i === idx ? { ...s, showKey: !s.showKey } : s))}
                                        title={slot.showKey ? "Hide key" : "Show key"}
                                        type="button"
                                      >
                                        {slot.showKey ? (
                                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                                        ) : (
                                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                        )}
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <button
                        className="btn btn-ghost btn-xs mt-8"
                        onClick={() => setModelSlots((prev) => [...prev, { ...EMPTY_SLOT }])}
                      >
                        + Add Model
                      </button>

                      {/* Voting settings */}
                      <div className="enc-voting-settings">
                        <div className="enc-voting-row">
                          <div className="f voting-runs">
                            <label>Runs per model <span className="fv">{runsPerModel}×</span></label>
                            <input
                              type="range"
                              min={1}
                              max={10}
                              value={runsPerModel}
                              onChange={(e) => setRunsPerModel(Number(e.target.value))}
                            />
                          </div>
                          <div className="f voting-agg">
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
                    </div></div></div>
                  </div>

                </div>

                {/* Run bar */}
                <div className="run-bar">
                  {generateError && <span className="enc-error run-bar-error">{generateError}</span>}
                  <button
                    className="btn btn-outline btn-sm"
                    disabled={!canGenerate || generating || running}
                    onClick={handleGenerate}
                  >
                    {generating ? <><span className="spinner" /> Generating</> : "Script only"}
                  </button>
                  {running ? (
                    <button className="btn btn-sm btn-stop" onClick={handleStop}>
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
                        <span className="run-calls-hint">
                          ({modelSlots.length}×{runsPerModel})
                        </span>
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* ── Right: Results Column ── */}
              <div className="results-col">

                {/* Tab strip to switch views */}
                {(result || encodedRows.length > 0 || running || consoleLogs.length > 0) && (
                  <div className="tab-strip tab-strip-gap">
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
                {rightView === "run" && (running || encodedRows.length > 0 || runComplete || consoleLogs.length > 0) ? (
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
                      <div className="stat-row mt-12">
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
                      <div className="res-section mt-12">
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
                                  <td className="mono text-muted">{row.index + 1}</td>
                                  <td className="cell-truncate">
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
                      <div className="res-section mt-12">
                        <div className="res-section-h text-bad">Errors ({runErrors.length})</div>
                        <div className="enc-errors-body">
                          {runErrors.slice(-5).map((err, i) => (
                            <div key={i} className="enc-error-line">{err}</div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Run error */}
                    {runError && <p className="enc-error mt-12">{runError}</p>}

                    {/* Validation report & actions */}
                    {runComplete && validationReport && (
                      <div className={`enc-validation-report ${validationReport.problematicIndices.length === 0 ? "valid" : "has-issues"}`}>
                        {validationReport.problematicIndices.length === 0 ? (
                          <>
                            <div className="enc-validation-header valid">
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                              All <strong>{validationReport.totalRows}</strong> rows valid
                            </div>
                            <button className="btn btn-primary" onClick={hasRerun ? handleDownloadMerged : handleDownloadResults}>
                              Download encoded_results.csv
                            </button>
                          </>
                        ) : (
                          <>
                            <div className="enc-validation-header issues">
                              <strong>{validationReport.problematicIndices.length}</strong> of {validationReport.totalRows} rows have issues
                            </div>
                            <div className="enc-validation-summary">
                              {validationReport.errorRows > 0 && (
                                <span className="pill bad">{validationReport.errorRows} API errors</span>
                              )}
                              {validationReport.outOfRangeRows > 0 && (
                                <span className="pill mid">{validationReport.outOfRangeRows} out-of-range</span>
                              )}
                            </div>
                            <div className="enc-validation-details">
                              {validationReport.issues.slice(0, 10).map((issue, i) => (
                                <div key={i} className="enc-validation-issue">
                                  <span className="enc-vi-row">Row {issue.rowIndex + 1}</span>
                                  <span className="enc-vi-var">{issue.variable}</span>
                                  {issue.issueType === "api_error" ? (
                                    <span className="enc-vi-type">API error</span>
                                  ) : (
                                    <>
                                      <span className="enc-vi-type">{issue.issueType === "not_numeric" ? "not numeric" : "out of range"}</span>
                                      <span className="enc-vi-detail">got &ldquo;{String(issue.value)}&rdquo;, expected: {issue.expected}</span>
                                    </>
                                  )}
                                </div>
                              ))}
                              {validationReport.issues.length > 10 && (
                                <div className="enc-vi-more">...and {validationReport.issues.length - 10} more issues</div>
                              )}
                            </div>
                            <div className="enc-validation-actions">
                              <button className="btn btn-secondary" onClick={hasRerun ? handleDownloadMerged : handleDownloadResults}>
                                Download as-is
                              </button>
                              <button className="btn btn-primary" onClick={() => handleRerun(validationReport.problematicIndices)}>
                                Re-run {validationReport.problematicIndices.length} rows
                              </button>
                              <button className="btn btn-ghost" onClick={() => handleRerun(null)}>
                                Re-run all
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                    {runComplete && !validationReport && (
                      <div className="enc-complete-bar">
                        <div>Validating results...</div>
                      </div>
                    )}

                    {/* Console */}
                    {consoleLogs.length > 0 && (
                      <div className="enc-console mt-12">
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
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <rect x="3" y="3" width="7" height="7" rx="1" />
                      <rect x="14" y="3" width="7" height="7" rx="1" />
                      <rect x="3" y="14" width="7" height="7" rx="1" />
                      <rect x="14" y="14" width="7" height="7" rx="1" />
                    </svg>
                    <p>No results yet</p>
                    <span className="text-sm">Configure the left panel, then press Run Encoding</span>
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

                    <div className="res-section mb-12">
                      <div className="res-section-h">
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
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                      <path d="M14 2v6h6M10 12l-2 2 2 2M14 12l2 2-2 2" />
                    </svg>
                    <p>No script generated</p>
                    <span className="text-sm">Configure the left panel, then press Script Only</span>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
          {activeTool === "catgen" && (<CategoryGenerator providers={PROVIDERS}/>)}


          {/* ── Results Analysis Page ── */}
          <div className={`tool-page ${activeTool === "analysis" ? "active" : ""}`}>
            <div className="tool-header">
              <div>
                <h1>Results Analysis</h1>
                <p className="tool-desc">Upload rater files, configure episode matching, and compute inter-rater agreement.</p>
              </div>
            </div>

            <div className="tool-body">
              {/* Upload raters */}
              <div className="ana-section">
                <div className="ana-section-h">Upload Raters</div>
                <div className="ana-groups">
                  {/* Human coders */}
                  <div className="ana-group">
                    <div className="ana-group-head">
                      <span className="ana-group-label">Human Coders</span>
                      <select
                        className="ana-count-sel"
                        value={analysisRaters.filter((r) => r.type === "human").length}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          const cur = analysisRaters.filter((r) => r.type === "human");
                          const others = analysisRaters.filter((r) => r.type !== "human");
                          if (n > cur.length) {
                            const add = Array.from({ length: n - cur.length }, (_, i) => ({ name: `Human ${cur.length + i + 1}`, type: "human" as const, uploadResult: null, uploading: false }));
                            setAnalysisRaters([...others, ...cur, ...add]);
                          } else {
                            setAnalysisRaters([...others, ...cur.slice(0, n)]);
                          }
                          setCrossCheckResult(null); setAnalysisResults(null);
                        }}
                      >
                        {[0,1,2,3,4,5].map((n) => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </div>
                    {analysisRaters.filter((r) => r.type === "human").map((rater) => {
                      const idx = analysisRaters.indexOf(rater);
                      return (
                        <div key={idx} className="ana-rater-row">
                          <input className="ana-rater-name" value={rater.name} onChange={(e) => setAnalysisRaters((prev) => prev.map((r, i) => i === idx ? { ...r, name: e.target.value } : r))} />
                          {rater.uploadResult ? (
                            <span className="tag">{rater.uploadResult.file_name} ({rater.uploadResult.row_count} rows)</span>
                          ) : (
                            <label className="btn btn-outline btn-xs ana-upload-label">
                              <input type="file" accept=".csv,.xlsx,.xls" className="input-hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAnalysisRaterUpload(idx, f); }} />
                              {rater.uploading ? <><span className="spinner" /> Uploading</> : "Upload"}
                            </label>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* LLM results */}
                  <div className="ana-group">
                    <div className="ana-group-head">
                      <span className="ana-group-label">LLM Results</span>
                      <select
                        className="ana-count-sel"
                        value={analysisRaters.filter((r) => r.type === "llm").length}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          const cur = analysisRaters.filter((r) => r.type === "llm");
                          const others = analysisRaters.filter((r) => r.type !== "llm");
                          if (n > cur.length) {
                            const add = Array.from({ length: n - cur.length }, (_, i) => ({ name: `LLM ${cur.length + i + 1}`, type: "llm" as const, uploadResult: null, uploading: false }));
                            setAnalysisRaters([...others, ...cur, ...add]);
                          } else {
                            setAnalysisRaters([...others, ...cur.slice(0, n)]);
                          }
                          setCrossCheckResult(null); setAnalysisResults(null);
                        }}
                      >
                        {[0,1,2,3,4,5].map((n) => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </div>
                    {analysisRaters.filter((r) => r.type === "llm").map((rater) => {
                      const idx = analysisRaters.indexOf(rater);
                      return (
                        <div key={idx} className="ana-rater-row">
                          <input className="ana-rater-name" value={rater.name} onChange={(e) => setAnalysisRaters((prev) => prev.map((r, i) => i === idx ? { ...r, name: e.target.value } : r))} />
                          {rater.uploadResult ? (
                            <span className="tag">{rater.uploadResult.file_name} ({rater.uploadResult.row_count} rows)</span>
                          ) : (
                            <label className="btn btn-outline btn-xs ana-upload-label">
                              <input type="file" accept=".csv,.xlsx,.xls" className="input-hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAnalysisRaterUpload(idx, f); }} />
                              {rater.uploading ? <><span className="spinner" /> Uploading</> : "Upload"}
                            </label>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Configuration — episode columns + analysis variables */}
              {allRaterColumns.length > 0 && (
                <div className="ana-section mt-16">
                  <div className="ana-section-h">Configuration</div>
                  <div className="ana-config">
                    <div className="f">
                      <label>Episode columns (define a unique row)</label>
                      <div className="ana-col-picker">
                        {allRaterColumns.map((col) => (
                          <label key={col} className="ana-check">
                            <input type="checkbox" checked={episodeColumns.includes(col)} onChange={(e) => {
                              if (e.target.checked) { setEpisodeColumns((prev) => [...prev, col]); setAnalysisVariables((prev) => prev.filter((v) => v !== col)); }
                              else setEpisodeColumns((prev) => prev.filter((c) => c !== col));
                              setCrossCheckResult(null); setAnalysisResults(null);
                            }} />
                            {col}
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="f mt-12">
                      <label>Analysis variables</label>
                      <div className="ana-col-picker">
                        {allRaterColumns.filter((c) => !episodeColumns.includes(c)).map((col) => (
                          <label key={col} className="ana-check">
                            <input type="checkbox" checked={analysisVariables.includes(col)} onChange={(e) => {
                              if (e.target.checked) setAnalysisVariables((prev) => [...prev, col]);
                              else setAnalysisVariables((prev) => prev.filter((v) => v !== col));
                              setCrossCheckResult(null); setAnalysisResults(null);
                            }} />
                            {col}
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Cross-check + Compute */}
              {episodeColumns.length > 0 && analysisVariables.length > 0 && analysisRaters.filter((r) => r.uploadResult).length >= 2 && (
                <div className="ana-section mt-16">
                  <div className="ana-actions">
                    <button className="btn btn-outline btn-sm" disabled={analysisLoading} onClick={handleCrossCheck}>
                      {analysisLoading && !analysisResults ? <><span className="spinner" /> Checking</> : "Cross-check files"}
                    </button>
                    <button className="btn btn-primary btn-sm" disabled={analysisLoading || !crossCheckResult?.ok} onClick={handleComputeAnalysis}>
                      {analysisLoading && !crossCheckResult ? <><span className="spinner" /> Computing</> : "Compute Agreement"}
                    </button>
                  </div>

                  {analysisError && <p className="enc-error mt-8">{analysisError}</p>}

                  {/* Cross-check results */}
                  {crossCheckResult && (
                    <div className={`ana-crosscheck mt-12 ${crossCheckResult.ok ? "ok" : "fail"}`}>
                      {crossCheckResult.ok ? (
                        <>
                          <div className="ana-cc-line ok">
                            <strong>{crossCheckResult.common_episodes}</strong> episodes in common across all raters
                          </div>
                          {crossCheckResult.warnings.map((w, i) => (
                            <div key={i} className="ana-cc-line warn">{w}</div>
                          ))}
                        </>
                      ) : (
                        <>
                          {crossCheckResult.missing_columns.map((mc, i) => (
                            <div key={i} className="ana-cc-line fail">
                              {mc.rater}: {mc.error || `missing columns: ${mc.missing?.join(", ")}`}
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  )}

                  {/* Results */}
                  {analysisResults && (() => {
                    const res = analysisResults as Record<string, unknown>;
                    const sections = [
                      { key: "inter_human", label: "Inter-Human" },
                      { key: "inter_llm", label: "Inter-LLM" },
                      { key: "human_vs_llm", label: "Human vs LLM" },
                    ];
                    return (
                      <div className="ana-results mt-16">
                        <div className="ana-section-h">Overall Agreement</div>
                        <div className="ana-overall-grid">
                          {sections.map(({ key, label }) => {
                            const data = res[key] as { overall: Record<string, { estimate: number | null }> } | null;
                            if (!data) return <div key={key} className="ana-overall-card muted"><div className="ana-oc-label">{label}</div><div className="ana-oc-na">N/A (need 2+ raters)</div></div>;
                            const ov = data.overall;
                            return (
                              <div key={key} className="ana-overall-card">
                                <div className="ana-oc-label">{label}</div>
                                <div className="ana-oc-metrics">
                                  <div className="ana-oc-metric">
                                    <span className="ana-oc-val">{ov.percent_agreement?.estimate != null ? `${(ov.percent_agreement.estimate * 100).toFixed(1)}%` : "—"}</span>
                                    <span className="ana-oc-key">Agreement</span>
                                  </div>
                                  <div className="ana-oc-metric">
                                    <span className={`ana-oc-val ${_metricColor(ov.cohens_kappa?.estimate ?? null)}`}>{ov.cohens_kappa?.estimate != null ? ov.cohens_kappa.estimate.toFixed(3) : "—"}</span>
                                    <span className="ana-oc-key">Kappa</span>
                                  </div>
                                  <div className="ana-oc-metric">
                                    <span className={`ana-oc-val ${_metricColor(ov.gwets_ac1?.estimate ?? null)}`}>{ov.gwets_ac1?.estimate != null ? ov.gwets_ac1.estimate.toFixed(3) : "—"}</span>
                                    <span className="ana-oc-key">AC1</span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Details toggle */}
                        <button className="btn btn-ghost btn-xs mt-12" onClick={() => setDetailsOpen((p) => !p)}>
                          {detailsOpen ? "Hide details" : "Show details (per variable, per pair)"}
                        </button>

                        {detailsOpen && sections.map(({ key, label }) => {
                          const data = res[key] as { per_pair: Record<string, Record<string, { percent_agreement: MetricResult; cohens_kappa: MetricResult; gwets_ac1: MetricResult; n_items: number }>>; pairs: string[] } | null;
                          if (!data) return null;
                          return (
                            <div key={key} className="ana-detail-section mt-12">
                              <div className="ana-detail-label">{label}</div>
                              {data.pairs.map((pair) => (
                                <div key={pair} className="ana-detail-pair">
                                  <div className="ana-detail-pair-label">{pair}</div>
                                  <table className="tbl tbl-compact">
                                    <thead>
                                      <tr>
                                        <th>Variable</th>
                                        <th className="tc">Items</th>
                                        <th className="tc">% Agree</th>
                                        <th className="tc">Kappa</th>
                                        <th className="tc">AC1</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {analysisVariables.map((v) => {
                                        const m = data.per_pair[pair]?.[v];
                                        if (!m) return <tr key={v}><td>{v}</td><td className="tc text-muted" colSpan={4}>—</td></tr>;
                                        return (
                                          <tr key={v}>
                                            <td className="fw-600">{v}</td>
                                            <td className="tc text-muted">{m.n_items}</td>
                                            <td className="tc">{m.percent_agreement.estimate != null ? `${(m.percent_agreement.estimate * 100).toFixed(1)}%` : "—"}</td>
                                            <td className={`tc ${_metricColor(m.cohens_kappa.estimate)}`}>{_fmtMetric(m.cohens_kappa)}</td>
                                            <td className={`tc ${_metricColor(m.gwets_ac1.estimate)}`}>{_fmtMetric(m.gwets_ac1)}</td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          </div>
          {activeTool === "instructions" && (
            <Instructions onNavigate={(tool) => setActiveTool(tool)} />
          )}
        </main>
      </div>

      {/* ── Fullscreen Table Modal ── */}
      {expandedTable && (
        <div className="modal-overlay" onClick={() => setExpandedTable(null)}>
          <div className="modal modal-table" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="fw-600">
                {expandedTable === "preview" && `Dataset (${uploadResult?.preview.length ?? 0} rows)`}
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
                      <th className="th-row-num">#</th>
                      {uploadResult.columns.map((col) => (
                        <th key={col} className={col === messageColumn ? "col-msg" : ""}>{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {uploadResult.preview.map((row, i) => (
                      <tr key={i}>
                        <td className="mono text-muted">{i + 1}</td>
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
                      <th className="col-label">Label</th>
                      <th className="col-type">Type</th>
                      <th className="col-def">Definition</th>
                      <th className="col-values">Encoded Values</th>
                      <th className="th-narrow" />
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
                            className="cb-def-textarea"
                          />
                        </td>
                        <td>
                          <TagInput
                            value={entry.encoded_values}
                            onChange={(v) => updateCodebook(idx, "encoded_values", v)}
                            type={entry.type}
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
                <div className="mt-8">
                  <button className="btn btn-ghost btn-xs" onClick={addCodebookRow}>+ Add Variable</button>
                </div>
              )}

              {/* Live results table — all rows */}
              {expandedTable === "live" && encodedRows.length > 0 && (
                <table className="tbl">
                  <thead>
                    <tr>
                      <th className="th-row-num">#</th>
                      <th className="col-msg">{messageColumn || "Message"}</th>
                      {codebookLabels.map((l) => (
                        <th key={l}>{l}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {encodedRows.map((row) => (
                      <tr key={row.index}>
                        <td className="mono text-muted">{row.index + 1}</td>
                        <td>
                          {String(row.original[messageColumn] ?? "")}
                        </td>
                        {codebookLabels.map((label) => (
                          <td key={label} className="tc">
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

      <div className={`toast ${toast ? "show" : ""}`}>{toast}</div>
    </>
  );
}
