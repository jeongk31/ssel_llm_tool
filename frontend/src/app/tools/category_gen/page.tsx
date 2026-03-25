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

export default function CategoryGenerator() {
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
    <div className="tool-page">
      <h1>Category Generator</h1>
      <p className="tool-desc">
        Automatically generate coding categories, tags, rating rubrics, or extraction schemas from your research goals.
      </p>

      <div className="split-layout">
        {/* Left: Inputs */}
        <div className="split-left">
          <section>
            <h2>Research Context</h2>
            <textarea
              placeholder="Describe what you want to measure…"
              value={goals}
              onChange={e => setGoals(e.target.value)}
              rows={3}
            />
            <textarea
              placeholder="What patterns do you expect to find?"
              value={hypothesis}
              onChange={e => setHypothesis(e.target.value)}
              rows={2}
            />
          </section>

          <section>
            <h2>Generation Settings</h2>
            <label>Output type</label>
            <select value={outputType} onChange={e => setOutputType(e.target.value)}>
              <option value="classify">Classify (single label)</option>
              <option value="tag">Tag (multi-label)</option>
              <option value="rate">Rate (scaled)</option>
              <option value="extract">Extract (structured)</option>
            </select>

            <label>Target count: {targetCount}</label>
            <input
              type="range"
              min={3}
              max={20}
              value={targetCount}
              onChange={e => setTargetCount(Number(e.target.value))}
            />

            <label>Domain</label>
            <input
              type="text"
              value={domain}
              placeholder="e.g., Healthcare, Education, Legal…"
              onChange={e => setDomain(e.target.value)}
            />

            <label>Reference materials (optional)</label>
            <textarea
              value={references}
              onChange={e => setReferences(e.target.value)}
              rows={2}
              placeholder="Paste existing coding manual excerpts, category lists, or relevant definitions…"
            />
          </section>

          <section>
            <h2>Sample Episodes (optional)</h2>
            <textarea
              value={dataSampleText}
              onChange={e => setDataSampleText(e.target.value)}
              rows={4}
              placeholder={`EP1: "First example…"\nEP2: "Second example…"\nEP3: "Third example…"`}
            />
            <small>Providing sample episodes helps generate more relevant categories.</small>
          </section>

          <button className="btn btn-primary" onClick={handleGenerate} disabled={loading}>
            {loading ? "Generating…" : "Generate Categories"}
          </button>
        </div>

        {/* Right: Output */}
        <div className="split-right">
          <h2>Generated Categories</h2>
          {categories.length === 0 && <p>No categories generated yet.</p>}
          {categories.map((cat, idx) => (
            <div key={idx} className="catgen-card">
              <div className="catgen-card-header">
                <span>{idx + 1}</span> <strong>{cat.label}</strong>
              </div>
              <div className="catgen-card-body">
                <div><strong>Definition:</strong> {cat.definition}</div>
                <div><strong>Include:</strong> {cat.include}</div>
                <div><strong>Exclude:</strong> {cat.exclude}</div>
                <div><strong>Example:</strong> <em>{cat.example}</em></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}