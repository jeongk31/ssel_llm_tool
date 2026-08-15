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
    q: "What does CAT do?",
    a: <>CAT (Communication Annotation Tool) codes qualitative communication data into structured variables using LLMs. You upload a dataset, map columns into communication <strong>episodes</strong>, define a <strong>codebook</strong>, and one or more models code every episode according to your definitions.</>,
  },
  {
    q: "What is a communication episode?",
    a: <>It&apos;s the unit of analysis — a combination of messages exchanged through the same channel, or a collection of messages sent by one sender. Rows that share the identifier column(s) you tag are merged into one episode. You can also choose &ldquo;each row is its own episode.&rdquo;</>,
  },
  {
    q: "Do you store my dataset or my API keys?",
    a: <>Your API keys are <strong>never</strong> saved — not in the database, logs, or browser storage; they live only in memory during a run and travel over HTTPS. To restore your work after a refresh or browser restart, CAT keeps a copy of the current dataset in this browser on your device. It is not stored in CAT&apos;s database. The server uses a temporary working copy. Reset and successful dataset replacement request best-effort immediate cleanup; scheduled cleanup removes temporary files after they pass the 24-hour threshold. <strong>Reset</strong> also removes the browser copy. Usage metadata is <strong>not anonymous</strong>: the database records a browser session identifier, IP address, best-effort location, user agent, referrer, event time, and run configuration such as selected providers/models and run, variable, row, and episode counts. It never stores API keys or dataset contents.</>,
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
    a: <>It controls fully empty communication episodes. <strong>Ignore</strong> skips the model call, while retaining the corresponding source rows with blank code cells in the primary CSV. <strong>Code as value</strong> sends the empty episode to the model so the codebook can define how it should be classified.</>,
  },
  {
    q: "How many models and runs should I use, and how are they combined?",
    a: <>You can add several provider/model pairs and run each multiple times. More runs reduce variance at the cost of more API calls. In the codebook, choose separately for each variable whether its results use <strong>majority vote (mode)</strong> or <strong>average (mean)</strong>.</>,
  },
  {
    q: "What's the difference between “Generate package” and “Run Coding”?",
    a: <><strong>Generate package</strong> downloads a ZIP containing the script, three CSV files (source rows, exact preprocessed episodes, and their row map), a README, and requirements. You only need to select its provider and model; no API key is required to generate the package because the script reads <code>CAT_API_KEY</code> or prompts securely at runtime. The script uses the first selected provider and model for one call per episode. <strong>Run Coding</strong> requires and validates the keys for all configured models, then codes every episode live in the app using all configured models and runs.</>,
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
  return (
    <div className="ana-section mt-16">
      <div className="ana-section-h">Demo video</div>
      <div className="tool-desc">
        <div className="demo-placeholder">
          <div className="demo-placeholder-icon">▶</div>
          <p><strong>Updated CAT demo video coming soon.</strong></p>
        </div>
        <p className="howto-cite mt-12">The previous recording has been withdrawn while the CAT-branded walkthrough is prepared.</p>
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

export default function HowToPage({ onNavigate }: Props) {
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

        {/* ── LLM Coding section — hidden for now ──
        {activeSection === "coding" && (
          <>
            <div className="ana-section mt-16">
              <div className="ana-section-h">What this tool does</div>
              <div className="tool-desc">
                <p>
                  Upload a dataset, describe your experiment, define a codebook, and have one or
                  more LLMs code every communication episode according to your instructions.
                </p>
                <AtAGlance
                  items={[
                    { label: "Input", value: "CSV or Excel file" },
                    { label: "You configure", value: "Instructions, codebook, models" },
                    { label: "Output", value: "Coded CSV datasets + Python package" },
                  ]}
                />
              </div>
              <div className="howto-warning mt-12">
                <strong>Citation.</strong> All example instructions, coding schemes, and sample data
                used throughout CAT are drawn from {PAPER_CITATION_FULL}
              </div>
            </div>

            <StepSection n={1} title="Upload & Map Dataset">
              <p>
                A <strong>communication episode</strong> is a combination of messages exchanged through the same channel — or a collection of messages sent by one sender — and it&apos;s what the model codes. Upload a CSV or Excel file, then map your columns in the popup: tag the <strong>message</strong> column, the <strong>identifier(s)</strong> that define one episode (or choose “each row is its own episode”), and optionally the <strong>sender</strong> identity, the message <strong>order</strong>, and any <strong>context</strong> columns. Tied Order values retain their uploaded row order. Every selected Context field must match exactly within an episode; CAT blocks the mapping until inconsistencies are corrected or the field is unselected. The grouped episodes then appear in the preprocessed preview.
              </p>
            </StepSection>

            <StepSection n={2} title="Codebook">
              <p>
                The codebook is the list of variables to code. Each variable has a <strong>label</strong>, a <strong>type</strong> (Binary, Categorical, Numeric, Text), a <strong>level</strong> (per episode or per sender), a <strong>definition</strong>, and an <strong>aggregation method</strong>. Choose majority vote for label outputs or average for numeric outputs. For every allowed <strong>coded value</strong>, provide a definition plus any useful examples and context.
              </p>
              <p className="mt-12"><strong>Example coding scheme</strong> (single-label — one category per episode):</p>
              <pre className="howto-example">{CODING_EXAMPLE_SINGLE}</pre>
              <p className="mt-12"><strong>Multi-label example</strong> (each category is its own binary variable, marked when it applies):</p>
              <pre className="howto-example">{CODING_EXAMPLE_MULTI}</pre>
              <p className="howto-cite">Coding schemes adapted from {PAPER_CITATION_SHORT}.</p>
              <div className="howto-warning mt-12">
                <strong>Per-sender variables</strong> expand into one output column per detected sender (e.g. <code>cooperation_P</code>, <code>cooperation_V1</code>). CAT obtains these names from the mapped Sender column and asks you to verify the list; blank Sender values must be corrected in the source dataset.
              </div>
            </StepSection>

            <StepSection n={3} title="Experiment Instructions">
              <p>
                Paste the full instructions participants received — tasks, roles, payoffs, and communication rules. Include any extra context such as examples or on-screen prompts. Missing context is the most common cause of inconsistent coding.
              </p>
              <p className="mt-12">If the instructions are in a PDF, use <strong>Import from PDF</strong>. A supported LLM provider and model converts the document—including figures and tables—into text that you can review and edit before using.</p>
              <p className="mt-12"><strong>Example:</strong></p>
              <pre className="howto-example">{EXAMPLE_INSTRUCTIONS}</pre>
              <p className="howto-cite">Experiment instructions adapted from {PAPER_CITATION_SHORT}.</p>
            </StepSection>

            <StepSection n={4} title="Models & Runs">
              <div className="howto-warning mb-12">
                <strong>Execution modes differ.</strong> <strong>Run Coding</strong> uses every configured model and run. The downloaded package currently uses the first selected provider and model for one call per episode; experienced users can modify the generated Python script to change parameters or create a repeated- or multi-model workflow.
              </div>
              <div className="catgen-field">
                <span className="catgen-label">Models:</span>
                Add one or more provider/model pairs. Enter an API key for every model used in browser execution. No key is required to generate the local package; its script obtains the key at runtime. Supported providers are OpenAI, Google (Gemini), DeepSeek, Anthropic (Claude), and xAI (Grok).
              </div>
              <div className="catgen-field">
                <span className="catgen-label">Runs per model:</span>
                Run each model multiple times per episode to enable aggregation. More runs cost more API calls.
              </div>
              <div className="catgen-field"><span className="catgen-label">Aggregation:</span> Set separately for each variable in the codebook.</div>
              <p className="mt-12">
                Expand <strong>Tuning</strong> on any model slot to adjust temperature, top-p, and max tokens per model.
              </p>
            </StepSection>

            <div className="ana-section mt-16">
              <div className="ana-section-h">Running it</div>
              <div className="tool-desc">
                <p>
                  <strong>Generate package</strong> creates a ZIP with the Python script, three CSV files containing the source rows, exact preprocessed episodes, and their row map, plus a README and requirements. It can be generated without entering an API key; the local script reads <code>CAT_API_KEY</code> or prompts securely when it starts. <strong>Run Coding</strong> validates your API keys, then streams results as each episode is processed. When it finishes, a validation report flags out-of-range or failed episodes so you can re-run just those. The primary result download is a CSV with every original row and column plus the final aggregate codes, repeated across rows belonging to the same episode. A separate optional CSV provides one row per preprocessed episode, while detailed model and run outputs remain a distinct download when available.
                </p>
              </div>
            </div>

            <div className="ana-section mt-16">
              <div className="ana-section-h">Demo video</div>
              <div className="tool-desc">
                <video controls preload="metadata" playsInline className="howto-video">
                  <source src={DEMO_VIDEO_CDN_SRC} type="video/mp4" />
                  <source src={DEMO_VIDEO_LOCAL_SRC} type="video/mp4" />
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
