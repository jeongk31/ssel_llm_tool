'use client'

import { useState } from "react";

type Section = "overview" | "coding" | "catgen" | "analysis" | "faq" | "demo";

interface Props {
  onNavigate?: (tool: "coding" | "catgen" | "analysis") => void;
}

const SECTIONS: { value: Section; label: string }[] = [
  // { value: "coding", label: "LLM Coding" },  // hidden for now
  { value: "demo", label: "Demo video" },
  { value: "faq", label: "FAQ" },
];

// FAQ content — each entry renders as its own card.
const FAQS: { q: string; a: React.ReactNode }[] = [
  {
    q: "What does ChAT do?",
    a: <>ChAT (Chat Annotation Toolkit) codes qualitative communication data into structured variables using LLMs. You upload a dataset, map columns into communication <strong>episodes</strong>, define a <strong>codebook</strong>, and one or more models code every episode according to your definitions.</>,
  },
  {
    q: "What is a communication episode?",
    a: <>It&apos;s the unit of analysis — a combination of messages exchanged through the same channel, or a collection of messages sent by one sender. Rows that share the identifier column(s) you tag are merged into one episode. You can also choose &ldquo;each row is its own episode.&rdquo;</>,
  },
  {
    q: "Do you store my dataset or my API keys?",
    a: <>No. Your API keys are <strong>never</strong> saved anywhere on our side — not in the database, logs, or browser storage; they live only in memory during a run and travel over HTTPS. Your uploaded file is written to a temporary working file only so it can be processed, and it&apos;s deleted when you reset, upload a new file, or after 24 hours. The database only stores anonymous usage metadata (never keys or data).</>,
  },
  {
    q: "How do I set up the codebook?",
    a: <>Each variable has a <strong>label</strong>, a <strong>type</strong> (Binary, Categorical, Numeric, Text), a <strong>level</strong> (per episode = one value per episode, or per sender = one value per participant), and a <strong>definition</strong>. For Binary/Categorical variables, define every allowed <strong>value</strong> with its own definition (plus optional examples and context) — that guidance is what the model uses to code.</>,
  },
  {
    q: "What do the variable types mean?",
    a: <><strong>Binary</strong> is a fixed 0/1 outcome; <strong>Categorical</strong> is your own named set of values; <strong>Numeric</strong> returns a number; <strong>Text</strong> returns free-form text. Numeric and Text have no fixed value list.</>,
  },
  {
    q: "What's the difference between per-episode and per-sender variables?",
    a: <><strong>Per episode</strong> produces one value for the whole episode. <strong>Per sender</strong> produces one value per participant and expands into a column per participant (e.g. <code>cooperation_P</code>, <code>cooperation_V1</code>). Declare participant names in the codebook so they match your sender column.</>,
  },
  {
    q: "What does “empty message handling” do?",
    a: <>It controls rows whose message is blank: <strong>ignore</strong> skips them entirely, <strong>code</strong> sends them to the model anyway, and the default records them as empty with an error flag. Pick whichever matches how you want blanks treated.</>,
  },
  {
    q: "How many models and runs should I use, and how are they combined?",
    a: <>You can add several provider/model pairs and run each multiple times. More runs reduce variance at the cost of more API calls. Results are combined by <strong>majority vote (mode)</strong> — best for categorical/binary — or <strong>average (mean)</strong> for numeric variables.</>,
  },
  {
    q: "What's the difference between “Script only” and “Run Coding”?",
    a: <><strong>Script only</strong> downloads a ready-to-run Python script (it runs the first configured model). <strong>Run Coding</strong> validates your keys and codes everything live in the app, streaming results and flagging out-of-range or failed rows so you can re-run just those.</>,
  },
  {
    q: "Why is my run showing errors for some rows?",
    a: <>Check the empty-message-handling setting and confirm your API key is valid for the selected model. After a run, the validation report lists the specific rows and lets you re-run only those.</>,
  },
  {
    q: "Which LLM providers are supported?",
    a: <>OpenAI, Google (Gemini), and DeepSeek. Each model slot takes its own API key.</>,
  },
  {
    q: "If I refresh the page, do I lose my work?",
    a: <>No — your dataset mapping, codebook, models, and settings are saved in your browser and restored automatically. The only thing not saved is your API key (for security), so you&apos;ll re-enter that. Use <strong>Reset</strong> to clear everything.</>,
  },
];

export const CODING_EXAMPLE_MULTI = `What we need you to do is code the messages that managers sent. Please mark a 1 for any comment that you think fits the category. You can code more than one category per message. Here are categories:

Suggested effort level:
- cat_1a_suggested_effort_0: Suggests choosing 0 hours
- cat_1b_suggested_effort_10: Suggests choosing 10 hours
- cat_1c_suggested_effort_20: Suggests choosing 20 hours
- cat_1d_suggested_effort_30: Suggests choosing 30 hours
- cat_1e_suggested_effort_40: Suggests choosing 40 hours
- cat_1f_ambiguous_suggestion: Ambiguous suggestion — positive about effort but not specific about a number

cat_2_explanation_for_effort: Provided an explanation for choosing suggested effort
cat_3_trust_statements: Statements about needing to trust each other
cat_4_positive_feedback: Positive feedback about previous outcome
cat_5_negative_feedback: Negative feedback about previous outcome
cat_6_social_banter: Social banter — friendly chatter not directly related to the game`;

export const CODING_EXAMPLE_SINGLE = `Your Coding Task
You will be shown each message sent by Player B. Classify each message into one of these categories:

1. Promise (P)
The message explicitly states an intention to choose "Roll" (i.e. to cooperate) if Player A chooses "In". This includes direct promises, commitments, or statements of intended action. Examples: "I will roll", "if you choose In, I will roll", "don't worry, I promise to roll."

2. Empty Talk (E)
The message does not express any promise or intention to Roll. This includes greetings, good luck wishes, jokes, general thoughts, comments irrelevant to the game decision, or messages expressing uncertainty about their intended action.

3. No Message (N)
No message was sent (blank or opted out). This category applies when Player B had the option to send a message but explicitly declined to do so.

If a message is difficult to classify, use your best judgment based on explicit content.

Overview of the Coding Procedure
Step 1: Read thoroughly the full message (or lack thereof) for each observation.
Step 2: Assign each message to one and only one of the three defined categories (P, E, N).
Step 3: Record the assigned category.`;

export const EXAMPLE_INSTRUCTIONS = `Parts, Rounds, and Firms: Stage II of the experiment will have two parts. In the first part there are 6 rounds and in the second part there are 12 rounds.

For the remainder of this experiment you will be randomly assigned to a firm consisting of five participants. You will be grouped with the same four other participants for all 18 rounds.

The following instructions are for the first part of Stage II — the first six rounds. You will receive instructions about any changes to the rules prior to the start of the second part of Stage II.

Task: There are five employees in each firm. Each round of the experiment can be thought of as a workweek. Each of the five employees spends 40 hours per week at their firm. In each round, there will be a bonus rate for all employees.

After seeing the bonus rate, each employee has to choose how to allocate their time between two activities, Activity A and Activity B. Specifically, each employee will be asked to choose how much time to devote to Activity A. The available choices are 0, 10, 20, 30, and 40 hours. Remaining hours go to Activity B. Weekly payoffs for employees depend on the bonus rate and the number of hours allocated to Activity A.

Employee payoffs: The payoff for an employee is determined in each round by the bonus rate (B), how many hours that employee spends on Activity A, and the minimum number of hours employees in their firm spend on Activity A. The employee's payoff is reduced by 5 ECUs per hour spent on Activity A. The employee also receives the bonus rate multiplied by the minimum number of hours any employee in their firm spends on Activity A. Each employee also automatically gets a flat payoff of 200 ECUs per round.

For example, suppose an employee spends 10 hours on Activity A. The other three workers in their firm spend 20, 40, and 40 hours, and the bonus rate equals 8. The minimum hours spent on Activity A is 10. The employee's payoff equals 200 − 5×10 + 8×10 = 230 ECUs.

Firm managers: In the second part of Stage II (Rounds 7–18), there will be a firm manager, selected from among the five employees and fixed for the rest of the experiment. At the beginning of each round, the manager can type a message to the other employees in the firm.

Restrictions on messages:
1. Do not identify yourself or send any information that could be used to identify you (age, race, gender, etc.).
2. Refrain from using obscene or offensive language.`;

// Source of every example instruction, coding scheme, and sample dataset shipped
// with this toolkit.
export const PAPER_CITATION_SHORT = `Charness & Dufwenberg (2006), “Promises and Partnerships,” Econometrica`;
export const PAPER_CITATION_FULL = `Charness, G., & Dufwenberg, M. (2006). Promises and Partnerships. Econometrica, 74(6), 1579–1601.`;

function AtAGlance({ items }: { items: { label: string; value: string }[] }) {
  return (
    <div className="howto-glance">
      {items.map((it) => (
        <div key={it.label} className="howto-glance-item">
          <span className="howto-glance-label">{it.label}</span>
          <span className="howto-glance-value">{it.value}</span>
        </div>
      ))}
    </div>
  );
}

function StepSection({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="ana-section mt-16">
      <div className="ana-section-h">
        <span className="howto-step-badge">{n}</span>
        {title}
      </div>
      <div className="tool-desc">{children}</div>
    </div>
  );
}

function DemoVideo() {
  const [failed, setFailed] = useState(false);
  return (
    <div className="ana-section mt-16">
      <div className="ana-section-h">Demo video</div>
      <div className="tool-desc">
        {failed ? (
          <div className="demo-placeholder">
            <div className="demo-placeholder-icon">▶</div>
            <p><strong>Demo video coming soon.</strong></p>
          </div>
        ) : (
          <video controls className="howto-video" onError={() => setFailed(true)}>
            <source src="/demos/coding-demo.mp4" type="video/mp4" />
          </video>
        )}
        <p className="howto-cite mt-12">A short walkthrough: uploading data, mapping columns into episodes, building a codebook, and running the coding.</p>
      </div>
    </div>
  );
}

function ContactForm() {
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

export default function HowToPage({ onNavigate }: Props) {
  const [activeSection, setActiveSection] = useState<Section>("demo");

  return (
    <div className="tool-page active">
      <div className="tool-header">
        <div>
          <h1>Learn ChAT</h1>
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

        {/* ── LLM Coding section — hidden for now ──
        {activeSection === "coding" && (
          <>
            <div className="ana-section mt-16">
              <div className="ana-section-h">What this tool does</div>
              <div className="tool-desc">
                <p>
                  Upload a dataset, describe your experiment, define a codebook, and have one or
                  more LLMs code every row according to your instructions.
                </p>
                <AtAGlance
                  items={[
                    { label: "Input", value: "CSV or Excel file" },
                    { label: "You configure", value: "Instructions, codebook, models" },
                    { label: "Output", value: "Coded CSV + Python script" },
                  ]}
                />
              </div>
              <div className="howto-warning mt-12">
                <strong>Citation.</strong> All example instructions, coding schemes, and sample data
                used throughout ChAT are drawn from {PAPER_CITATION_FULL}
              </div>
            </div>

            <StepSection n={1} title="Upload & Map Dataset">
              <p>
                A <strong>communication episode</strong> is a combination of messages exchanged through the same channel — or a collection of messages sent by one sender — and it's what the model codes. Upload a CSV or Excel file, then map your columns in the popup: tag the <strong>message</strong> column, the <strong>identifier(s)</strong> that define one episode (or choose “each row is its own episode”), and optionally the <strong>sender</strong> identity, the message <strong>order</strong>, and any <strong>context</strong> columns. Rows that share an identifier combination are merged into one tagged episode, shown in the preprocessed preview.
              </p>
            </StepSection>

            <StepSection n={2} title="Codebook">
              <p>
                The codebook is the list of variables to code. Each variable has a <strong>label</strong>, a <strong>type</strong> (Binary, Categorical, Numeric, Text), a <strong>level</strong> (per episode = one value per episode, or per sender = one value per participant), and a <strong>definition</strong> of the category. For every allowed <strong>coded value</strong> you add, give a definition too — plus optional <strong>examples</strong> and <strong>context</strong>. All the coding guidance now lives in these definitions.
              </p>
              <p className="mt-12"><strong>Example coding scheme</strong> (single-label — one category per episode):</p>
              <pre className="howto-example">{CODING_EXAMPLE_SINGLE}</pre>
              <p className="mt-12"><strong>Multi-label example</strong> (each category is its own binary variable, marked when it applies):</p>
              <pre className="howto-example">{CODING_EXAMPLE_MULTI}</pre>
              <p className="howto-cite">Coding schemes adapted from {PAPER_CITATION_SHORT}.</p>
              <div className="howto-warning mt-12">
                <strong>Per-sender variables</strong> expand into one output column per participant (e.g. <code>cooperation_P</code>, <code>cooperation_V1</code>). Declare the participant names in the codebook so they match your sender column.
              </div>
            </StepSection>

            <StepSection n={3} title="Experiment Instructions">
              <p>
                Paste the full instructions participants received — tasks, roles, payoffs, and communication rules. Include any extra context such as examples or on-screen prompts. Missing context is the most common cause of inconsistent coding.
              </p>
              <p className="mt-12"><strong>Example:</strong></p>
              <pre className="howto-example">{EXAMPLE_INSTRUCTIONS}</pre>
              <p className="howto-cite">Experiment instructions adapted from {PAPER_CITATION_SHORT}.</p>
            </StepSection>

            <StepSection n={4} title="Models & Aggregation">
              <div className="catgen-field">
                <span className="catgen-label">Models:</span>
                Add one or more provider/model pairs, each with your own API key. Supported providers are OpenAI, Google (Gemini), and DeepSeek.
              </div>
              <div className="catgen-field">
                <span className="catgen-label">Runs per model:</span>
                Run each model multiple times per row to enable voting. More runs reduce variance at the cost of more API calls.
              </div>
              <div className="catgen-field">
                <span className="catgen-label">Aggregation:</span>
                Combine multiple models or runs by majority vote (mode) or average (mean). Mode is recommended for categorical and binary variables; mean for numeric ones.
              </div>
              <p className="mt-12">
                Expand <strong>Tuning</strong> on any model slot to adjust temperature, top-p, and max tokens per model.
              </p>
            </StepSection>

            <div className="ana-section mt-16">
              <div className="ana-section-h">Running it</div>
              <div className="tool-desc">
                <p>
                  <strong>Script only</strong> generates a downloadable Python script without running anything. <strong>Run Coding</strong> validates your API keys, then streams results live as each row is processed. When it finishes, a validation report flags out-of-range or failed rows so you can re-run just those.
                </p>
              </div>
            </div>

            <div className="ana-section mt-16">
              <div className="ana-section-h">Demo video</div>
              <div className="tool-desc">
                <video controls className="howto-video">
                  <source src="/demos/coding-demo.mp4" type="video/mp4" />
                </video>
              </div>
            </div>

            {onNavigate && (
              <button className="btn btn-primary mt-16 mb-16" onClick={() => onNavigate("coding")}>
                Go to LLM Coding
              </button>
            )}
          </>
        )}
        ── end LLM Coding section ── */}

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
              <div className="ana-section-h">Questions or concerns?</div>
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