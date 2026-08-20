'use client'

import { useState } from "react";

type Section = "faq" | "demo";

const SECTIONS: { value: Section; label: string }[] = [
  // { value: "coding", label: "LLM Coding" },  // hidden for now
  { value: "demo", label: "Demo Video" },
  { value: "faq", label: "FAQ" },
];

// FAQ content — each entry renders as its own card.
const FAQS: { q: string; a: React.ReactNode }[] = [
  {
    q: "What does CAT do?",
    a: <>CAT (Communication Annotation Tool) codes qualitative communication data into structured variables using LLMs. You upload a dataset, map columns into communication <strong>episodes</strong>, define a <strong>codebook</strong>, and one or more models code every episode according to your definitions.</>,
  },
  {
    q: "What is a communication episode?",
    a: <>It&apos;s the unit of analysis — a combination of messages exchanged through the same channel, or a collection of messages sent by one sender. Rows that share the identifier column(s) you tag are merged into one episode. You can also choose &ldquo;each row is its own episode.&rdquo;</>,
  },
  {
    q: "Do you store my dataset or my API keys?",
    a: <>Your API keys are <strong>never</strong> saved — not in the database, logs, browser storage, or generated packages; they live only in memory during a run and travel over HTTPS. To restore work after a refresh, CAT keeps the current dataset in this browser and uses a temporary server copy that is removed after the 24-hour threshold. CAT asks before optional analytics: acceptance enables the disclosed browser, IP-derived location, and configuration metadata; rejection records only one anonymous visit count. See the <a href="/privacy" target="_blank" rel="noopener noreferrer">privacy notice</a>.</>,
  },
  {
    q: "How do I set up the codebook?",
    a: <>Each variable has a <strong>label</strong>, <strong>type</strong>, <strong>level</strong>, <strong>definition</strong>, and its own aggregation method. For Binary/Categorical variables, define every allowed <strong>value</strong> with its own definition (plus optional examples and context). Use majority vote for label outputs and average for numeric outputs.</>,
  },
  {
    q: "What do the variable types mean?",
    a: <><strong>Binary</strong> is a fixed 0/1 outcome; <strong>Categorical</strong> is your own named set of values; <strong>Numeric</strong> returns a number; <strong>Text</strong> returns free-form text. Numeric and Text have no fixed value list.</>,
  },
  {
    q: "What's the difference between per-episode and per-sender variables?",
    a: <><strong>Per episode</strong> produces one value for the whole episode. <strong>Per sender</strong> produces one value for each sender and expands into a column per detected name (e.g. <code>cooperation_P</code>, <code>cooperation_V1</code>). CAT reads these names automatically from the mapped Sender column; review and verify the list before continuing. Blank Sender cells must be corrected.</>,
  },
  {
    q: "What does “empty message handling” do?",
    a: <>It controls fully empty communication episodes. <strong>Ignore</strong> skips the model call, while retaining the corresponding source rows with blank code cells in the primary CSV. <strong>Code as Value</strong> sends the empty episode to the model so the codebook can define how it should be classified.</>,
  },
  {
    q: "How many models and runs should I use, and how are they combined?",
    a: <>You can add several provider/model pairs and run each multiple times. More runs reduce variance at the cost of more API calls. In the codebook, choose separately for each variable whether its results use <strong>majority vote (mode)</strong> or <strong>average (mean)</strong>.</>,
  },
  {
    q: "What's the difference between “Generate Package” and “Run Coding”?",
    a: <><strong>Generate Package</strong> downloads a ZIP containing the script, three CSV files (source rows, exact preprocessed episodes, and their row map), a README, and requirements. CAT does not save an API key or the configured tuning settings for package generation. The package records only the first selected provider and model, uses them for one call per episode, and reads <code>CAT_API_KEY</code> or prompts securely at runtime. <strong>Run Coding</strong> requires and validates the keys for all configured models, then codes every episode live in the app using all configured models and runs.</>,
  },
  {
    q: "What do the result downloads contain?",
    a: <>The primary <strong>Coded dataset</strong> CSV preserves every original row and column and appends the final aggregate coding columns. If several message rows form one episode, that episode&apos;s codes are repeated on each corresponding original row. The optional <strong>Episode-level results</strong> CSV is a compact version with one row per preprocessed episode. When several model calls were used, their individual and aggregate records are available separately as detailed CSV outputs. After a selective re-run, the replacement calls take the place of the earlier records for those episodes while all unaffected records remain available.</>,
  },
  {
    q: "Why is my run showing errors for some episodes?",
    a: <>Check the empty-message-handling setting and confirm your API key is valid for the selected model. After a run, the validation report lists the affected coded episodes and lets you re-run only those.</>,
  },
  {
    q: "Which LLM providers are supported?",
    a: <>OpenAI, Google (Gemini), DeepSeek, Anthropic (Claude), and xAI (Grok). Browser execution requires an API key for each configured model. Package generation does not require a key because the local script obtains it when run.</>,
  },
  {
    q: "If I refresh the page, do I lose my work?",
    a: <>Normally, no. In the same browser and website, CAT saves the current dataset, mapping, codebook, models, and settings locally and restores them automatically. API keys are deliberately not saved, so you must re-enter them. If you clear site data, use private browsing, switch browsers or devices, or the browser removes local storage, you will need to re-upload the dataset. Use <strong>Reset</strong> to clear the saved project and local dataset copy.</>,
  },
];

export const EXAMPLE_INSTRUCTIONS = `Constructed example: Participants interact for several rounds. Before making a choice in each round, they may exchange written messages. Each participant then chooses either Cooperate or Not Cooperate. Payoffs depend on both participants' choices. Messages may discuss intended choices, proposals, agreements, or other topics. Participants must not include personally identifying or offensive content.`;

function DemoVideo() {
  return (
    <div className="ana-section mt-16">
      <div className="ana-section-h">Demo Video</div>
      <div className="tool-desc">
        <video controls preload="metadata" style={{ width: "100%", borderRadius: 8 }}>
          <source src="/demos/coding-demo.mp4" type="video/mp4" />
          Your browser does not support embedded video.
        </video>
        <p className="howto-cite mt-12">This walkthrough demonstrates the published CAT coding workflow.</p>
      </div>
    </div>
  );
}

export function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !body.trim()) {
      setError("Please fill in your name, email, and message.");
      setStatus("error");
      return;
    }
    setStatus("sending");
    setError("");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, title, body }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail || "Could not send your message. Please try again later.");
      }
      setStatus("sent");
      setName(""); setEmail(""); setTitle(""); setBody("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send your message.");
      setStatus("error");
    }
  };

  if (status === "sent") {
    return <p className="contact-sent">✓ Thanks — your message has been sent. We&apos;ll get back to you.</p>;
  }

  return (
    <form className="contact-form" onSubmit={submit}>
      <div className="contact-row">
        <label>Name<input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" required /></label>
        <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required /></label>
      </div>
      <label>Title<input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Subject (optional)" /></label>
      <label>Message<textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} placeholder="Your question or feedback…" required /></label>
      {status === "error" && <p className="contact-err">{error}</p>}
      <button className="btn btn-primary" type="submit" disabled={status === "sending"}>
        {status === "sending" ? "Sending…" : "Send"}
      </button>
    </form>
  );
}

export default function HowToPage() {
  const [activeSection, setActiveSection] = useState<Section>("demo");

  return (
    <div className="tool-page active">
      <div className="tool-header">
        <div>
          <h1>Learn CAT</h1>
          <p className="tool-desc">
            What each tool does, what every field expects, and short demos to watch it in action.
          </p>
        </div>
      </div>

      <div className="tool-body">

        <div className="ana-section">
          <div className="tab-strip tab-strip-gap">
            {SECTIONS.map((s) => (
              <button
                key={s.value}
                className={`tab ${activeSection === s.value ? "active" : ""}`}
                onClick={() => setActiveSection(s.value)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>


        {/* ── Demo video ── */}
        {activeSection === "demo" && <DemoVideo />}

        {/* ── FAQ ── */}
        {activeSection === "faq" && (
          <>
            <div className="ana-section mt-16">
              <div className="ana-section-h">Frequently Asked Questions</div>
              <div className="faq-list">
                {FAQS.map((f, i) => (
                  <div className="faq-card" key={i}>
                    <div className="faq-q">{f.q}</div>
                    <div className="faq-a">{f.a}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="ana-section mt-16">
              <div className="ana-section-h">Questions or Concerns?</div>
              <div className="faq-contact">
                <p>Have a question that isn&apos;t answered here, found a bug, or want to give feedback? Send a message below and we&apos;ll get back to you.</p>
                <ContactForm />
              </div>
            </div>
          </>
        )}

      </div>
    </div>
  );
}
