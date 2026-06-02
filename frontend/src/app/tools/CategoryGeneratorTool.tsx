'use client'

import { useState } from "react";
import { apiFetch } from "@/lib/api"; // your apiFetch helper

interface Category {
  label: string;
  definition: string;
  include: string;
  exclude: string;
  example: string;
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
  // Inputs
  const [goals, setGoals] = useState(
    "Classify therapist communication behaviors during motivational interviewing sessions into standard MI-consistent and MI-inconsistent categories for behavioral coding research."
  );
  const [hypothesis, setHypothesis] = useState(
    "Therapist reflections and open questions are associated with higher client engagement in subsequent turns."
  );
  const [outputType, setOutputType] = useState("classify");
  const [targetCount, setTargetCount] = useState(6);
  const [domain, setDomain] = useState("Psychotherapy / Motivational Interviewing");
  const [references, setReferences] = useState(
    "MITI 4.2 behavioral codes: Giving Information (GI), Persuade (Per), Persuade with Permission (PwP), Question (Q), Simple Reflection (SR), Complex Reflection (CR), Affirm (AF), Seek Collaboration (SeC), Emphasize Autonomy (EA), Confront (Con)."
  );
  const [dataSampleText, setDataSampleText] = useState(
    `EP1: "It sounds like you've been feeling overwhelmed lately."
EP2: "What would it look like if things were different?"
EP3: "You showed real courage in bringing that up today."`
  );

  const [openPanels, setOpenPanels] = useState(new Set([1,2,3,4]));

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

  // Output
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);

  

  const handleGenerate = async () => {
    setLoading(true);
    try {
      // Split dataSample into list of objects
      const dataSample = dataSampleText
        .split("\n")
        .filter(line => line.trim() !== "")
        .map((line, idx) => ({ id: idx + 1, text: line.trim() }));

      const body = {
        api_key: "YOUR_API_KEY_HERE",
        model: "gpt-4o",
        provider: "openai",
        name: "My Research",
        goals,
        hypothesis,
        domain,
        references,
        data_sample: dataSample,
        codebook: null
      };

      const res = await apiFetch<{ raw: string }>("/generate/categories", {
        method: "POST",
        body: JSON.stringify(body),
      });

      // Expect JSON array in raw
      const parsed: Category[] = JSON.parse(res.raw);
      setCategories(parsed);
    } catch (err) {
      console.error(err);
      alert("Failed to generate categories. Check console for details.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="tool-page active">
      
      {/* HEADER (same structure as encoding tool) */}
      <div className="tool-header">
        <div>
          <h1>Category Generator</h1>
          <p className="tool-desc">
            Automatically generate coding categories, tags, or schemas from your research context.
          </p>
        </div>
      </div>

      <div className="pipeline-layout split">

        {/* ── LEFT: CONFIG ── */}
        <div className="config-col">
          <div className="config-scroll">

            {/* Panel 1: Research Context */}
            <div className={`panel ${openPanels.has(1) ? "open" : ""}`}>
              <button className="panel-head" onClick={() => togglePanel(1)}>
                <div className="panel-head-left">
                  <span className="step-badge">1</span>
                  <span className="panel-label">Research Context</span>
                </div>
                <svg className="chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6l4 4 4-4" /></svg>
              </button>

              <div className="panel-content">
                <div className="f">
                  <label>Goals</label>
                  <textarea
                    rows={3}
                    value={goals}
                    onChange={(e) => setGoals(e.target.value)}
                  />

                  <label>Hypothesis</label>
                  <textarea
                    rows={2}
                    value={hypothesis}
                    onChange={(e) => setHypothesis(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Panel 2: Generation Settings */}
            <div className={`panel ${openPanels.has(2) ? "open" : ""}`}>
              <button className="panel-head" onClick={() => togglePanel(2)}>
                <div className="panel-head-left">
                  <span className="step-badge">2</span>
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
                      type="range"
                      min={3}
                      max={20}
                      value={targetCount}
                      onChange={(e) => setTargetCount(Number(e.target.value))}
                    />
                  </div>
                </div>
                </div>
                <div className="f">
                  <label>Domain</label>
                  <input
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                    style={{ width: "100%" }}
                  />
                </div>
                  <div className="f">
                    <label>Generator Provider</label>
                    <select
                      value={genConfig.provider}
                      onChange={(e) => {
                        const provider = e.target.value;
                        const firstModel =
                          providers.find((p) => p.value === provider)?.models?.[0]?.value ?? "";

                        setGenConfig((prev) => ({
                          ...prev,
                          provider,
                          model: firstModel, // auto-reset model when provider changes
                        }));
                      }}
                    >
                      {providers.map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="f">
                    <label>Generator Model</label>
                    <select
                      value={genConfig.model}
                      onChange={(e) =>
                        setGenConfig((prev) => ({
                          ...prev,
                          model: e.target.value,
                        }))
                      }
                    >
                      {(providers.find((p) => p.value === genConfig.provider)?.models ?? []).map(
                        (m) => (
                          <option key={m.value} value={m.value}>
                            {m.label}
                          </option>
                        )
                      )}
                    </select>
                  </div>
                  <div className="f">
                    <label>API Key</label>
                    <input
                      type="password"
                      value={genConfig.apiKey}
                      onChange={(e) =>
                        setGenConfig((prev) => ({
                          ...prev,
                          apiKey: e.target.value,
                        }))
                      }
                      placeholder="Enter API key"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Panel 3: References */}
            <div className={`panel ${openPanels.has(3) ? "open" : ""}`}>
              <button className="panel-head" onClick={() => togglePanel(3)}>
                <div className="panel-head-left">
                  <span className="step-badge">3</span>
                  <span className="panel-label">References (optional)</span>
                </div>
                <svg className="chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6l4 4 4-4" /></svg>
              </button>

              <div className="panel-content">
                <textarea
                  rows={3}
                  value={references}
                  onChange={(e) => setReferences(e.target.value)}
                />
              </div>
            </div>

            {/* Panel 4: Sample Data */}
            <div className={`panel ${openPanels.has(4) ? "open" : ""}`}>
              <button className="panel-head" onClick={() => togglePanel(4)}>
                <div className="panel-head-left">
                  <span className="step-badge">4</span>
                  <span className="panel-label">Sample Data (optional)</span>
                </div>
                <svg className="chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6l4 4 4-4" /></svg>
              </button>

              <div className="panel-content">
                <textarea
                  rows={4}
                  value={dataSampleText}
                  onChange={(e) => setDataSampleText(e.target.value)}
                />
                <p className="hint">Optional but improves quality.</p>
              </div>
            </div>

          </div>

          {/* ACTION BAR (match encoding tool) */}
          <div className="run-bar">
            <button
              className="btn btn-run"
              onClick={handleGenerate}
              disabled={loading}
            >
              {loading ? "Generating..." : "Generate Categories"}
            </button>
          </div>
        </div>

        {/* ── RIGHT: RESULTS ── */}
        <div className="results-col">

          <div className="res-section">
            <div className="res-section-h">
              Generated Categories
            </div>

            {categories.length === 0 ? (
              <div className="results-empty">
                <p>No categories generated yet</p>
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
                        <span className="catgen-label">Include:</span>
                        {cat.include}
                      </div>

                      <div className="catgen-field">
                        <span className="catgen-label">Exclude:</span>
                        {cat.exclude}
                      </div>

                      <div className="catgen-field">
                        <span className="catgen-label">Example:</span>
                        <em>{cat.example}</em>
                      </div>
                    </div>

                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
} 