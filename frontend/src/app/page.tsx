"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import CategoryGenerator from "@/app/tools/CategoryGeneratorTool";
import Instructions, { EXAMPLE_INSTRUCTIONS, PAPER_CITATION_SHORT, ContactForm } from "@/app/tools/HowToPage";
import GuidedTour, { TourStep } from "@/app/tools/GuidedTour";
import HelpTip from "@/app/tools/HelpTip";

const CODING_TOUR_STEPS: TourStep[] = [
  // ── Section 1: Upload & map dataset ──
  {
    sectionId: "coding-panel-1", panel: 1, section: "Upload & Map Dataset",
    targetId: "tour-episode-preview", title: "Upload your dataset",
    body: (<p>Upload a CSV/Excel file with one message per row. We've loaded a small <strong>sample</strong> so you can follow along — the preview shows the original rows and, once you map columns, the merged <strong>episodes</strong>.</p>),
  },
  // ── Map Columns popup — walk each step/role ──
  {
    sectionId: "tour-map-modal", section: "Map Columns", open: "mapping", mapRole: "message",
    targetId: "tour-role-message", title: "Step 1 · Message",
    body: (<p>This popup opens right after upload. Work down the numbered steps — click a step, then click the columns below to tag them. <strong>Message</strong> (required) is the column that holds the actual message text being coded.</p>),
  },
  {
    sectionId: "tour-map-modal", section: "Map Columns", open: "mapping", mapRole: "identifier",
    targetId: "tour-role-identifier", title: "Step 2 · Episode identifier",
    body: (<p><strong>Episode identifier</strong> (required) defines what counts as one episode. Choose <em>Group rows</em> and tag the column(s) that group messages together (e.g. Session + Round) — or <em>Each row is its own episode</em>. Rows sharing the same values are merged into one episode.</p>),
  },
  {
    sectionId: "tour-map-modal", section: "Map Columns", open: "mapping", mapRole: "identity",
    targetId: "tour-role-identity", title: "Step 3 · Sender",
    body: (<p><strong>Sender</strong> (optional) is the column saying who sent each message. Tag it when you have per-sender variables or want each message labelled by speaker.</p>),
  },
  {
    sectionId: "tour-map-modal", section: "Map Columns", open: "mapping", mapRole: "order",
    targetId: "tour-role-order", title: "Step 4 · Order",
    body: (<p><strong>Order</strong> (optional) sequences messages within an episode. Tag a timestamp or turn-number column so the messages are read in the right order (ascending or descending).</p>),
  },
  {
    sectionId: "tour-map-modal", section: "Map Columns", open: "mapping", mapRole: "context",
    targetId: "tour-role-context", title: "Step 5 · Context",
    body: (<p><strong>Context</strong> (optional) tags any extra columns the model should know about (e.g. a channel or condition). You can describe what each one means so the model interprets it correctly.</p>),
  },
  {
    sectionId: "tour-map-modal", section: "Map Columns", open: "mapping",
    targetId: "tour-map-table", title: "Tagging the columns",
    body: (<p>With a step active, click a column header (or its cells) to tag it — the column highlights in that step&apos;s color. Click again to untag. Here the <strong>Message</strong> column is the Message, <strong>Session</strong> + <strong>Round</strong> are the Episode identifier, <strong>Speaker</strong> is the Sender, and <strong>Order</strong> is the Order.</p>),
  },
  {
    sectionId: "tour-map-modal", section: "Map Columns", open: "mapping",
    targetId: "tour-map-proceed", title: "Save & Proceed",
    body: (<p>Once the required steps (Message + Episode identifier) are done, click <strong>Save &amp; Proceed</strong>. Rows sharing your identifier(s) are merged into one tagged episode, shown in the preprocessed preview.</p>),
  },
  // ── Section 2: Codebook ──
  {
    sectionId: "coding-panel-2", panel: 2, section: "Codebook",
    targetId: "tour-empty-handling", title: "Empty messages",
    body: (<p>Choose what happens to rows with no text: <strong>skip the row</strong> or <strong>code it as a value</strong>.</p>),
  },
  {
    sectionId: "coding-panel-2", panel: 2, section: "Codebook",
    targetId: "tour-codebook", title: "Codebook variables",
    body: (<p>This summary lists your variables. Click it to open the full editor and define what to code.</p>),
  },
  // ── Codebook editor popup ──
  {
    sectionId: "tour-cb-editor", section: "Codebook Editor", open: "codebook",
    targetId: "tour-cb-card", title: "Variable card",
    body: (<p>Each variable is a card. Give it a <strong>label</strong>, a <strong>level</strong> (per episode or per sender), and a <strong>category definition</strong> describing what it measures.</p>),
  },
  {
    sectionId: "tour-cb-editor", section: "Codebook Editor", open: "codebook",
    targetId: "tour-cb-type", title: "Variable type",
    body: (<p>Pick the <strong>type</strong> (hover the <span aria-hidden>?</span> for details): Binary is fixed 0/1, Categorical is your named set, Numeric a number, Text free-form. Per-sender variables expand to one column per participant (e.g. <code>cooperation_P</code>).</p>),
  },
  {
    sectionId: "tour-cb-editor", section: "Codebook Editor", open: "codebook",
    targetId: "tour-cb-values", title: "Coded values",
    body: (<p>For Binary/Categorical, define <strong>every coded value</strong> — the value, its definition, and optional examples/context. This is the guidance the model uses to code each episode.</p>),
  },
  // ── Section 3: Experiment Instructions ──
  {
    sectionId: "coding-panel-3", panel: 3, section: "Experiment Instructions", media: "/tour/experiment.svg",
    title: "Experiment Instructions",
    body: (<p>Paste the full instructions participants received — tasks, roles, payoffs, and communication rules — so the model has the same context they did.</p>),
  },
  // ── Section 4: Models & Aggregation ──
  {
    sectionId: "coding-panel-4", panel: 4, section: "Models & Aggregation", media: "/tour/models.svg",
    targetId: "tour-model-slots", title: "Models & API keys", mediaBox: { x: 5, y: 19, w: 89, h: 35 },
    body: (<p>Add one or more provider + model + API key rows. Each runs independently.</p>),
  },
  {
    sectionId: "coding-panel-4", panel: 4, section: "Models & Aggregation", media: "/tour/models.svg",
    targetId: "tour-aggregation", title: "Runs & aggregation", mediaBox: { x: 5, y: 64, w: 89, h: 30 },
    body: (<p>Run each model several times and aggregate by majority vote or average across all calls.</p>),
  },
  // ── Run ──
  {
    sectionId: "coding-run-bar", section: "Run", media: "/tour/run.svg",
    title: "Run it",
    body: (<p><strong>Script only</strong> downloads a ready-to-run Python script. <strong>Run Coding</strong> validates your keys, streams results live, and flags out-of-range or failed rows for re-running.</p>),
  },
];


// ── Types ─────────────────────────────────────────────────────────────────────

// One coded value within a variable, with its own definition + optional examples/context.
interface CodedValue {
  value: string;
  definition: string;
  examples: string;   // optional
  context: string;    // optional
}
interface CodebookEntry {
  label: string;
  type: string;
  level: "episode" | "sender";   // episode = one value per episode; sender = one value per participant
  definition: string;           // definition of the variable/category itself
  values: CodedValue[];         // one definition per possible coded value
}

interface ExpandedVar { key: string; type: string; coded_values: string; }

const codedValuesOf = (e: CodebookEntry) =>
  e.values.map((v) => v.value.trim()).filter(Boolean).join(",");

// Sender-level variables expand into one output key per participant: "Var [P]".
function expandCodebook(codebook: CodebookEntry[], participants: string[]): ExpandedVar[] {
  const out: ExpandedVar[] = [];
  for (const e of codebook) {
    if (!e.label.trim()) continue;
    const cv = codedValuesOf(e);
    if (e.level === "sender" && participants.length > 0) {
      for (const p of participants) out.push({ key: `${e.label}_${p}`, type: e.type, coded_values: cv });
    } else {
      out.push({ key: e.label, type: e.type, coded_values: cv });
    }
  }
  return out;
}

interface UploadResult {
  file_id: string;
  file_name: string;
  columns: string[];
  row_count: number;
  preview: Record<string, unknown>[];
}

// Column-mapping picker
type ColRole = "message" | "identifier" | "identity" | "order" | "context";
const ROLE_META: Record<ColRole, { label: string; short: string; color: string; bg: string; hint: string }> = {
  message:    { label: "Message",         short: "MSG", color: "#2563eb", bg: "#dbeafe", hint: "Click the column that contains the message text." },
  identifier: { label: "Episode identifier", short: "ID", color: "#16a34a", bg: "#dcfce7", hint: "Click the column(s) that define one episode — e.g. session + round. Rows sharing the same combination are merged into one episode." },
  identity:   { label: "Sender",          short: "WHO", color: "#d97706", bg: "#fef3c7", hint: "Optional — click the column that says who sent each message." },
  order:      { label: "Order",           short: "ORD", color: "#7c3aed", bg: "#ede9fe", hint: "Optional — click the column that orders messages within an episode." },
  context:    { label: "Context",         short: "CTX", color: "#db2777", bg: "#fce7f3", hint: "Optional — click any extra columns the model should know about." },
};
const ROLE_ORDER: ColRole[] = ["message", "identifier", "identity", "order", "context"];



// Frontend mirror of the backend's _group_units: collapse rows sharing an
// identifier combination into one unit, tagging messages by sender and ordering
// them. Returns the original rows unchanged when no identifiers are chosen.
function buildPreprocessedRows(
  rows: Record<string, unknown>[],
  columns: string[],
  messageColumn: string,
  identifierColumns: string[],
  identityColumn: string,
  orderColumn: string,
  orderDirection: "asc" | "desc",
): Record<string, unknown>[] {
  const idCols = identifierColumns.filter((c) => columns.includes(c));
  if (idCols.length === 0 || !messageColumn) return rows;

  let work = rows.map((r, i) => ({ r, i }));
  if (orderColumn && columns.includes(orderColumn)) {
    const dir = orderDirection === "desc" ? -1 : 1;
    work = [...work].sort((a, b) => {
      const av = a.r[orderColumn], bv = b.r[orderColumn];
      const an = Number(av), bn = Number(bv);
      const cmp = (!Number.isNaN(an) && !Number.isNaN(bn) && av !== "" && bv !== "")
        ? an - bn
        : String(av ?? "").localeCompare(String(bv ?? ""));
      return cmp !== 0 ? cmp * dir : a.i - b.i; // stable tiebreak on original order
    });
  }

  const useIdentity = !!identityColumn && columns.includes(identityColumn);
  const groups = new Map<string, Record<string, unknown>[]>();
  const order: string[] = [];
  for (const { r } of work) {
    const key = idCols.map((c) => String(r[c] ?? "")).join(" ⋮ ");
    if (!groups.has(key)) { groups.set(key, []); order.push(key); }
    groups.get(key)!.push(r);
  }

  return order.map((key) => {
    const g = groups.get(key)!;
    const parts = g.map((r) => {
      const msg = r[messageColumn] == null ? "" : String(r[messageColumn]);
      const who = r[identityColumn];
      return useIdentity && who != null && String(who) !== "" ? `[${who}] ${msg}` : msg;
    });
    return { ...g[0], [messageColumn]: parts.join("\n") };
  });
}

interface GenerateResult {
  script: string;
  filename: string;
}

interface CodedRow {
  index: number;
  original: Record<string, unknown>;
  coded: Record<string, unknown>;
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

// ── Single-row validation ─────────────────────────────────────────────────────

function checkRow(
  rowIndex: number,
  coded: Record<string, unknown>,
  vars: ExpandedVar[]
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (coded._error) {
    issues.push({ rowIndex, variable: "_error", value: coded._error, expected: "", issueType: "api_error" });
    return issues;
  }

  for (const entry of vars) {
    const value = coded[entry.key];

    if (entry.coded_values.trim()) {
      const allowed = entry.coded_values.split(",").map((v) => v.trim().toLowerCase());
      const actual = String(value ?? "").trim().toLowerCase();
      if (!allowed.includes(actual)) {
        issues.push({ rowIndex, variable: entry.key, value, expected: entry.coded_values, issueType: "out_of_range" });
      }
    }

    if (entry.type === "numeric" && value != null && value !== "") {
      if (isNaN(Number(value))) {
        issues.push({ rowIndex, variable: entry.key, value, expected: "numeric value", issueType: "not_numeric" });
      }
    }
  }

  return issues;
}

function validateCodedRows(rows: CodedRow[], vars: ExpandedVar[]): ValidationReport {
  const issues: ValidationIssue[] = [];

  for (const row of rows) {
    issues.push(...checkRow(row.index, row.coded, vars));
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

// ── Providers ─────────────────────────────────────────────────────────────────

const PROVIDERS: { value: string; label: string; models: { value: string; label: string; noTemperature?: boolean }[] }[] = [
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
      { value: "deepseek-reasoner", label: "DeepSeek R1", noTemperature: true },
    ],
  },
];

const CODEBOOK_TYPES = [
  { value: "binary", label: "Binary" },
  { value: "categorical", label: "Categorical" },
  { value: "numeric", label: "Numeric" },
  { value: "text", label: "Text" },
];

// Short explanation of each type, shown in the codebook editor's help tooltip.
const TYPE_HELP = (
  <>
    <strong>Binary</strong>: two fixed outcomes, always 0/1 (e.g. absent / present).<br />
    <strong>Categorical</strong>: unordered named categories you define (e.g. P / E / N).<br />
    <strong>Numeric</strong>: a number, no fixed value list (e.g. a count or amount).<br />
    <strong>Text</strong>: free-form text output, no fixed values.
  </>
);

const EMPTY_VALUE: CodedValue = { value: "", definition: "", examples: "", context: "" };
const binaryValues = (): CodedValue[] => [
  { value: "0", definition: "", examples: "", context: "" },
  { value: "1", definition: "", examples: "", context: "" },
];
// Binary variables have fixed 0/1 values; new variables default to binary.
const newEntry = (): CodebookEntry => ({ label: "", type: "binary", level: "episode", definition: "", values: binaryValues() });
const TYPE_HAS_VALUES = (t: string) => t === "binary" || t === "categorical";

// Watermark applied to every generated PDF.
const PDF_WATERMARK_CSS = `
  .ssel-watermark{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-28deg);
    font-size:26px;font-weight:800;letter-spacing:.04em;color:#5b2d8e;opacity:.06;
    white-space:nowrap;text-align:center;line-height:1.4;z-index:0;pointer-events:none;}
  .ssel-footer{position:fixed;bottom:12px;left:0;right:0;text-align:center;
    font-size:8.5px;color:#a1a1aa;letter-spacing:.03em;pointer-events:none;}
  body>*:not(.ssel-watermark):not(.ssel-footer){position:relative;z-index:1;}
`;
const PDF_WATERMARK_HTML = `
  <div class="ssel-watermark">Social Science Experimental Laboratory<br/>New York University Abu Dhabi</div>
  <div class="ssel-footer">Generated by ChAT (Chat Annotation Toolkit) — Social Science Experimental Laboratory, New York University Abu Dhabi</div>
`;
const htmlEsc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

// Sample data used during the guided tour so the popups render populated.
const TOUR_SAMPLE_UPLOAD: UploadResult = {
  file_id: "__tour_sample__",
  file_name: "sample_conversations.csv",
  columns: ["Session", "Round", "Speaker", "Order", "Message"],
  row_count: 6,
  preview: [
    { Session: 1, Round: 1, Speaker: "P", Order: 1, Message: "Let's both choose In." },
    { Session: 1, Round: 1, Speaker: "V1", Order: 2, Message: "Sounds good, I'm in." },
    { Session: 1, Round: 1, Speaker: "P", Order: 3, Message: "Great — I'll roll." },
    { Session: 1, Round: 2, Speaker: "P", Order: 1, Message: "Same plan this round?" },
    { Session: 1, Round: 2, Speaker: "V1", Order: 2, Message: "Yes, let's do it." },
    { Session: 2, Round: 1, Speaker: "V2", Order: 1, Message: "I'll pass this time." },
  ],
};
const tourSampleCodebook = (): CodebookEntry[] => [{
  label: "cooperation",
  type: "categorical",
  level: "episode",
  definition: "Does the episode reach a cooperative agreement?",
  values: [
    { value: "yes", definition: "Both players agree to cooperate", examples: "“let's both choose In”", context: "" },
    { value: "no", definition: "No agreement is reached", examples: "", context: "" },
    { value: "mixed", definition: "Partial or ambiguous agreement", examples: "", context: "" },
  ],
}];

// ── TagInput ──────────────────────────────────────────────────────────────────

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

// ── ModelSlot type ────────────────────────────────────────────────────────────

interface ModelSlot {
  provider: string;
  model: string;
  apiKey: string;
  showKey?: boolean;
  tuningEnabled?: boolean;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
}

const EMPTY_SLOT: ModelSlot = {
  provider: "openai",
  model: "gpt-4.1-mini",
  apiKey: "",
  showKey: false,
  tuningEnabled: true,   // tuning is always on (no toggle); params always sent
  temperature: 0.2,
  topP: 1.0,
  maxTokens: 1024,
};

function modelIgnoresTemperature(provider: string, model: string): boolean {
  const provInfo = PROVIDERS.find((p) => p.value === provider);
  const modelInfo = provInfo?.models.find((m) => m.value === model);
  return modelInfo?.noTemperature === true;
}

function buildSlotPayload(slot: ModelSlot) {
  const base = {
    provider: slot.provider,
    model: slot.model,
    api_key: slot.apiKey,
  };

  if (!slot.tuningEnabled) return base;

  const noTemp = modelIgnoresTemperature(slot.provider, slot.model);

  if (slot.provider === "gemini") {
    return {
      ...base,
      generation_config: {
        ...(noTemp ? {} : { temperature: slot.temperature }),
        topP: slot.topP,
        maxOutputTokens: slot.maxTokens,
      },
    };
  }

  if (slot.provider === "deepseek") {
    return {
      ...base,
      ...(noTemp ? {} : { temperature: slot.temperature }),
      top_p: slot.topP,
      max_tokens: slot.maxTokens,
    };
  }

  return {
    ...base,
    ...(noTemp ? {} : { temperature: slot.temperature }),
    top_p: slot.topP,
    max_completion_tokens: slot.maxTokens,
  };
}


// ── Component ─────────────────────────────────────────────────────────────────

export default function Home() {
  const [activeTool, setActiveTool] = useState<"coding" | "catgen" | "analysis" | "instructions" | "contact">("coding");
  const [tourOpen, setTourOpen] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem("coding_welcome_dismissed") === "never") return;
    } catch {}
    const t = setTimeout(() => setShowWelcome(true), 600);
    return () => clearTimeout(t);
  }, []);

  const dismissWelcome = (mode: "tour" | "later" | "never" | "guide") => {
    if (mode === "never") {
      try { localStorage.setItem("coding_welcome_dismissed", "never"); } catch {}
    }
    setShowWelcome(false);
    if (mode === "tour") { startTour(); }
    else if (mode === "guide") { setActiveTool("instructions"); }
  };

  // Layout mode for the config column: fill (settings take the page),
  // side (settings as a sidebar next to results), hidden (results only).
  const [layoutMode, setLayoutMode] = useState<"fill" | "side" | "hidden">("fill");
  const collapseLayout = () => setLayoutMode((m) => (m === "fill" ? "side" : "hidden"));
  const expandLayout = () => setLayoutMode((m) => (m === "hidden" ? "side" : "fill"));

  // File upload state
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);


  // Form state
  const [messageColumn, setMessageColumn] = useState("");

  // Column mapping (full-screen picker)
  const [identifierColumns, setIdentifierColumns] = useState<string[]>([]);
  const [identityColumn, setIdentityColumn] = useState("");
  const [orderColumn, setOrderColumn] = useState("");
  const [orderDirection, setOrderDirection] = useState<"asc" | "desc">("asc");
  const [contextColumns, setContextColumns] = useState<string[]>([]);
  const [contextDescriptions, setContextDescriptions] = useState<Record<string, string>>({});
  const [rowsAsUnits, setRowsAsUnits] = useState(false); // identifier = each row is its own unit
  const [columnModalOpen, setColumnModalOpen] = useState(false);
  const [colMapError, setColMapError] = useState("");
  const [exportFormat, setExportFormat] = useState<"json" | "csv" | "txt" | "pdf" | "xlsx" | "latex">("csv");
  const [activeRole, setActiveRole] = useState<ColRole>("message");
  // Snapshots for save/discard on the two popups, and a flag guarding first hydration.
  const codebookSnapshotRef = useRef<string | null>(null);
  const mapSnapshotRef = useRef<string | null>(null);
  const hydratedRef = useRef(false);
  const [experimentInstructions, setExperimentInstructions] = useState("");
  const [codebook, setCodebook] = useState<CodebookEntry[]>([newEntry()]);
  const [participantsStr, setParticipantsStr] = useState("");
  const participants = useMemo(
    () => participantsStr.split(",").map((s) => s.trim()).filter(Boolean),
    [participantsStr],
  );
  const hasSenderVar = codebook.some((e) => e.level === "sender" && e.label.trim());
  const expandedVars = useMemo(() => expandCodebook(codebook, participants), [codebook, participants]);

  // Row filter
  const [rowFilter, setRowFilter] = useState("");
  const [rowFilterError, setRowFilterError] = useState("");

  // Model slots
  const [modelSlots, setModelSlots] = useState<ModelSlot[]>([{ ...EMPTY_SLOT }]);
  const [runsPerModel, setRunsPerModel] = useState(1);
  const [aggregation, setAggregation] = useState<"mode" | "mean">("mode");

  // Legacy aliases
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
  const [codedRows, setCodedRows] = useState<CodedRow[]>([]);
  const [runErrors, setRunErrors] = useState<string[]>([]);
  const [runComplete, setRunComplete] = useState<{ total_rows: number; coded_rows: number; file_path: string } | null>(null);
  const [runStartedAt, setRunStartedAt] = useState<string | null>(null);
  const [runFinishedAt, setRunFinishedAt] = useState<string | null>(null);
  const [runError, setRunError] = useState("");
  const wsRef = useRef<WebSocket | null>(null);
  const [validationReport, setValidationReport] = useState<ValidationReport | null>(null);
  const [hasRerun, setHasRerun] = useState(false);
  const codedRowsRef = useRef<CodedRow[]>([]);

  // Analysis state
  const [analysisRaters, setAnalysisRaters] = useState<{ name: string; type: "human" | "llm"; uploadResult: UploadResult | null; uploading: boolean }[]>([]);
  const [episodeColumns, setEpisodeColumns] = useState<string[]>([]);
  const [analysisVariables, setAnalysisVariables] = useState<string[]>([]);
  const [crossCheckResult, setCrossCheckResult] = useState<{ ok: boolean; common_episodes: number; per_rater: { name: string; total_episodes: number }[]; warnings: string[]; missing_columns: { rater: string; missing?: string[]; error?: string }[] } | null>(null);
  const [analysisResults, setAnalysisResults] = useState<Record<string, unknown> | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Console
  const [consoleLogs, setConsoleLogs] = useState<{ time: string; level: "info" | "warn" | "error"; msg: string }[]>([]);
  const consoleRef = useRef<HTMLDivElement>(null);

  const [emptyMessageHandling, setEmptyMessageHandling] = useState<"ignore" | "code">("ignore");
  const [rightView, setRightView] = useState<"script" | "run">("script");
  const [expandedTable, setExpandedTable] = useState<string | null>(null);

  // Toast
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3000);
  };

  // Panel state
  const [openPanels, setOpenPanels] = useState<Set<number>>(new Set([1]));
  const [skipPanelAnim, setSkipPanelAnim] = useState(false);

  const togglePanel = (n: number) => {
    setSkipPanelAnim(false);
    setOpenPanels((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n); else next.add(n);
      return next;
    });
  };

  const openAllPanels = () => {
    setSkipPanelAnim(true);
    setOpenPanels(new Set([1, 2, 3, 4]));
  };

  useEffect(() => { codedRowsRef.current = codedRows; }, [codedRows]);

  // ── Usage analytics (metadata only — never keys or data) ────────────────────
  // The backend sits behind the Next.js proxy, so it can't see the visitor's real
  // IP. Resolve the client's public IP once (client-side) and send it in the payload.
  const clientIpRef = useRef<string | null>(null);
  const getClientIp = async (): Promise<string> => {
    if (clientIpRef.current !== null) return clientIpRef.current;
    try {
      const r = await fetch("https://api.ipify.org?format=json");
      const j = await r.json();
      clientIpRef.current = typeof j?.ip === "string" ? j.ip : "";
    } catch { clientIpRef.current = ""; }
    return clientIpRef.current ?? "";
  };
  const trackEvent = async (event: "visit" | "run") => {
    try {
      let sid = localStorage.getItem("ssel_session_id");
      if (!sid) { sid = (crypto.randomUUID?.() ?? String(Date.now() + Math.random())); localStorage.setItem("ssel_session_id", sid); }
      const client_ip = await getClientIp();
      const body: Record<string, unknown> = { event, session_id: sid, client_ip };
      if (event === "run") {
        body.providers = modelSlots.map((s) => s.provider);
        body.models = modelSlots.map((s) => s.model);
        body.num_models = modelSlots.length;
        body.runs_per_model = runsPerModel;
        body.aggregation = aggregation;
        body.num_variables = codebook.filter((e) => e.label.trim()).length;
        body.num_rows = uploadResult?.row_count ?? 0;
        body.num_episodes = rowsAsUnits ? (uploadResult?.row_count ?? 0) : preprocessedRows.length;
        body.per_sender = codebook.some((e) => e.level === "sender");
      }
      fetch("/api/analytics/track", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive: true }).catch(() => {});
    } catch {}
  };

  // Count one visit per browser session.
  useEffect(() => {
    try { if (sessionStorage.getItem("ssel_visited")) return; sessionStorage.setItem("ssel_visited", "1"); } catch {}
    trackEvent("visit");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Persistence: keep the whole coding setup across refreshes ────────────────
  const PERSIST_KEY = "chat_coding_v1";
  // Hydrate once on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PERSIST_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s.uploadResult !== undefined) setUploadResult(s.uploadResult);
        if (typeof s.messageColumn === "string") setMessageColumn(s.messageColumn);
        if (Array.isArray(s.identifierColumns)) setIdentifierColumns(s.identifierColumns);
        if (typeof s.identityColumn === "string") setIdentityColumn(s.identityColumn);
        if (typeof s.orderColumn === "string") setOrderColumn(s.orderColumn);
        if (s.orderDirection === "asc" || s.orderDirection === "desc") setOrderDirection(s.orderDirection);
        if (Array.isArray(s.contextColumns)) setContextColumns(s.contextColumns);
        if (s.contextDescriptions && typeof s.contextDescriptions === "object") setContextDescriptions(s.contextDescriptions);
        if (typeof s.rowsAsUnits === "boolean") setRowsAsUnits(s.rowsAsUnits);
        if (s.emptyMessageHandling === "ignore" || s.emptyMessageHandling === "code") setEmptyMessageHandling(s.emptyMessageHandling);
        if (typeof s.experimentInstructions === "string") setExperimentInstructions(s.experimentInstructions);
        if (Array.isArray(s.codebook) && s.codebook.length) setCodebook(s.codebook);
        if (typeof s.participantsStr === "string") setParticipantsStr(s.participantsStr);
        // Never restore a saved API key (and discard any key left by an older build).
        if (Array.isArray(s.modelSlots) && s.modelSlots.length) setModelSlots(s.modelSlots.map((slot: ModelSlot) => ({ ...slot, apiKey: "" })));
        if (typeof s.runsPerModel === "number") setRunsPerModel(s.runsPerModel);
        if (s.aggregation === "mode" || s.aggregation === "mean") setAggregation(s.aggregation);
      }
    } catch {}
    hydratedRef.current = true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Save on any change (skip during the guided tour, which loads sample data).
  useEffect(() => {
    if (!hydratedRef.current || tourOpen) return;
    try {
      localStorage.setItem(PERSIST_KEY, JSON.stringify({
        uploadResult, messageColumn, identifierColumns, identityColumn, orderColumn, orderDirection,
        contextColumns, contextDescriptions, rowsAsUnits, emptyMessageHandling, experimentInstructions,
        codebook, participantsStr, runsPerModel, aggregation,
        // Persist model slots WITHOUT the API key — keys are never saved anywhere.
        modelSlots: modelSlots.map((s) => ({ ...s, apiKey: "" })),
      }));
    } catch {}
  }, [uploadResult, messageColumn, identifierColumns, identityColumn, orderColumn, orderDirection,
      contextColumns, contextDescriptions, rowsAsUnits, emptyMessageHandling, experimentInstructions,
      codebook, participantsStr, modelSlots, runsPerModel, aggregation, tourOpen]);

  // ── Popup save / discard ────────────────────────────────────────────────────
  const mapStateJSON = () => JSON.stringify({
    messageColumn, identifierColumns, identityColumn, orderColumn, orderDirection,
    contextColumns, contextDescriptions, rowsAsUnits,
  });
  // Snapshot each popup's state when it opens.
  useEffect(() => {
    if (columnModalOpen) { mapSnapshotRef.current = mapStateJSON(); setColMapError(""); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columnModalOpen]);
  useEffect(() => {
    if (expandedTable === "codebook") codebookSnapshotRef.current = JSON.stringify(codebook);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedTable]);

  const mapRequirementMsg = () =>
    !messageColumn ? "Tag a Message column before you proceed."
    : (!rowsAsUnits && identifierColumns.length === 0) ? "Choose an identifier — tag column(s) or pick “each row is its own episode”."
    : !sendersOk ? "Resolve the sender-name match above before you proceed."
    : "";

  const saveAndProceed = () => {
    if (!mappingComplete) { setColMapError(mapRequirementMsg() || "Select all required columns first."); return; }
    mapSnapshotRef.current = mapStateJSON();
    setColMapError("");
    setColumnModalOpen(false);
    showToast("Column mapping saved");
  };
  const closeColumnModal = () => {
    if (mapSnapshotRef.current !== null && mapStateJSON() !== mapSnapshotRef.current) {
      if (!window.confirm("Leave without saving your column mapping? Your changes will be discarded.")) return;
      try {
        const s = JSON.parse(mapSnapshotRef.current);
        setMessageColumn(s.messageColumn); setIdentifierColumns(s.identifierColumns);
        setIdentityColumn(s.identityColumn); setOrderColumn(s.orderColumn); setOrderDirection(s.orderDirection);
        setContextColumns(s.contextColumns); setContextDescriptions(s.contextDescriptions); setRowsAsUnits(s.rowsAsUnits);
      } catch {}
    }
    setColMapError("");
    setColumnModalOpen(false);
  };

  const saveCodebookEditor = () => {
    codebookSnapshotRef.current = JSON.stringify(codebook);
    setExpandedTable(null);
    showToast("Codebook saved");
  };
  const closeCodebookEditor = () => {
    if (codebookSnapshotRef.current !== null && JSON.stringify(codebook) !== codebookSnapshotRef.current) {
      if (!window.confirm("Leave without saving? Your codebook changes will be discarded.")) return;
      try { setCodebook(JSON.parse(codebookSnapshotRef.current)); } catch {}
    }
    setExpandedTable(null);
  };
  // Close the fullscreen modal, routing the codebook editor through its discard check.
  const closeExpanded = () => {
    if (expandedTable === "codebook") { closeCodebookEditor(); return; }
    setExpandedTable(null);
  };

  useEffect(() => {
    if (runComplete) setRunFinishedAt(new Date().toISOString());
    if (runComplete && codedRowsRef.current.length > 0) {
      const report = validateCodedRows(codedRowsRef.current, expandedVars);
      setValidationReport(report);
      if (report.problematicIndices.length === 0) {
        log("info", "Validation passed: all rows within expected ranges.");
      } else {
        log("warn", `Validation: ${report.problematicIndices.length} rows with issues (${report.errorRows} errors, ${report.outOfRangeRows} out-of-range).`);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runComplete]);

  // ── File upload ───────────────────────────────────────────────────────────

  // Delete the server's temp working files (uploaded dataset + results) for an
  // upload/result. Called when a file is replaced or on Reset so nothing lingers.
  const serverFilesRef = useRef<{ fileId?: string; resultPath?: string }>({});
  const cleanupServerFiles = useCallback((fileId?: string, path?: string) => {
    if (fileId === "__tour_sample__") fileId = undefined;
    if (!fileId && !path) return;
    try {
      fetch("/api/coding/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_id: fileId ?? null, path: path ?? null }),
        keepalive: true,
      }).catch(() => {});
    } catch {}
  }, []);
  useEffect(() => {
    serverFilesRef.current = { fileId: uploadResult?.file_id, resultPath: runComplete?.file_path };
  }, [uploadResult, runComplete]);

  const handleUpload = useCallback(async (file: File) => {
    // Replacing the current file — clean up the previous one on the server first.
    const prev = serverFilesRef.current;
    cleanupServerFiles(prev.fileId, prev.resultPath);
    setUploading(true);
    setUploadError("");
    setUploadResult(null);
    setMessageColumn("");
    setIdentifierColumns([]);
    setIdentityColumn("");
    setOrderColumn("");
    setOrderDirection("asc");
    setContextColumns([]);
    setContextDescriptions({});
    setRowsAsUnits(false);
    setActiveRole("message");
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/coding/upload", { method: "POST", body: formData });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(body.detail || res.statusText);
      }
      const data: UploadResult = await res.json();
      setUploadResult(data);
      setActiveRole("message");
      setColumnModalOpen(true);
      showToast(`Uploaded ${data.file_name} (${data.row_count} rows)`);
    } catch (e: unknown) {
      setUploadError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }, [cleanupServerFiles]);

  const handleStepEnter = useCallback((s: TourStep) => {
    // Open/close the relevant popup for popup steps; close popups for section steps.
    if (s.open === "mapping") { setExpandedTable(null); setColumnModalOpen(true); }
    else if (s.open === "codebook") { setColumnModalOpen(false); setExpandedTable("codebook"); }
    else { setColumnModalOpen(false); setExpandedTable(null); }
    if (s.mapRole) setActiveRole(s.mapRole as ColRole);
    if (s.panel) setOpenPanels((prev) => new Set(prev).add(s.panel as number));
  }, []);

  // Guided tour: load a sample dataset + codebook so every section and popup renders
  // populated, then restore the user's real state when the tour closes.
  const tourSnap = useRef<Record<string, unknown> | null>(null);
  const startTour = () => {
    tourSnap.current = {
      uploadResult, messageColumn, identifierColumns, identityColumn, orderColumn, orderDirection,
      rowsAsUnits, contextColumns, contextDescriptions, codebook, participantsStr,
      layoutMode, activeTool,
    };
    setUploadResult(TOUR_SAMPLE_UPLOAD);
    setMessageColumn("Message");
    setIdentifierColumns(["Session", "Round"]);
    setIdentityColumn("Speaker");
    setOrderColumn("Order"); setOrderDirection("asc");
    setRowsAsUnits(false);
    setContextColumns([]); setContextDescriptions({});
    setCodebook(tourSampleCodebook());
    setParticipantsStr("P, V1, V2");
    setColumnModalOpen(false); setExpandedTable(null);
    setActiveTool("coding");
    setTourOpen(true);
  };
  const endTour = () => {
    setTourOpen(false);
    setColumnModalOpen(false); setExpandedTable(null);
    const s = tourSnap.current;
    if (s) {
      setUploadResult(s.uploadResult as UploadResult | null);
      setMessageColumn(s.messageColumn as string);
      setIdentifierColumns(s.identifierColumns as string[]);
      setIdentityColumn(s.identityColumn as string);
      setOrderColumn(s.orderColumn as string); setOrderDirection(s.orderDirection as "asc" | "desc");
      setRowsAsUnits(s.rowsAsUnits as boolean);
      setContextColumns(s.contextColumns as string[]); setContextDescriptions(s.contextDescriptions as Record<string, string>);
      setCodebook(s.codebook as CodebookEntry[]);
      setParticipantsStr(s.participantsStr as string);
      setLayoutMode(s.layoutMode as "fill" | "side" | "hidden");
      setActiveTool(s.activeTool as "coding" | "catgen" | "analysis" | "instructions");
      tourSnap.current = null;
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleUpload(file);
  };

  // ── Column mapping picker ─────────────────────────────────────────────────

  const roleOf = (col: string): ColRole | null =>
    col === messageColumn ? "message"
    : identifierColumns.includes(col) ? "identifier"
    : col === identityColumn ? "identity"
    : col === orderColumn ? "order"
    : contextColumns.includes(col) ? "context"
    : null;

  // Assign the currently active role to a column (one column = one role).
  const clickColumn = (col: string) => {
    const current = roleOf(col);
    // Strip the column out of every role first.
    if (messageColumn === col) setMessageColumn("");
    if (identityColumn === col) setIdentityColumn("");
    if (orderColumn === col) setOrderColumn("");
    setIdentifierColumns((prev) => prev.filter((c) => c !== col));
    setContextColumns((prev) => prev.filter((c) => c !== col));

    // Clicking with the same brush it already has → just clear it (toggle off).
    if (current === activeRole) return;

    if (activeRole === "message") setMessageColumn(col);
    else if (activeRole === "identity") setIdentityColumn(col);
    else if (activeRole === "order") setOrderColumn(col);
    else if (activeRole === "identifier") { setIdentifierColumns((prev) => [...prev, col]); setRowsAsUnits(false); }
    else if (activeRole === "context") setContextColumns((prev) => [...prev, col]);

    // Guide the user along: after tagging a single-select role, jump to the next step.
    const nextStep: Partial<Record<ColRole, ColRole>> = { message: "identifier", identity: "order", order: "context" };
    if (nextStep[activeRole]) setActiveRole(nextStep[activeRole]!);
  };

  // Final preprocessed rows (grouped + tagged), mirroring the backend.
  const preprocessedRows = useMemo(
    () => uploadResult
      ? buildPreprocessedRows(uploadResult.preview, uploadResult.columns, messageColumn, identifierColumns, identityColumn, orderColumn, orderDirection)
      : [],
    [uploadResult, messageColumn, identifierColumns, identityColumn, orderColumn, orderDirection],
  );
  const isPreprocessed = identifierColumns.length > 0 && !!messageColumn;

  const downloadPreprocessed = () => {
    if (!uploadResult) return;
    const cols = uploadResult.columns;
    const esc = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [cols.map(esc).join(",")];
    for (const row of preprocessedRows) lines.push(cols.map((c) => esc(row[c])).join(","));
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const base = uploadResult.file_name.replace(/\.[^.]+$/, "");
    a.href = url; a.download = `${base}_preprocessed.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  // ── Codebook management ───────────────────────────────────────────────────

  const updateCodebook = (idx: number, field: keyof CodebookEntry, value: string) => {
    setCodebook((prev) => prev.map((entry, i) => (i === idx ? { ...entry, [field]: value } : entry)));
  };

  // Changing the type adjusts the coded values: binary → fixed 0/1; numeric/text → none.
  const changeType = (idx: number, newType: string) => {
    setCodebook((prev) => prev.map((e, i) => {
      if (i !== idx) return e;
      let values = e.values;
      if (newType === "binary") {
        const d = e.values;
        values = [
          { value: "0", definition: d[0]?.definition ?? "", examples: d[0]?.examples ?? "", context: d[0]?.context ?? "" },
          { value: "1", definition: d[1]?.definition ?? "", examples: d[1]?.examples ?? "", context: d[1]?.context ?? "" },
        ];
      } else if (newType === "numeric" || newType === "text") {
        values = [];
      } else {
        values = e.values.length ? e.values : [{ ...EMPTY_VALUE }];
      }
      return { ...e, type: newType, values };
    }));
  };

  const addCodebookRow = () => setCodebook((prev) => [...prev, newEntry()]);

  const removeCodebookRow = (idx: number) => {
    if (codebook.length <= 1) return;
    setCodebook((prev) => prev.filter((_, i) => i !== idx));
  };

  // Per-value (coded value) helpers
  const addValueRow = (idx: number) =>
    setCodebook((prev) => prev.map((e, i) => (i === idx ? { ...e, values: [...e.values, { ...EMPTY_VALUE }] } : e)));
  const removeValueRow = (idx: number, vIdx: number) =>
    setCodebook((prev) => prev.map((e, i) => (i === idx ? { ...e, values: e.values.filter((_, j) => j !== vIdx) } : e)));
  const updateValue = (idx: number, vIdx: number, field: keyof CodedValue, value: string) =>
    setCodebook((prev) => prev.map((e, i) => (i === idx
      ? { ...e, values: e.values.map((v, j) => (j === vIdx ? { ...v, [field]: value } : v)) }
      : e)));

  // ── Model slot helpers ────────────────────────────────────────────────────

  const updateSlot = (idx: number, patch: Partial<ModelSlot>) => {
    setModelSlots((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };

  // ── Script generation ─────────────────────────────────────────────────────

  // Distinct sender names found in the chosen identity column.
  const dataSenders = useMemo(() => {
    if (!uploadResult || !identityColumn) return [] as string[];
    const set = new Set<string>();
    for (const r of uploadResult.preview) {
      const v = String(r[identityColumn] ?? "").trim();
      if (v) set.add(v);
    }
    return [...set];
  }, [uploadResult, identityColumn]);
  const unknownSenders = dataSenders.filter((s) => !participants.includes(s));
  // When any variable is sender-level, the identity column must be mapped and every
  // sender in the data must be declared in the codebook's participant list.
  const sendersOk = !hasSenderVar || (!!identityColumn && participants.length > 0 && unknownSenders.length === 0);

  // Mapping is complete once a message column is set and an identifier choice is made.
  const mappingComplete =
    !!messageColumn &&
    (rowsAsUnits || identifierColumns.length > 0) &&
    sendersOk;

  const canGenerate =
    uploadResult &&
    mappingComplete &&
    experimentInstructions.trim() &&
    codebook.every((e) => e.label.trim() && e.type) &&
    (!hasSenderVar || participants.length > 0) &&
    modelSlots.length > 0 &&
    modelSlots.every((s) => s.provider && s.model && s.apiKey.trim()) &&
    !rowFilterError;

  const handleGenerate = async () => {
    if (!canGenerate || !uploadResult) return;
    setGenerating(true);
    setGenerateError("");
    setResult(null);
    setRightView("script");
    setLayoutMode((m) => (m === "fill" ? "side" : m));
    try {
      const res = await fetch("/api/coding/generate-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file_name: uploadResult.file_name,
          message_column: messageColumn,
          identifier_columns: identifierColumns,
          identity_column: identityColumn || null,
          order_column: orderColumn || null,
          order_direction: orderDirection,
          experiment_instructions: experimentInstructions,
          empty_message_handling: emptyMessageHandling,
          codebook,
          participants,
          context: contextColumns.map((c) => ({ column: c, description: contextDescriptions[c] || "" })),
          provider,
          model,
          api_key: apiKey,
          model_slots: modelSlots.map(buildSlotPayload),
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
    a.href = url; a.download = result.filename; a.click();
    URL.revokeObjectURL(url);
  };

  // ── Console ───────────────────────────────────────────────────────────────

  const log = (level: "info" | "warn" | "error", msg: string) => {
    const time = new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setConsoleLogs((prev) => [...prev, { time, level, msg }]);
    setTimeout(() => consoleRef.current?.scrollTo({ top: consoleRef.current.scrollHeight }), 50);
  };

  // ── Run coding ────────────────────────────────────────────────────────────

  const handleRun = async () => {
    if (!canGenerate || !uploadResult) return;

    setRunning(true);
    setRunProgress(null);
    setCodedRows([]);
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
    setLayoutMode((m) => (m === "fill" ? "side" : m));
    setRunStartedAt(new Date().toISOString());
    setRunFinishedAt(null);
    trackEvent("run");

    log("info", "Generating coding script...");
    try {
      const res = await fetch("/api/coding/generate-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file_name: uploadResult.file_name,
          message_column: messageColumn,
          identifier_columns: identifierColumns,
          identity_column: identityColumn || null,
          order_column: orderColumn || null,
          order_direction: orderDirection,
          experiment_instructions: experimentInstructions,
          empty_message_handling: emptyMessageHandling,
          codebook,
          participants,
          context: contextColumns.map((c) => ({ column: c, description: contextDescriptions[c] || "" })),
          provider,
          model,
          api_key: apiKey,
          model_slots: modelSlots.map(buildSlotPayload),
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

    log("info", "Validating API keys and models...");
    try {
      const valRes = await fetch("/api/coding/validate", {
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
      if (!valRes.ok) throw new Error("Validation request failed");
      const valData = await valRes.json();
      for (const r of valData.results) {
        if (r.ok) log("info", `  ${r.label} — OK`);
        else log("error", `  ${r.label} — FAILED: ${r.error}`);
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

    log("info", "Connecting to coding service...");
    const modelNames = modelSlots.map((s) => {
      const p = PROVIDERS.find((p) => p.value === s.provider);
      const m = p?.models.find((m) => m.value === s.model);
      return `${p?.label}/${m?.label}`;
    });
    log("info", `Models: ${modelNames.join(", ")} × ${runsPerModel} run${runsPerModel > 1 ? "s" : ""} each`);
    log("info", `Aggregation: ${aggregation} · File: ${uploadResult.file_name} (${uploadResult.row_count} rows)`);
    log("info", `Codebook: ${codebook.filter((e) => e.label.trim()).map((e) => e.label).join(", ")}`);

    const rawApi = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const apiBase = /^https?:\/\//.test(rawApi) ? rawApi : `https://${rawApi}`;
    const wsUrl = `${apiBase.replace(/^http/, "ws")}/api/ws/coding/run`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      log("info", "Connected. Starting coding...");
      ws.send(JSON.stringify({
        file_id: uploadResult.file_id,
        message_column: messageColumn,
        identifier_columns: identifierColumns,
        identity_column: identityColumn || null,
        order_column: orderColumn || null,
        order_direction: orderDirection,
        experiment_instructions: experimentInstructions,
        empty_message_handling: emptyMessageHandling,
        codebook,
        participants,
        context: contextColumns.map((c) => ({ column: c, description: contextDescriptions[c] || "" })),
        model_slots: modelSlots.map(buildSlotPayload),
        runs_per_model: runsPerModel,
        aggregation,
        row_indices: null,
      }));
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "progress") {
        setRunProgress({ current: msg.current, total: msg.total, percent: msg.percent });
        log("info", `Row ${msg.current}/${msg.total} (${msg.percent}%)`);
      } else if (msg.type === "row") {
        setCodedRows((prev) => [...prev, { index: msg.index, original: msg.original, coded: msg.coded }]);
        const issues = checkRow(msg.index, msg.coded, expandedVars);
        for (const issue of issues) {
          const detail = issue.issueType === "api_error"
            ? `Row ${msg.index + 1}: ${issue.value}`
            : `Row ${msg.index + 1}: ${issue.variable} ${issue.issueType === "not_numeric" ? "not numeric" : "out of range"} (got "${String(issue.value)}")`;
          setRunErrors((prev) => [...prev, detail]);
          log("warn", detail);
        }
      } else if (msg.type === "error" && msg.index !== undefined) {
        setRunErrors((prev) => [...prev, msg.message]);
        log("error", msg.message);
      } else if (msg.type === "error") {
        setRunError(msg.message);
        log("error", `Fatal: ${msg.message}`);
        setRunning(false);
      } else if (msg.type === "complete") {
        setRunComplete({ total_rows: msg.total_rows, coded_rows: msg.coded_rows, file_path: msg.file_path });
        log("info", `Coding complete. ${msg.total_rows} rows processed, ${msg.coded_rows} coded.`);
        setRunning(false);
      }
    };

    ws.onerror = () => {
      log("error", "WebSocket connection failed. Is the backend running?");
      setRunError("WebSocket connection failed");
      setRunning(false);
    };

    ws.onclose = (event) => {
      if (event.code !== 1000 && event.code !== 1005) log("warn", `WebSocket closed (code: ${event.code})`);
      setRunning(false);
    };
  };

  const handleStop = () => {
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    log("warn", "Coding stopped by user.");
    setRunning(false);
  };

  const handleDownloadResults = () => {
    if (!runComplete) return;
    window.open(`/api/coding/download?path=${encodeURIComponent(runComplete.file_path)}`, "_blank");
    showToast("Download started");
  };

  const handleDownloadMerged = () => {
    if (codedRows.length === 0) return;
    const labels = codebook.filter((e) => e.label.trim()).map((e) => e.label);
    const origCols = Object.keys(codedRows[0].original);
    const headers = [...origCols, ...labels];
    const csvRows = codedRows.map((r) => {
      return headers.map((h) => {
        const val = origCols.includes(h) ? r.original[h] : r.coded[h];
        const str = String(val ?? "");
        return str.includes(",") || str.includes('"') || str.includes("\n")
          ? `"${str.replace(/"/g, '""')}"` : str;
      }).join(",");
    });
    const csv = [headers.join(","), ...csvRows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "coded_results.csv"; a.click();
    URL.revokeObjectURL(url);
    showToast("Download started");
  };

  const handleCodebookDownload = async (format: "json" | "csv" | "txt" | "pdf" | "xlsx" | "latex") => {
    const entries = codebook.filter((e) => e.label.trim());
    const filename = `codebook`;

    // Flatten: one row per coded value. Numeric/text vars (no values) get a single blank-value row.
    const flatRows = entries.flatMap((e) => {
      const level = e.level === "sender" ? "per sender" : "per episode";
      if (e.values.length === 0) {
        return [{
          label: e.label, type: e.type, level, definition: e.definition,
          value: "", value_definition: "", examples: "", context: "",
        }];
      }
      return e.values
        .filter((v) => v.value.trim() || v.definition.trim())
        .map((v) => ({
          label: e.label, type: e.type, level, definition: e.definition,
          value: v.value, value_definition: v.definition, examples: v.examples, context: v.context,
        }));
    });

    if (format === "json") {
      const data = JSON.stringify(entries.map((e) => ({
        label: e.label,
        type: e.type,
        level: e.level,
        definition: e.definition,
        values: e.values
          .filter((v) => v.value.trim() || v.definition.trim())
          .map((v) => ({
            value: v.value,
            definition: v.definition,
            examples: v.examples || null,
            context: v.context || null,
          })),
      })), null, 2);
      downloadBlob(new Blob([data], { type: "application/json" }), `${filename}.json`);

    } else if (format === "csv") {
      const header = "label,type,level,definition,value,value_definition,examples,context";
      const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const rows = flatRows.map((r) =>
        [r.label, r.type, r.level, r.definition, r.value, r.value_definition, r.examples, r.context]
          .map(esc).join(",")
      );
      downloadBlob(new Blob([[header, ...rows].join("\n")], { type: "text/csv" }), `${filename}.csv`);

    } else if (format === "txt") {
      const lines = entries.map((e, i) => {
        const head = [
          `${i + 1}. ${e.label} (${e.type}, ${e.level === "sender" ? "per sender" : "per episode"})`,
          `   Definition: ${e.definition}`,
        ];
        const valueLines = e.values
          .filter((v) => v.value.trim() || v.definition.trim())
          .map((v) => {
            const parts = [`   - ${v.value}: ${v.definition}`];
            if (v.examples.trim()) parts.push(`       Examples: ${v.examples}`);
            if (v.context.trim()) parts.push(`       Context: ${v.context}`);
            return parts.join("\n");
          });
        return [...head, ...valueLines].join("\n");
      });
      downloadBlob(new Blob([lines.join("\n\n")], { type: "text/plain" }), `${filename}.txt`);

    } else if (format === "xlsx") {
      const XLSX = await import("xlsx");
      const rows = flatRows.map((r) => ({
        Label: r.label,
        Type: r.type,
        Level: r.level,
        "Category Definition": r.definition,
        Value: r.value,
        "Value Definition": r.value_definition,
        Examples: r.examples,
        Context: r.context,
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      ws["!cols"] = [
        { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 36 },
        { wch: 10 }, { wch: 36 }, { wch: 28 }, { wch: 28 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Codebook");
      XLSX.writeFile(wb, `${filename}.xlsx`);

    } else if (format === "pdf") {
      const sections = entries.map((e, i) => {
        const valueRows = e.values
          .filter((v) => v.value.trim() || v.definition.trim())
          .map((v) => `
            <tr class="value-row">
              <td class="value-cell">${htmlEsc(v.value)}</td>
              <td>${htmlEsc(v.definition)}</td>
              <td class="muted">${htmlEsc(v.examples) || "—"}</td>
              <td class="muted">${htmlEsc(v.context) || "—"}</td>
            </tr>`).join("");

        return `
          <div class="var-block">
            <div class="var-head">
              <span class="var-num">${i + 1}</span>
              <span class="var-label">${htmlEsc(e.label)}</span>
              <span class="var-meta">${htmlEsc(e.type)} · ${e.level === "sender" ? "per sender" : "per episode"}</span>
            </div>
            <p class="var-def">${htmlEsc(e.definition)}</p>
            ${valueRows ? `
              <table class="value-table">
                <thead><tr><th>Value</th><th>Definition</th><th>Examples</th><th>Context</th></tr></thead>
                <tbody>${valueRows}</tbody>
              </table>` : `<p class="muted">No fixed values (numeric/free text).</p>`}
          </div>`;
      }).join("");

      const html = `<!DOCTYPE html>
  <html><head><meta charset="utf-8"><title>Codebook</title>
  <style>
    body{font-family:-apple-system,sans-serif;padding:40px;color:#18181b;font-size:13px}
    h1{font-size:18px;font-weight:600;margin-bottom:4px}
    p{color:#71717a;margin-bottom:24px;font-size:12px}
    .var-block{margin-bottom:22px;page-break-inside:avoid}
    .var-head{display:flex;align-items:center;gap:8px;margin-bottom:4px}
    .var-num{color:#a1a1aa;font-size:11px}
    .var-label{font-weight:600;font-size:14px}
    .var-meta{color:#7c4dab;font-size:11px;text-transform:uppercase;letter-spacing:.03em}
    .var-def{color:#3f3f46;font-size:12px;margin:0 0 8px;font-style:italic}
    .value-table{width:100%;border-collapse:collapse;margin-top:4px}
    .value-table th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.05em;
      color:#a1a1aa;border-bottom:2px solid #e4e4e7;padding:5px 8px}
    .value-table td{padding:6px 8px;border-bottom:1px solid #f4f4f5;vertical-align:top;font-size:12px}
    .value-cell{font-family:monospace;color:#7c4dab;font-weight:600;width:60px}
    .muted{color:#a1a1aa;font-size:11px}
    @media print{body{padding:20px}}
    ${PDF_WATERMARK_CSS}
  </style></head>
  <body>
    ${PDF_WATERMARK_HTML}
    <h1>Codebook</h1>
    <p>Generated ${new Date().toLocaleDateString()} · ${entries.length} variable${entries.length !== 1 ? "s" : ""}</p>
    ${sections}
  </body></html>`;

      const win = window.open("", "_blank");
      if (win) {
        win.document.write(html);
        win.document.close();
        win.print();
      }

    } else if (format === "latex") {
      const esc = (s: string) => String(s ?? "")
        .replace(/\\/g, "\\textbackslash{}")
        .replace(/([&%$#_{}])/g, "\\$1")
        .replace(/~/g, "\\textasciitilde{}")
        .replace(/\^/g, "\\textasciicircum{}")
        .replace(/—/g, "---").replace(/–/g, "--")
        .replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
      const DASH = "---";
      const blocks = entries.map((e) => {
        const meta = `${e.type}, ${e.level === "sender" ? "per sender" : "per episode"}`;
        const header = `\\multicolumn{3}{@{}l}{\\textbf{${esc(e.label)}} \\quad \\textit{(${esc(meta)})}} \\\\`;
        const def = e.definition.trim() ? `\\multicolumn{3}{@{}p{\\linewidth}}{${esc(e.definition)}} \\\\` : "";
        const vals = e.values.filter((v) => v.value.trim() || v.definition.trim());
        let rows: string;
        if (vals.length === 0) {
          const kind = e.type === "numeric" ? "numeric --- free number" : "free text";
          rows = `\\multicolumn{3}{@{}l}{\\quad \\textit{(${kind}, no fixed values)}} \\\\`;
        } else {
          rows = vals.map((v) => {
            const notes = [
              v.examples.trim() ? `e.g.\\ ${esc(v.examples)}` : "",
              v.context.trim() ? esc(v.context) : "",
            ].filter(Boolean).join("; ") || DASH;
            return `${esc(v.value) || DASH} & ${esc(v.definition) || DASH} & ${notes} \\\\`;
          }).join("\n");
        }
        return [header, def, "\\addlinespace[2pt]", rows].filter(Boolean).join("\n");
      }).join("\n\\midrule\n");

      const tex = `% Codebook — generated by ChAT (Chat Annotation Toolkit)
% Requires in your preamble: \\usepackage{booktabs}
\\begin{table}[htbp]
\\centering
\\caption{Coding codebook}
\\label{tab:codebook}
\\footnotesize
\\begin{tabular}{@{}l p{6cm} p{3.6cm}@{}}
\\toprule
\\textbf{Value} & \\textbf{Definition} & \\textbf{Examples / context} \\\\
\\midrule
${blocks}
\\bottomrule
\\end{tabular}
\\end{table}
`;
      downloadBlob(new Blob([tex], { type: "application/x-tex" }), `${filename}.tex`);
    }

    showToast(`Codebook exported as .${format}`);
  };

  // Helper used by handleCodebookDownload
  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  // ── Run summary (printable PDF) ─────────────────────────────────────────────
  const handleRunSummary = () => {
    if (!uploadResult || !runComplete) return;
    const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "—");
    let duration = "—";
    if (runStartedAt && runFinishedAt) {
      const ms = new Date(runFinishedAt).getTime() - new Date(runStartedAt).getTime();
      const s = Math.max(0, Math.round(ms / 1000));
      duration = s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
    }
    const totalCalls = modelSlots.length * runsPerModel;
    const episodeCount = rowsAsUnits ? uploadResult.row_count : preprocessedRows.length;
    const errs = runErrors.length;
    const rowsHtml = (arr: string[]) => arr.join("");

    const modelRows = modelSlots.map((s, i) => {
      const p = PROVIDERS.find((pp) => pp.value === s.provider);
      const m = p?.models.find((mm) => mm.value === s.model);
      const noTemp = modelIgnoresTemperature(s.provider, s.model);
      return `<tr><td>${i + 1}</td><td>${htmlEsc(p?.label ?? s.provider)}</td><td>${htmlEsc(m?.label ?? s.model)}</td>
        <td>${noTemp ? "n/a" : (s.temperature ?? 0.2)}</td><td>${s.topP ?? 1.0}</td><td>${s.maxTokens ?? 1024}</td></tr>`;
    });
    const cbRows = codebook.filter((e) => e.label.trim()).map((e) => {
      const vals = TYPE_HAS_VALUES(e.type) ? e.values.filter((v) => v.value.trim()).map((v) => v.value).join(", ") : "—";
      return `<tr><td>${htmlEsc(e.label)}</td><td>${htmlEsc(e.type)}</td><td>${e.level === "sender" ? "per sender" : "per episode"}</td><td>${htmlEsc(vals)}</td></tr>`;
    });

    const kv = (k: string, v: string) => `<tr><td class="k">${k}</td><td>${v}</td></tr>`;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Run Summary</title>
<style>
  body{font-family:-apple-system,Segoe UI,sans-serif;padding:40px;color:#18181b;font-size:12.5px}
  h1{font-size:19px;font-weight:700;margin-bottom:2px}
  .sub{color:#71717a;font-size:11px;margin-bottom:20px}
  h2{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#7c4dab;margin:18px 0 6px;border-bottom:1px solid #e4e4e7;padding-bottom:3px}
  table{width:100%;border-collapse:collapse;margin-bottom:6px}
  td,th{padding:4px 8px;border-bottom:1px solid #f1f1f4;text-align:left;vertical-align:top}
  th{font-size:9.5px;text-transform:uppercase;letter-spacing:.04em;color:#a1a1aa}
  td.k{color:#71717a;width:180px}
  .pill{display:inline-block;padding:1px 7px;border-radius:10px;background:#f3eef8;color:#5b2d8e;font-weight:600;font-size:11px}
  @media print{body{padding:24px}}
  ${PDF_WATERMARK_CSS}
</style></head><body>
${PDF_WATERMARK_HTML}
<h1>LLM Coding — Run Summary</h1>
<div class="sub">Generated ${new Date().toLocaleString()}</div>

<h2>Run</h2>
<table>
  ${kv("Started", fmt(runStartedAt))}
  ${kv("Finished", fmt(runFinishedAt))}
  ${kv("Duration", duration)}
  ${kv("Episodes coded", `${runComplete.coded_rows} of ${runComplete.total_rows}`)}
  ${kv("Errors", errs > 0 ? `<span class="pill" style="background:#fee2e2;color:#b91c1c">${errs}</span>` : "0")}
  ${kv("API calls", `${modelSlots.length} model${modelSlots.length !== 1 ? "s" : ""} × ${runsPerModel} run${runsPerModel !== 1 ? "s" : ""} = ${totalCalls} per episode`)}
  ${kv("Aggregation", aggregation === "mode" ? "Majority vote (mode)" : "Average (mean)")}
</table>

<h2>Dataset</h2>
<table>
  ${kv("File", htmlEsc(uploadResult.file_name))}
  ${kv("Rows (messages)", String(uploadResult.row_count))}
  ${kv("Episodes", String(episodeCount))}
  ${kv("Columns", htmlEsc(uploadResult.columns.join(", ")))}
</table>

<h2>Column mapping</h2>
<table>
  ${kv("Message", htmlEsc(messageColumn || "—"))}
  ${kv("Identifier(s)", rowsAsUnits ? "each row is its own episode" : htmlEsc(identifierColumns.join(" + ") || "—"))}
  ${kv("Sender identity", htmlEsc(identityColumn || "none"))}
  ${kv("Order", orderColumn ? `${htmlEsc(orderColumn)} (${orderDirection})` : "file order")}
  ${kv("Context columns", htmlEsc(contextColumns.join(", ") || "none"))}
</table>

<h2>Models &amp; configuration</h2>
<table>
  <thead><tr><th>#</th><th>Provider</th><th>Model</th><th>Temp</th><th>Top-p</th><th>Max tokens</th></tr></thead>
  <tbody>${rowsHtml(modelRows)}</tbody>
</table>

<h2>Codebook (${codebook.filter((e) => e.label.trim()).length} variable${codebook.filter((e) => e.label.trim()).length !== 1 ? "s" : ""})</h2>
<table>
  <thead><tr><th>Label</th><th>Type</th><th>Level</th><th>Values</th></tr></thead>
  <tbody>${rowsHtml(cbRows)}</tbody>
</table>
</body></html>`;

    const win = window.open("", "_blank");
    if (win) { win.document.write(html); win.document.close(); win.print(); }
    showToast("Run summary opened — save as PDF from the print dialog");
  };

  // ── Analysis handlers ─────────────────────────────────────────────────────

  const handleAnalysisRaterUpload = async (idx: number, file: File) => {
    setAnalysisRaters((prev) => prev.map((r, i) => i === idx ? { ...r, uploading: true } : r));
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/coding/upload", { method: "POST", body: formData });
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
      setCodedRows([]);
      setHasRerun(false);
      log("info", "Re-running all rows from scratch...");
    }

    const rawApi = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const apiBase = /^https?:\/\//.test(rawApi) ? rawApi : `https://${rawApi}`;
    const wsUrl = `${apiBase.replace(/^http/, "ws")}/api/ws/coding/run`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      log("info", "Connected. Starting re-coding...");
      ws.send(JSON.stringify({
        file_id: uploadResult.file_id,
        message_column: messageColumn,
        identifier_columns: identifierColumns,
        identity_column: identityColumn || null,
        order_column: orderColumn || null,
        order_direction: orderDirection,
        experiment_instructions: experimentInstructions,
        empty_message_handling: emptyMessageHandling,
        codebook,
        participants,
        context: contextColumns.map((c) => ({ column: c, description: contextDescriptions[c] || "" })),
        model_slots: modelSlots.map(buildSlotPayload),
        runs_per_model: runsPerModel,
        aggregation,
        row_indices: indices,
      }));
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "progress") {
        setRunProgress({ current: msg.current, total: msg.total, percent: msg.percent });
        log("info", `Row ${msg.current}/${msg.total} (${msg.percent}%)`);
      } else if (msg.type === "row") {
        if (indices) {
          setCodedRows((prev) => prev.map((r) =>
            r.index === msg.index ? { index: msg.index, original: msg.original, coded: msg.coded } : r
          ));
        } else {
          setCodedRows((prev) => [...prev, { index: msg.index, original: msg.original, coded: msg.coded }]);
        }
        const issues = checkRow(msg.index, msg.coded, expandedVars);
        for (const issue of issues) {
          const detail = issue.issueType === "api_error"
            ? `Row ${msg.index + 1}: ${issue.value}`
            : `Row ${msg.index + 1}: ${issue.variable} ${issue.issueType === "not_numeric" ? "not numeric" : "out of range"} (got "${String(issue.value)}")`;
          setRunErrors((prev) => [...prev, detail]);
          log("warn", detail);
        }
      } else if (msg.type === "error" && msg.index !== undefined) {
        setRunErrors((prev) => [...prev, msg.message]);
        log("error", msg.message);
      } else if (msg.type === "error") {
        setRunError(msg.message);
        log("error", `Fatal: ${msg.message}`);
        setRunning(false);
      } else if (msg.type === "complete") {
        setRunComplete({ total_rows: msg.total_rows, coded_rows: msg.coded_rows, file_path: msg.file_path });
        log("info", `Re-coding complete. ${msg.total_rows} rows processed, ${msg.coded_rows} coded.`);
        setRunning(false);
      }
    };

    ws.onerror = () => {
      log("error", "WebSocket connection failed.");
      setRunError("WebSocket connection failed");
      setRunning(false);
    };

    ws.onclose = (event) => {
      if (event.code !== 1000 && event.code !== 1005) log("warn", `WebSocket closed (code: ${event.code})`);
      setRunning(false);
    };
  };

  // ── Reset ─────────────────────────────────────────────────────────────────

  const handleReset = () => {
    if (!window.confirm("Reset everything and clear all saved fields? This cannot be undone.")) return;
    cleanupServerFiles(uploadResult?.file_id, runComplete?.file_path);
    try { localStorage.removeItem(PERSIST_KEY); } catch {}
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    setUploadResult(null); setUploading(false); setUploadError(""); setDragOver(false);
    setMessageColumn(""); setExperimentInstructions("");
    setIdentifierColumns([]); setIdentityColumn(""); setOrderColumn(""); setOrderDirection("asc");
    setContextColumns([]); setContextDescriptions({}); setRowsAsUnits(false); setEmptyMessageHandling("ignore");
    setCodebook([newEntry()]); setParticipantsStr(""); setRowFilter(""); setRowFilterError("");
    setModelSlots([{ ...EMPTY_SLOT }]); setRunsPerModel(1); setAggregation("mode");
    setGenerating(false); setGenerateError(""); setResult(null);
    setRunning(false); setRunProgress(null); setCodedRows([]); setRunErrors([]);
    setRunComplete(null); setRunError(""); setValidationReport(null); setHasRerun(false);
    setAnalysisRaters([]); setAnalysisResults(null); setAnalysisError("");
    setCrossCheckResult(null); setEpisodeColumns([]); setAnalysisVariables([]);
    setConsoleLogs([]); setRightView("script"); setExpandedTable(null);
    setOpenPanels(new Set([1]));
    if (fileRef.current) fileRef.current.value = "";
    showToast("All fields cleared");
  };

  // ── Row filter ────────────────────────────────────────────────────────────

  const parseRowFilter = (input: string, maxRow: number): { indices: number[]; error: string } => {
    const trimmed = input.trim();
    if (!trimmed) return { indices: [], error: "" };
    if (!/^[\d,\-\s]+$/.test(trimmed)) return { indices: [], error: "Invalid characters. Use numbers, commas, and dashes (e.g. 1-5, 8, 12-15)." };
    const parts = trimmed.split(",").map((s) => s.trim()).filter(Boolean);
    const indices: Set<number> = new Set();
    for (const part of parts) {
      if (part.includes("-")) {
        const [startStr, endStr, ...rest] = part.split("-");
        if (rest.length > 0 || !startStr || !endStr) return { indices: [], error: `Invalid range: "${part}". Use format like 1-5.` };
        const start = parseInt(startStr, 10); const end = parseInt(endStr, 10);
        if (isNaN(start) || isNaN(end)) return { indices: [], error: `Invalid range: "${part}".` };
        if (start > end) return { indices: [], error: `Invalid range: "${part}". Start must be ≤ end.` };
        if (start < 1 || end > maxRow) return { indices: [], error: `Range ${part} is out of bounds (1–${maxRow}).` };
        for (let i = start; i <= end; i++) indices.add(i - 1);
      } else {
        const num = parseInt(part, 10);
        if (isNaN(num)) return { indices: [], error: `Invalid number: "${part}".` };
        if (num < 1 || num > maxRow) return { indices: [], error: `Row ${num} is out of bounds (1–${maxRow}).` };
        indices.add(num - 1);
      }
    }
    return { indices: Array.from(indices).sort((a, b) => a - b), error: "" };
  };

  const handleRowFilterChange = (value: string) => {
    setRowFilter(value);
    if (!value.trim()) { setRowFilterError(""); return; }
    const maxRow = uploadResult?.row_count ?? 0;
    if (maxRow === 0) { setRowFilterError("Upload a file first."); return; }
    const { error } = parseRowFilter(value, maxRow);
    setRowFilterError(error);
  };

  // ── Derived values ────────────────────────────────────────────────────────

  const codebookLabels = expandedVars.map((v) => v.key);
  const visibleRows = codedRows.slice(-5);
  const parsedFilter = uploadResult ? parseRowFilter(rowFilter, uploadResult.row_count) : { indices: [], error: "" };
  const filterActive = rowFilter.trim() !== "" && !parsedFilter.error;

  // ── Agreement helpers ─────────────────────────────────────────────────────

  const _metricColor = (v: number | null) => {
    if (v == null) return "";
    if (v >= 0.8) return "metric-good";
    if (v >= 0.6) return "metric-mid";
    return "metric-bad";
  };
  const _fmtMetric = (m: MetricResult) => {
    if (m.estimate == null) return "—";
    const est = m.estimate.toFixed(3);
    if (m.ci_lower != null && m.ci_upper != null) return `${est} (${m.ci_lower.toFixed(2)}–${m.ci_upper.toFixed(2)})`;
    return est;
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <nav className="topbar">
        <div className="topbar-left">
          <img src="/ssel_logo.png" alt="SSELab" className="topbar-logo" />
          <div className="topbar-sep" />
          <span
            className="topbar-title topbar-title-link"
            onClick={() => setActiveTool("coding")}
            role="button" tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setActiveTool("coding"); }}
          >
            ChAT — Chat Annotation Toolkit
          </span>
          <span className="topbar-badge">beta</span>
          <div className="topbar-sep" />
          <div className="topbar-tabs">
            <button className={`topbar-tab ${activeTool === "coding" ? "active" : ""}`} onClick={() => setActiveTool("coding")}>Coding</button>
            <button className={`topbar-tab ${activeTool === "instructions" ? "active" : ""}`} onClick={() => setActiveTool("instructions")}>Learn ChAT</button>
            <button className={`topbar-tab ${activeTool === "contact" ? "active" : ""}`} onClick={() => setActiveTool("contact")}>Contact Us</button>
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
          <div className={`tool-page ${activeTool === "coding" ? "active" : ""}`}>
            <div className="tool-header">
              <div>
                <h1>LLM Coding</h1>
                <p className="tool-desc">Upload data, configure codebook variables, and code with one or more LLMs.</p>
                <div className="episode-def">
                  <span className="episode-def-term">Communication episode:</span>
                  <span className="episode-def-text"> the unit of analysis — a combination of messages exchanged through the same channel, or a collection of messages sent by one sender. Rows that share your chosen identifier(s) are merged into one episode.</span>
                </div>
              </div>
              <button className="tour-help-btn" onClick={startTour} title="Guided walkthrough" aria-label="Start guided walkthrough">
                <span className="tour-help-icon">?</span>

              </button>
            </div>

            <div className={`pipeline-layout split layout-${layoutMode}`} style={{ display: "flex", gap: 0 }}>
              {/* ── Left: Config Column ── */}
              <div
                className="config-col"
                style={{
                  width: tourOpen ? "50vw" : layoutMode === "hidden" ? 0 : layoutMode === "side" ? "clamp(340px, 40%, 560px)" : "calc(100% - 56px)",
                  minWidth: 0,
                  borderRight: layoutMode === "hidden" && !tourOpen ? "none" : undefined,
                }}
              >
                <div className="config-scroll">

                  {/* Panel 1: Upload Dataset */}
                  <div id="coding-panel-1" className={`panel ${openPanels.has(1) ? "open" : ""}${skipPanelAnim ? " no-animate" : ""}`}>
                    <button className="panel-head" onClick={() => togglePanel(1)}>
                      <div className="panel-head-left">
                        <span className="step-badge">1</span>
                        <span className="panel-label">Upload Dataset</span>
                        <HelpTip text="Upload a CSV or Excel file. Include an ID column and the column containing the text to code." />
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
                      <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" onChange={onFileChange} className="input-hidden" />
                      {uploadError && <p className="enc-error">{uploadError}</p>}
                      {uploadResult && (
                        <div className="mt-12" id="tour-episode-preview">
                          <div className="file-chip">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" /></svg>
                            {uploadResult.file_name}
                            <span className="chip-meta">{uploadResult.row_count} rows · {uploadResult.columns.length} cols</span>
                          </div>
                          {/* Mapping recap + open the highlighting popup */}
                          <div className="colmap-recap">
                            <div className="colmap-recap-roles">
                              <span className="recap-item"><span className="role-dot" style={{ background: ROLE_META.message.color }} />Message: <b>{messageColumn || "—"}</b></span>
                              <span className="recap-item"><span className="role-dot" style={{ background: ROLE_META.identifier.color }} />Identifier: <b>{rowsAsUnits ? "each row = episode" : (identifierColumns.join(" + ") || "—")}</b></span>
                              <span className="recap-item"><span className="role-dot" style={{ background: ROLE_META.identity.color }} />Sender: <b>{identityColumn || "none"}</b></span>
                              <span className="recap-item"><span className="role-dot" style={{ background: ROLE_META.order.color }} />Order: <b>{orderColumn ? `${orderColumn} (${orderDirection})` : "file order"}</b></span>
                            </div>
                            <div className="colmap-recap-foot">
                              <button className="btn btn-outline btn-sm" onClick={() => setColumnModalOpen(true)}>
                                {messageColumn ? "Edit column mapping" : "Map columns"}
                              </button>
                              {!mappingComplete && <span className="recap-warn">⚠ Mapping incomplete — finish it to continue.</span>}
                            </div>
                          </div>

                          {/* Original table */}
                          <div className="ds-table-label">
                            <span className="ds-badge ds-badge-orig">Original</span>
                            <span className="ds-table-cap">As uploaded — {uploadResult.row_count} rows</span>
                          </div>
                          <div className="table-wrap table-mini table-clickable" onClick={() => setExpandedTable("preview")} title="Click to expand">
                            <table className="tbl tbl-compact">
                              <thead><tr>{uploadResult.columns.map((col) => {
                                const role = roleOf(col);
                                return <th key={col} style={role ? { borderTop: `3px solid ${ROLE_META[role].color}` } : undefined}>{col}</th>;
                              })}</tr></thead>
                              <tbody>
                                {uploadResult.preview.slice(0, 5).map((row, i) => (
                                  <tr key={i}>{uploadResult.columns.map((col) => <td key={col} className="mono">{String(row[col] ?? "")}</td>)}</tr>
                                ))}
                              </tbody>
                            </table>
                            {uploadResult.preview.length > 5 && <div className="table-more">Click to see all {uploadResult.preview.length} rows</div>}
                          </div>

                          {isPreprocessed && (
                            <div className="mt-12">
                              <div className="ds-table-label">
                                <span className="ds-badge ds-badge-final">Preprocessed</span>
                                <span className="ds-table-cap">What the models will code — {preprocessedRows.length} merged episode{preprocessedRows.length !== 1 ? "s" : ""}</span>
                                <button className="btn btn-ghost btn-xs ds-dl-btn" onClick={downloadPreprocessed}>↓ Download CSV</button>
                              </div>
                              <div className="table-wrap table-mini">
                                <table className="tbl tbl-compact">
                                  <thead><tr>{uploadResult.columns.map((col) => <th key={col} className={col === messageColumn ? "col-msg" : ""}>{col}</th>)}</tr></thead>
                                  <tbody>
                                    {preprocessedRows.slice(0, 5).map((row, i) => (
                                      <tr key={i}>{uploadResult.columns.map((col) => <td key={col} className="mono ds-pre-cell">{String(row[col] ?? "")}</td>)}</tr>
                                    ))}
                                  </tbody>
                                </table>
                                {preprocessedRows.length > 5 && <div className="table-more">{preprocessedRows.length} episodes total</div>}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div></div></div>
                  </div>

                  {/* Panel 2: Codebook */}
                  <div id="coding-panel-2" className={`panel ${openPanels.has(2) ? "open" : ""}${skipPanelAnim ? " no-animate" : ""}`}>
                    <button className="panel-head" onClick={() => togglePanel(2)}>
                      <div className="panel-head-left">
                        <span className="step-badge">2</span>
                        <span className="panel-label">Codebook</span>
                        <HelpTip text="Define each variable to code: its type, level, a definition for the category, and a definition for every coded value (with optional examples and context)." />
                        {codebook.some((e) => e.label.trim()) && (
                          <span className="tag">{codebook.filter((e) => e.label.trim()).length} var{codebook.filter((e) => e.label.trim()).length !== 1 ? "s" : ""}</span>
                        )}
                      </div>
                      <svg className="chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6l4 4 4-4" /></svg>
                    </button>
                    <div className="panel-content-wrap"><div className="panel-content"><div className="panel-content-inner">
                      <div className="f" id="tour-empty-handling">
                        <label>Empty message handling</label>
                        <select value={emptyMessageHandling} onChange={(e) => setEmptyMessageHandling(e.target.value as "ignore" | "code")}>
                          <option value="ignore">Ignore (skip row)</option>
                          <option value="code">Code as value</option>
                        </select>
                        <p className="hint">
                          {emptyMessageHandling === "ignore" && "Empty rows will be skipped and excluded from output."}
                          {emptyMessageHandling === "code" && "Variables for empty rows will be coded from the codebook definitions."}
                        </p>
                      </div>
                      <div className="f" id="tour-codebook" style={{ marginTop: 12 }}>
                        <label>Codebook variables</label>
                        <div className="cb-summary" onClick={() => setExpandedTable("codebook")} title="Click to edit the codebook">
                          {codebook.filter((e) => e.label.trim()).length === 0 ? (
                            <p className="hint" style={{ margin: 0 }}>No variables yet — click to define your codebook.</p>
                          ) : (
                            codebook.map((e, i) => e.label.trim() ? (
                              <div className="cb-sum-row" key={i}>
                                <span className="cb-sum-label">{e.label}</span>
                                <span className="cb-sum-meta">{e.type} · {e.level === "sender" ? "per sender" : "per episode"}</span>
                                <span className="cb-sum-vals">{
                                  e.type === "numeric" ? "number"
                                  : e.type === "text" ? "free text"
                                  : (e.values.filter((v) => v.value.trim()).map((v) => v.value).join(", ") || "—")
                                }</span>
                              </div>
                            ) : null)
                          )}
                          <div className="cb-sum-edit">Click to edit codebook →</div>
                        </div>
                        <p className="hint mt-8">Each variable gets a <strong>definition</strong> for the category and a definition for every coded value, plus optional <strong>examples</strong> and <strong>context</strong>. <strong>Per episode</strong> = one value per episode; <strong>per sender</strong> = one per participant.</p>
                        {hasSenderVar && (
                          <div className="f participants-block">
                            <label>Participants / senders <span className="fv">{participants.length} {participants.length === 1 ? "sender" : "senders"}</span></label>
                            <TagInput value={participantsStr} onChange={setParticipantsStr} type="text" />
                            <p className="hint">Sender-level variables are coded once per participant. These names must match the values in your sender-identity column.</p>
                          </div>
                        )}
                      </div>
                      <button className="btn btn-ghost btn-xs" onClick={addCodebookRow}>
                        + Add Variable
                      </button>

                      {/* ── Codebook export ── */}
                      <div className="cb-export-block">
                        <div className="cb-export-divider" />
                        <div className="cb-export-row">
                          <span className="cb-export-title">Export codebook</span>
                          <div className="cb-export-formats">
                            {(["json", "csv", "txt", "pdf", "xlsx", "latex"] as const).map((fmt) => (
                              <button
                                key={fmt}
                                className={`cb-fmt ${exportFormat === fmt ? "active" : ""}`}
                                onClick={() => setExportFormat(fmt)}
                                title={fmt === "latex" ? "LaTeX table" : `.${fmt}`}
                              >
                                {fmt === "latex" ? "LaTeX" : fmt.toUpperCase()}
                              </button>
                            ))}
                          </div>
                          <button
                            className="btn-export"
                            onClick={() => handleCodebookDownload(exportFormat)}
                            disabled={!codebook.some((e) => e.label.trim())}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                            </svg>
                            Export
                          </button>
                        </div>
                      </div>
                    </div></div></div>
                  </div>

                  {/* Panel 3: Experiment Instructions */}
                  <div id="coding-panel-3" className={`panel ${openPanels.has(3) ? "open" : ""}${skipPanelAnim ? " no-animate" : ""}`}>
                    <button className="panel-head" onClick={() => togglePanel(3)}>
                      <div className="panel-head-left">
                        <span className="step-badge">3</span>
                        <span className="panel-label">Experiment Instructions</span>
                        <HelpTip text="Give the model full context: the task, roles, decisions, payoffs, and communication rules." />
                        {experimentInstructions.trim() && <span className="tag">set</span>}
                      </div>
                      <svg className="chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6l4 4 4-4" /></svg>
                    </button>
                    <div className="panel-content-wrap"><div className="panel-content"><div className="panel-content-inner">
                      <div className="f">
                        <label>Describe the experiment context</label>
                        <textarea
                          className="ta-fit"
                          rows={16}
                          value={experimentInstructions}
                          onChange={(e) => setExperimentInstructions(e.target.value)}
                          placeholder={EXAMPLE_INSTRUCTIONS}
                        />
                        <p className="hint">Provide context about what the data represents and the research goals. <span className="cite-note">Example shown is from {PAPER_CITATION_SHORT}.</span></p>
                      </div>
                    </div></div></div>
                  </div>

                  {/* Panel 4: Models & Aggregation */}
                  <div id="coding-panel-4" className={`panel ${openPanels.has(4) ? "open" : ""}${skipPanelAnim ? " no-animate" : ""}`}>
                    <button className="panel-head" onClick={() => togglePanel(4)}>
                      <div className="panel-head-left">
                        <span className="step-badge">4</span>
                        <span className="panel-label">Models &amp; Aggregation</span>
                        <HelpTip text="Add model + API key pairs. Expand tuning to set temperature, top-p, and max tokens per model." />
                        <span className="tag">
                          {modelSlots.length} model{modelSlots.length !== 1 ? "s" : ""} × {runsPerModel} run{runsPerModel !== 1 ? "s" : ""}
                        </span>
                      </div>
                      <svg className="chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6l4 4 4-4" /></svg>
                    </button>
                    <div className="panel-content-wrap"><div className="panel-content"><div className="panel-content-inner">

                      <div className="model-slots" id="tour-model-slots">
                        {modelSlots.map((slot, idx) => {
                          const provInfo = PROVIDERS.find((p) => p.value === slot.provider);
                          const modelInfo = provInfo?.models.find((m) => m.value === slot.model);
                          const noTemp = modelIgnoresTemperature(slot.provider, slot.model);

                          return (
                            <div className="model-slot" key={idx}>
                              <div className="slot-header">
                                <span className="slot-num">{idx + 1}</span>
                                <span className="slot-title">{provInfo?.label ?? slot.provider} — {modelInfo?.label ?? slot.model}</span>
                                <div className="flex-1" />
                                {modelSlots.length > 1 && (
                                  <button className="row-rm" onClick={() => setModelSlots((prev) => prev.filter((_, i) => i !== idx))} title="Remove model">×</button>
                                )}
                              </div>

                              <div className="slot-body">
                                <div className="slot-fields">
                                  <div className="f">
                                    <label>Provider</label>
                                    <select
                                      value={slot.provider}
                                      onChange={(e) => {
                                        const np = e.target.value;
                                        const ms = PROVIDERS.find((p) => p.value === np)?.models ?? [];
                                        updateSlot(idx, { provider: np, model: ms[0]?.value ?? "" });
                                      }}
                                    >
                                      {PROVIDERS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                                    </select>
                                  </div>
                                  <div className="f">
                                    <label>Model</label>
                                    <select value={slot.model} onChange={(e) => updateSlot(idx, { model: e.target.value })}>
                                      {(provInfo?.models ?? []).map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                                    </select>
                                  </div>
                                  <div className="f">
                                    <label>API Key</label>
                                    <div className="enc-key-wrap">
                                      <input
                                        type={slot.showKey ? "text" : "password"}
                                        value={slot.apiKey}
                                        onChange={(e) => updateSlot(idx, { apiKey: e.target.value })}
                                        placeholder="sk-..."
                                      />
                                      <button
                                        className="enc-key-toggle"
                                        onClick={() => updateSlot(idx, { showKey: !slot.showKey })}
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

                                <div className="slot-tuning">
                                  {noTemp && (
                                    <div className="slot-tuning-warn">This model ignores temperature — the parameter will not be sent.</div>
                                  )}
                                  <div className="tuning-params-grid">
                                    <div className="tuning-param">
                                      <div className="tuning-param-header">
                                        <label className={noTemp ? "text-muted" : ""}>Temperature</label>
                                        <span className={`tuning-param-val${noTemp ? " text-muted" : ""}`}>{noTemp ? "N/A" : (slot.temperature ?? 0.2).toFixed(2)}</span>
                                      </div>
                                      <input type="range" min={0} max={2} step={0.05} value={slot.temperature ?? 0.2} disabled={noTemp}
                                        onChange={(e) => updateSlot(idx, { temperature: parseFloat(e.target.value) })} className={noTemp ? "range-disabled" : ""} />
                                      <div className="tuning-param-bounds"><span>0</span><span>2</span></div>
                                    </div>
                                    <div className="tuning-param">
                                      <div className="tuning-param-header">
                                        <label>Top-p</label>
                                        <span className="tuning-param-val">{(slot.topP ?? 1.0).toFixed(2)}</span>
                                      </div>
                                      <input type="range" min={0} max={1} step={0.05} value={slot.topP ?? 1.0}
                                        onChange={(e) => updateSlot(idx, { topP: parseFloat(e.target.value) })} />
                                      <div className="tuning-param-bounds"><span>0</span><span>1</span></div>
                                    </div>
                                    <div className="tuning-param">
                                      <div className="tuning-param-header">
                                        <label>Max tokens</label>
                                        <span className="tuning-param-val">{slot.maxTokens ?? 1024}</span>
                                      </div>
                                      <input type="number" min={64} max={8192} step={64} value={slot.maxTokens ?? 1024}
                                        onChange={(e) => updateSlot(idx, { maxTokens: parseInt(e.target.value, 10) })} className="tuning-tokens-input" />
                                      <div className="tuning-param-bounds"><span>64</span><span>8192</span></div>
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

                      <div className="enc-voting-settings" id="tour-aggregation">
                        <div className="enc-voting-row">
                          <div className="f voting-runs">
                            <label>Runs per model <span className="fv">{runsPerModel}×</span></label>
                            <input
                              type="range" min={1} max={10} value={runsPerModel}
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
                            <span className="enc-voting-agg">{aggregation === "mode" ? "Majority vote" : "Average"} across all calls</span>
                          )}
                        </div>
                      </div>
                    </div></div></div>
                  </div>

                </div>

                {/* Run bar */}
                <div id="coding-run-bar" className="run-bar">
                  {generateError && <span className="enc-error run-bar-error">{generateError}</span>}
                  <button className="btn btn-outline btn-sm" disabled={!canGenerate || generating || running} onClick={handleGenerate}>
                    {generating ? <><span className="spinner" /> Generating</> : "Script only"}
                  </button>
                  {running ? (
                    <button className="btn btn-sm btn-stop" onClick={handleStop}>Stop</button>
                  ) : (
                    <button className="btn btn-run" disabled={!canGenerate || generating} onClick={handleRun}>
                      Run Coding
                      {modelSlots.length * runsPerModel > 1 && (
                        <span className="run-calls-hint">({modelSlots.length}×{runsPerModel})</span>
                      )}
                    </button>
                  )}
                </div>
              </div>
              {/* Layout toggle rail — left collapses, right expands */}
              <div className="layout-rail" style={tourOpen ? { display: "none" } : undefined}>
                <div className="layout-rail-btns">
                  {layoutMode !== "hidden" && (
                    <button className="layout-arrow" onClick={collapseLayout} title={layoutMode === "fill" ? "Settings to the side" : "Hide settings"} aria-label="Collapse settings">
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 4L6 8l4 4" /></svg>
                    </button>
                  )}
                  {layoutMode !== "fill" && (
                    <button className="layout-arrow" onClick={expandLayout} title={layoutMode === "hidden" ? "Show settings" : "Expand settings"} aria-label="Expand settings">
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 4l4 4-4 4" /></svg>
                    </button>
                  )}
                </div>
              </div>

              {/* ── Right: Results Column ── */}
              <div className="results-col" style={{ flex: 1, minWidth: 0 }}>
                {layoutMode !== "fill" && (<>
                {(result || codedRows.length > 0 || running || consoleLogs.length > 0) && (
                  <div className="tab-strip tab-strip-gap">
                    <button className={`tab ${rightView === "run" ? "active" : ""}`} onClick={() => setRightView("run")}>
                      Live Coding {running && <span className="enc-pulse" />}
                    </button>
                    <button className={`tab ${rightView === "script" ? "active" : ""}`} onClick={() => setRightView("script")}>
                      Script Preview
                    </button>
                  </div>
                )}

                {/* Run view */}
                {rightView === "run" && (running || codedRows.length > 0 || runComplete || consoleLogs.length > 0) ? (
                  <div className="tab-pane">
                    {(runProgress || running) && (
                      <div className="enc-progress-wrap">
                        <div className="enc-progress-header">
                          <span className="enc-progress-label">
                            {runComplete ? "Coding complete" : running ? `Coding row ${runProgress?.current ?? 0} of ${runProgress?.total ?? "?"}...` : "Ready"}
                          </span>
                          <span className="enc-progress-pct">{runProgress?.percent ?? 0}%</span>
                        </div>
                        <div className="enc-progress-track">
                          <div className={`enc-progress-fill ${runComplete ? "complete" : ""}`} style={{ width: `${runProgress?.percent ?? 0}%` }} />
                        </div>
                      </div>
                    )}

                    {(runProgress || runComplete) && (
                      <div className="stat-row mt-12">
                        <div className="stat"><div className="stat-v">{runProgress?.current ?? 0}</div><div className="stat-l">Processed</div></div>
                        <div className="stat"><div className="stat-v">{runProgress?.total ?? 0}</div><div className="stat-l">Total</div></div>
                        <div className="stat"><div className="stat-v">{runErrors.length}</div><div className="stat-l">Errors</div></div>
                      </div>
                    )}

                    {visibleRows.length > 0 && (
                      <div className="res-section mt-12">
                        <div className="res-section-h">Live Results (last {Math.min(5, codedRows.length)} of {codedRows.length} rows)</div>
                        <div className="enc-live-table-wrap table-clickable" onClick={() => setExpandedTable("live")} title="Click to expand">
                          <table className="tbl tbl-compact">
                            <thead>
                              <tr>
                                <th>#</th><th>{messageColumn || "Message"}</th>
                                {codebookLabels.map((l) => <th key={l} className="enc-coded-col">{l}</th>)}
                              </tr>
                            </thead>
                            <tbody>
                              {visibleRows.map((row) => (
                                <tr key={row.index} className="enc-row-animate">
                                  <td className="mono text-muted">{row.index + 1}</td>
                                  <td className="cell-truncate">{String(row.original[messageColumn] ?? "")}</td>
                                  {codebookLabels.map((label) => (
                                    <td key={label} className="enc-coded-col">
                                      <span className={`pill ${row.coded._error ? "bad" : "lbl"}`}>
                                        {row.coded._error ? "err" : String(row.coded[label] ?? "—")}
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

                    {runErrors.length > 0 && (
                      <div className="res-section mt-12">
                        <div className="res-section-h text-bad">Errors ({runErrors.length})</div>
                        <div className="enc-errors-body">
                          {runErrors.slice(-5).map((err, i) => <div key={i} className="enc-error-line">{err}</div>)}
                        </div>
                      </div>
                    )}

                    {runError && <p className="enc-error mt-12">{runError}</p>}

                    {runComplete && validationReport && (
                      <div className={`enc-validation-report ${validationReport.problematicIndices.length === 0 ? "valid" : "has-issues"}`}>
                        {validationReport.problematicIndices.length === 0 ? (
                          <>
                            <div className="enc-validation-header valid">
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                              All <strong>{validationReport.totalRows}</strong> rows valid
                            </div>
                            <button className="btn btn-primary" onClick={hasRerun ? handleDownloadMerged : handleDownloadResults}>
                              Download coded_results.csv
                            </button>
                          </>
                        ) : (
                          <>
                            <div className="enc-validation-header issues">
                              <strong>{validationReport.problematicIndices.length}</strong> of {validationReport.totalRows} rows have issues
                            </div>
                            <div className="enc-validation-summary">
                              {validationReport.errorRows > 0 && <span className="pill bad">{validationReport.errorRows} API errors</span>}
                              {validationReport.outOfRangeRows > 0 && <span className="pill mid">{validationReport.outOfRangeRows} out-of-range</span>}
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
                              {validationReport.issues.length > 10 && <div className="enc-vi-more">...and {validationReport.issues.length - 10} more issues</div>}
                            </div>
                            <div className="enc-validation-actions">
                              <button className="btn btn-secondary" onClick={hasRerun ? handleDownloadMerged : handleDownloadResults}>Download as-is</button>
                              <button className="btn btn-primary" onClick={() => handleRerun(validationReport.problematicIndices)}>Re-run {validationReport.problematicIndices.length} rows</button>
                              <button className="btn btn-ghost" onClick={() => handleRerun(null)}>Re-run all</button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                    {runComplete && !validationReport && <div className="enc-complete-bar"><div>Validating results...</div></div>}

                    {runComplete && (
                      <div className="res-section mt-12 run-summary-cta">
                        <div>
                          <div className="run-summary-title">Run summary</div>
                          <div className="run-summary-sub">Dataset, models, configuration, timing &amp; results — save as PDF.</div>
                        </div>
                        <button className="btn btn-outline btn-sm" onClick={handleRunSummary}>↓ Download summary (PDF)</button>
                      </div>
                    )}

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
                      <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
                      <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
                    </svg>
                    <p>No results yet</p>
                    <span className="text-sm">Configure the left panel, then press Run Coding</span>
                  </div>
                ) : null}

                {/* Script view */}
                {rightView === "script" && result ? (
                  <div className="tab-pane">
                    <div className="res-head">
                      <h2>Generated Script</h2>
                      <span className="res-meta">{result.filename}</span>
                    </div>
                    <div className="stat-row">
                      <div className="stat"><div className="stat-v">{uploadResult?.row_count ?? 0}</div><div className="stat-l">Rows</div></div>
                      <div className="stat"><div className="stat-v">{codebookLabels.length}</div><div className="stat-l">Variables</div></div>
                      <div className="stat"><div className="stat-v">{modelSlots.length} × {runsPerModel}</div><div className="stat-l">Models × Runs</div></div>
                    </div>
                    <div className="res-section mb-12">
                      <div className="res-section-h">
                        <span>Script Preview</span>
                        <button className="btn btn-primary btn-xs" onClick={handleDownload}>Download .py</button>
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
                </>)}
              </div>
            </div>
          </div>

          {activeTool === "catgen" && <CategoryGenerator providers={PROVIDERS} />}

          {/* Analysis page */}
          <div className={`tool-page ${activeTool === "analysis" ? "active" : ""}`}>
            <div className="tool-header">
              <div>
                <h1>Results Analysis</h1>
                <p className="tool-desc">Upload rater files, configure episode matching, and compute inter-rater agreement.</p>
              </div>
            </div>
            <div className="tool-body">
              <div className="ana-section">
                <div className="ana-section-h">Upload Raters</div>
                <div className="ana-groups">
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
                          } else { setAnalysisRaters([...others, ...cur.slice(0, n)]); }
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
                          } else { setAnalysisRaters([...others, ...cur.slice(0, n)]); }
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
                  {crossCheckResult && (
                    <div className={`ana-crosscheck mt-12 ${crossCheckResult.ok ? "ok" : "fail"}`}>
                      {crossCheckResult.ok ? (
                        <>
                          <div className="ana-cc-line ok"><strong>{crossCheckResult.common_episodes}</strong> episodes in common across all raters</div>
                          {crossCheckResult.warnings.map((w, i) => <div key={i} className="ana-cc-line warn">{w}</div>)}
                        </>
                      ) : (
                        crossCheckResult.missing_columns.map((mc, i) => (
                          <div key={i} className="ana-cc-line fail">{mc.rater}: {mc.error || `missing columns: ${mc.missing?.join(", ")}`}</div>
                        ))
                      )}
                    </div>
                  )}
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
                                      <tr><th>Variable</th><th className="tc">Items</th><th className="tc">% Agree</th><th className="tc">Kappa</th><th className="tc">AC1</th></tr>
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

          {activeTool === "instructions" && <Instructions onNavigate={(tool) => setActiveTool(tool)} />}

          {activeTool === "contact" && (
            <div className="tool-page active">
              <div className="tool-header">
                <div>
                  <h1>Contact Us</h1>
                  <p className="tool-desc">Have a question, found a bug, or want to give feedback? Send us a message and we&apos;ll get back to you.</p>
                </div>
              </div>
              <div className="tool-body">
                <div className="ana-section mt-16">
                  <div className="ana-section-h">Questions or concerns?</div>
                  <div className="faq-contact"><ContactForm /></div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Column-mapping popup: square role tabs → verify → proceed */}
      {columnModalOpen && uploadResult && (() => {
        const assignedFor = (role: ColRole): string[] =>
          role === "message" ? (messageColumn ? [messageColumn] : [])
          : role === "identifier" ? identifierColumns
          : role === "identity" ? (identityColumn ? [identityColumn] : [])
          : (orderColumn ? [orderColumn] : []);
        return (
          <div className="colmap-overlay">
            <div className="colmap-modal" id="tour-map-modal">
              <div className="colmap-head">
                <div>
                  <h2 className="colmap-title">Map your columns</h2>
                  <p className="colmap-sub">Work through the steps — click a column below to tag it for the active step. Steps marked <span className="colmap-req">*</span> are required.</p>
                </div>
                <button className="modal-close" onClick={closeColumnModal} title="Close without saving">✕</button>
              </div>

              {/* Numbered step checklist (replaces the old role tabs) */}
              <div className="colmap-steps" id="tour-map-roles">
                {ROLE_ORDER.map((role, i) => {
                  const meta = ROLE_META[role];
                  const required = role === "message" || role === "identifier";
                  const assigned = role === "identifier" && rowsAsUnits ? ["each row = episode"] : assignedFor(role);
                  const done = assigned.length > 0;
                  const active = activeRole === role;
                  return (
                    <button key={role} id={`tour-role-${role}`} className={`colmap-step ${active ? "active" : ""} ${done ? "done" : ""}`}
                      style={active ? { borderColor: meta.color, background: meta.bg } : undefined}
                      onClick={() => setActiveRole(role)}>
                      <span className="colmap-step-num"
                        style={done ? { background: meta.color, borderColor: meta.color, color: "#fff" }
                          : active ? { borderColor: meta.color, color: meta.color } : undefined}>
                        {done ? "✓" : i + 1}
                      </span>
                      <span className="colmap-step-body">
                        <span className="colmap-step-name">{meta.label}{required ? <span className="colmap-req"> *</span> : <span className="colmap-step-opt"> · optional</span>}</span>
                        <span className="colmap-step-val">{done ? assigned.join(", ") : required ? "not set — click here" : "none"}</span>
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Prominent instruction for the active step */}
              <div className="colmap-guide" style={{ borderColor: ROLE_META[activeRole].color, background: ROLE_META[activeRole].bg }}>
                <span className="colmap-guide-num" style={{ background: ROLE_META[activeRole].color }}>{ROLE_ORDER.indexOf(activeRole) + 1}</span>
                <span className="colmap-guide-txt">
                  {activeRole === "identifier"
                    ? (rowsAsUnits
                        ? "Each row is coded as its own episode — no identifier columns needed."
                        : "First choose how episodes are formed, then click the identifier column(s) in the table below.")
                    : ROLE_META[activeRole].hint}
                </span>
              </div>

              {activeRole === "identifier" && (
                <div className="episode-choice">
                  <button className={`episode-opt ${!rowsAsUnits ? "sel" : ""}`} onClick={() => setRowsAsUnits(false)}>
                    <span className="episode-opt-radio" />
                    <span className="episode-opt-body">
                      <span className="episode-opt-title">Group rows into one episode</span>
                      <span className="episode-opt-desc">Rows that share the column(s) you tag below are merged into a single episode — e.g. all messages in the same session + round.</span>
                    </span>
                  </button>
                  <button className={`episode-opt ${rowsAsUnits ? "sel" : ""}`} onClick={() => { setRowsAsUnits(true); setIdentifierColumns([]); }}>
                    <span className="episode-opt-radio" />
                    <span className="episode-opt-body">
                      <span className="episode-opt-title">Each row is its own episode</span>
                      <span className="episode-opt-desc">Every message row is coded on its own — no grouping, no identifier columns needed.</span>
                    </span>
                  </button>
                </div>
              )}
              {activeRole === "order" && orderColumn && (
                <div className="colmap-order-dir">
                  <span>Order messages by <b>{orderColumn}</b>:</span>
                  <div className="seg">
                    <button className={orderDirection === "asc" ? "on" : ""} onClick={() => setOrderDirection("asc")}>Ascending</button>
                    <button className={orderDirection === "desc" ? "on" : ""} onClick={() => setOrderDirection("desc")}>Descending</button>
                  </div>
                </div>
              )}

              {/* Clickable preview = highlight columns */}
              <div className="colmap-table-wrap" id="tour-map-table">
                <table className="colmap-table">
                  <thead><tr>
                    <th className="colmap-rownum">#</th>
                    {uploadResult.columns.map((col) => {
                      const role = roleOf(col);
                      const meta = role ? ROLE_META[role] : null;
                      return (
                        <th key={col} className={`colmap-col ${role ? "assigned" : ""}`}
                          style={meta ? { borderTopColor: meta.color, background: meta.bg } : undefined}
                          onClick={() => clickColumn(col)} title={`Click to tag as ${ROLE_META[activeRole].label}`}>
                          <span className="colmap-col-name">{col}</span>
                          {meta && <span className="colmap-col-badge" style={{ background: meta.color }}>{meta.short}</span>}
                        </th>
                      );
                    })}
                  </tr></thead>
                  <tbody>
                    {uploadResult.preview.slice(0, 8).map((row, i) => (
                      <tr key={i}>
                        <td className="colmap-rownum">{i + 1}</td>
                        {uploadResult.columns.map((col) => {
                          const role = roleOf(col);
                          const meta = role ? ROLE_META[role] : null;
                          return (
                            <td key={col} className={`colmap-cell ${role ? "assigned" : ""}`}
                              style={meta ? { background: meta.bg } : undefined} onClick={() => clickColumn(col)}>
                              {String(row[col] ?? "")}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {uploadResult.preview.length > 8 && <div className="colmap-more">Showing 8 of {uploadResult.preview.length} rows</div>}
              </div>

              {/* Context column descriptions */}
              {contextColumns.length > 0 && (
                <div className="colmap-context">
                  <div className="colmap-context-head">Context for the model — describe what each tagged column&apos;s values mean</div>
                  {contextColumns.map((col) => (
                    <div className="f colmap-context-row" key={col}>
                      <label><span className="role-dot" style={{ background: ROLE_META.context.color }} /> {col}</label>
                      <textarea
                        rows={2}
                        value={contextDescriptions[col] ?? ""}
                        onChange={(e) => setContextDescriptions((prev) => ({ ...prev, [col]: e.target.value }))}
                        placeholder={`e.g. ${col} is the chat channel — p-v1 = private chat between P and V1, public = all players, …`}
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Sender-name verification (for per-sender variables) */}
              {hasSenderVar && (
                <div className={`colmap-verify-result ${sendersOk ? "ok" : "warn"}`} style={{ margin: 0 }}>
                  {!identityColumn ? (
                    <p><b>⚠ Sender column needed.</b> You defined a per-sender variable — tag a <b>Sender identity</b> column so each sender can be matched.</p>
                  ) : participants.length === 0 ? (
                    <p><b>⚠ No participants declared.</b> Add participant names in the Codebook editor&apos;s Participants block.</p>
                  ) : sendersOk ? (
                    <p><b>✓ Senders match.</b> Every sender in <b>{identityColumn}</b> ({dataSenders.join(", ")}) is a declared participant.</p>
                  ) : (
                    <p><b>⚠ Unknown senders.</b> These appear in <b>{identityColumn}</b> but aren&apos;t declared participants: <b>{unknownSenders.join(", ")}</b>. Add them to the codebook participants (or fix the data).</p>
                  )}
                </div>
              )}

              {/* Save & proceed */}
              <div className="colmap-foot" id="tour-map-proceed">
                <span className={`hint ${colMapError ? "text-bad" : ""}`} style={{ margin: 0 }}>
                  {colMapError
                    ? colMapError
                    : mappingComplete
                    ? "Mapping complete."
                    : !messageColumn ? "Tag a Message column to continue."
                    : (!rowsAsUnits && identifierColumns.length === 0) ? "Choose an identifier (columns or “each row is its own episode”)."
                    : !sendersOk ? "Resolve the sender-name match above to continue."
                    : ""}
                </span>
                <button className="btn btn-primary" onClick={saveAndProceed}>Save &amp; Proceed</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Fullscreen table modal */}
      {expandedTable && (
        <div className="modal-overlay" onClick={closeExpanded}>
          <div className="modal modal-table" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="fw-600">
                {expandedTable === "preview" && `Dataset (${uploadResult?.preview.length ?? 0} rows)`}
                {expandedTable === "codebook" && "Codebook"}
                {expandedTable === "live" && `Coded Results (${codedRows.length} rows)`}
              </span>
              <button className="btn btn-ghost btn-sm" onClick={closeExpanded}>✕</button>
            </div>
            <div className="modal-body">
              {expandedTable === "preview" && uploadResult && (
                <table className="tbl">
                  <thead><tr><th className="th-row-num">#</th>{uploadResult.columns.map((col) => <th key={col} className={col === messageColumn ? "col-msg" : ""}>{col}</th>)}</tr></thead>
                  <tbody>
                    {uploadResult.preview.map((row, i) => (
                      <tr key={i}><td className="mono text-muted">{i + 1}</td>{uploadResult.columns.map((col) => <td key={col}>{String(row[col] ?? "")}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              )}
              {expandedTable === "codebook" && (
                <div className="cb-editor" id="tour-cb-editor">
                  {codebook.map((entry, idx) => (
                    <div className="cb-card" id={idx === 0 ? "tour-cb-card" : undefined} key={idx}>
                      <div className="cb-card-top">
                        <input className="cb-card-label" type="text" value={entry.label} onChange={(e) => updateCodebook(idx, "label", e.target.value)} placeholder="Variable label — e.g. promise" />
                        <div className="cb-type-wrap" id={idx === 0 ? "tour-cb-type" : undefined}>
                          <select value={entry.type} onChange={(e) => changeType(idx, e.target.value)}>
                            {CODEBOOK_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                          </select>
                          <HelpTip text={TYPE_HELP} />
                        </div>
                        <select value={entry.level} onChange={(e) => updateCodebook(idx, "level", e.target.value)}>
                          <option value="episode">Per episode</option>
                          <option value="sender">Per sender</option>
                        </select>
                        <button className="row-rm" onClick={() => removeCodebookRow(idx)} title="Remove variable" disabled={codebook.length <= 1}>×</button>
                      </div>

                      <div className="cb-field">
                        <label>Category definition</label>
                        <textarea rows={2} value={entry.definition} onChange={(e) => updateCodebook(idx, "definition", e.target.value)} placeholder="What this variable measures and how to decide it" />
                      </div>

                      {!TYPE_HAS_VALUES(entry.type) ? (
                        <div className="cb-values" id={idx === 0 ? "tour-cb-values" : undefined}>
                          <p className="hint" style={{ margin: 0 }}>
                            {entry.type === "numeric"
                              ? "Numeric — the model returns a number. No fixed values to define."
                              : "Text — the model returns free-form text. No fixed values to define."}
                          </p>
                        </div>
                      ) : (
                        <div className="cb-values" id={idx === 0 ? "tour-cb-values" : undefined}>
                          <div className="cb-values-h">Coded values <span className="cb-opt">
                            {entry.type === "binary" ? "fixed 0 / 1 — just define what each means" : "one definition per value"}
                          </span></div>
                          <div className="cb-value-grid cb-value-head">
                            <span>Value</span>
                            <span>Definition</span>
                            <span>Examples <em>(optional)</em></span>
                            <span>Additional context <em>(optional)</em></span>
                            <span />
                          </div>
                          {entry.values.map((v, vIdx) => (
                            <div className="cb-value-grid" key={vIdx}>
                              <input className="cb-value-key" type="text" value={v.value} readOnly={entry.type === "binary"} onChange={(e) => updateValue(idx, vIdx, "value", e.target.value)} placeholder="e.g. P" />
                              <textarea className="cb-val-ta" rows={1} value={v.definition} onChange={(e) => updateValue(idx, vIdx, "definition", e.target.value)} placeholder="What this value means" />
                              <textarea className="cb-val-ta" rows={1} value={v.examples} onChange={(e) => updateValue(idx, vIdx, "examples", e.target.value)} placeholder="examples" />
                              <textarea className="cb-val-ta" rows={1} value={v.context} onChange={(e) => updateValue(idx, vIdx, "context", e.target.value)} placeholder="context" />
                              {entry.type === "binary"
                                ? <span />
                                : <button className="row-rm" onClick={() => removeValueRow(idx, vIdx)} title="Remove value" disabled={entry.values.length <= 1}>×</button>}
                            </div>
                          ))}
                          {entry.type !== "binary" && <button className="btn btn-ghost btn-xs" onClick={() => addValueRow(idx)}>+ Add value</button>}
                        </div>
                      )}
                    </div>
                  ))}
                  <button className="btn btn-outline btn-sm" onClick={addCodebookRow}>+ Add variable</button>
                  {hasSenderVar && (
                    <div className="f participants-block mt-12">
                      <label>Participants / senders <span className="fv">{participants.length} {participants.length === 1 ? "sender" : "senders"}</span></label>
                      <TagInput value={participantsStr} onChange={setParticipantsStr} type="text" />
                      <p className="hint">Per-sender variables are coded once for each participant. These names must match the values in your sender-identity column.</p>
                    </div>
                  )}
                  <div className="cb-editor-foot">
                    <button className="btn btn-ghost" onClick={closeCodebookEditor}>Cancel</button>
                    <button className="btn btn-primary" onClick={saveCodebookEditor}>Save</button>
                  </div>
                </div>
              )}
              {expandedTable === "live" && codedRows.length > 0 && (
                <table className="tbl">
                  <thead><tr><th className="th-row-num">#</th><th className="col-msg">{messageColumn || "Message"}</th>{codebookLabels.map((l) => <th key={l}>{l}</th>)}</tr></thead>
                  <tbody>
                    {codedRows.map((row) => (
                      <tr key={row.index}>
                        <td className="mono text-muted">{row.index + 1}</td>
                        <td>{String(row.original[messageColumn] ?? "")}</td>
                        {codebookLabels.map((label) => (
                          <td key={label} className="tc">
                            <span className={`pill ${row.coded._error ? "bad" : "lbl"}`}>
                              {row.coded._error ? "err" : String(row.coded[label] ?? "—")}
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

      <GuidedTour
        open={tourOpen}
        steps={CODING_TOUR_STEPS}
        onClose={endTour}
        onStepEnter={handleStepEnter}
      />

      {showWelcome && (
        <div className="welcome-overlay" onClick={() => dismissWelcome("later")}>
          <div className="welcome-modal" onClick={(e) => e.stopPropagation()}>
            <div className="welcome-emoji">👋</div>
            <h2 className="welcome-title">First time here?</h2>
            <p className="welcome-text">
              Take a quick guided walkthrough of the LLM Coding page — we&apos;ll highlight each step, from uploading your data to running the models.
            </p>
            <div className="welcome-actions">
              <button className="btn btn-primary" onClick={() => dismissWelcome("tour")}>Take the tour</button>
              <button className="btn btn-outline" onClick={() => dismissWelcome("later")}>Maybe later</button>
            </div>
            <button className="welcome-link" onClick={() => dismissWelcome("guide")}>Or read the full guide →</button>
            <button className="welcome-never" onClick={() => dismissWelcome("never")}>Don&apos;t show again</button>
          </div>
        </div>
      )}
    </>
  );
}