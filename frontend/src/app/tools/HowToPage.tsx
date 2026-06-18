'use client'

import { useState } from "react";

type Section = "overview" | "encoding" | "catgen" | "analysis" | "faq";

interface Props {
  onNavigate?: (tool: "encoding" | "catgen" | "analysis") => void;
}

const SECTIONS: { value: Section; label: string }[] = [
  { value: "overview", label: "Overview" },
  { value: "encoding", label: "LLM Encoding" },
  { value: "catgen", label: "Category Generator" },
  { value: "analysis", label: "Results Analysis" },
  { value: "faq", label: "FAQ" },
];

interface ChecklistItem {
  title: string;
  points: string[];
}

const EXPERIMENT_CHECKLIST: ChecklistItem[] = [
  {
    title: "Context (task set-up)",
    points: [
      "What the experiment is about (domain/scenario)",
      "What participants are doing (task type)",
      "Whether the task is repeated or one-shot",
      "The unit of interaction (rounds, trials, messages, episodes)",
    ],
  },
  {
    title: "Participants & roles",
    points: [
      "Number of participants/agents per group",
      "Role types (e.g. A/B, manager, worker)",
      "Whether roles are fixed or randomly assigned each iteration",
      "Any asymmetries in power, information, or function",
    ],
  },
  {
    title: "Decisions",
    points: [
      "All allowed choices per role",
      "Input format (numbers, categories, text, ranges)",
      "Timing of decisions (simultaneous vs. sequential)",
    ],
  },
  {
    title: "Information structure",
    points: [
      "What is visible before decisions",
      "What is hidden (other actions, randomness, outcomes) and any uncertainty",
    ],
  },
  {
    title: "Outcome / payoff rules",
    points: [
      "Mapping from actions to outcomes or payoffs",
      "Any formulas, thresholds, or aggregation rules",
      "Individual vs. group-level effects",
      "Fixed or base pay, if applicable",
    ],
  },
  {
    title: "Timing & sequence",
    points: [
      "Number of rounds or stages",
      "What changes or repeats over time",
      "Order of decisions, if sequential",
    ],
  },
  {
    title: "Communication",
    points: [
      "Who can communicate with whom",
      "When communication happens, and whether it's public or private",
      "Restrictions on identity, content, or tone",
    ],
  },
  {
    title: "Constraints & rules",
    points: [
      "Forbidden actions or content",
      "Identity disclosure rules",
      "Penalties or enforcement mechanisms",
    ],
  },
];

const EXAMPLE_INSTRUCTIONS = `Parts, Rounds, and Firms: Stage II of the experiment will have two parts. In the first part there are 6 rounds and in the second part there are 12 rounds.

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

const CODING_CHECKLIST: ChecklistItem[] = [
  {
    title: "State the coding task",
    points: [
      "What is being coded (messages, responses, transcripts)",
      "What kind of judgment the model is making — this is distinct from the experiment background, which belongs in Experiment Instructions",
    ],
  },
  {
    title: "Single-label or multi-label",
    points: [
      "Single-label: assign exactly one category per message",
      "Multi-label: mark every category that applies — a message can match more than one",
      "State this explicitly. It's the single biggest source of inconsistent coding when left implicit",
    ],
  },
  {
    title: "Define every category",
    points: [
      "A short definition of what the category captures",
      "Example phrases that would and wouldn't qualify, where possible — definitions alone are the minimum bar, examples make borderline cases far more consistent",
    ],
  },
  {
    title: "Handle ambiguity and edge cases",
    points: [
      "What to do when a message is hard to classify (e.g. \"use your best judgment based on explicit content\")",
      "Whether an ambiguous case gets its own category, or falls back to a default",
      "How to treat empty or missing messages, if not already set in the Empty message handling option above",
    ],
  },
  {
    title: "Coding procedure (optional)",
    points: [
      "A short, explicit step sequence — read, assign, record — helps especially for single-label tasks",
      "Not required if the rule is simple, but useful when the task has multiple sequential decisions",
    ],
  },
];

const CODING_EXAMPLE_MULTI = `What we need you to do is code the messages that managers sent. Please mark a 1 for any comment that you think fits the category. You can code more than one category per message. Here are categories:

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

const CODING_EXAMPLE_SINGLE = `Your Coding Task
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

const CODEBOOK_TYPE_EXAMPLES: { type: string; example: ChecklistItem }[] = [
  {
    type: "binary",
    example: {
      title: "Binary",
      points: [
        "Label: Promise · Definition: Message states an intention to cooperate · Values: 0, 1",
        "Use for yes/no, present/absent judgments",
      ],
    },
  },
  {
    type: "categorical",
    example: {
      title: "Categorical",
      points: [
        "Label: Tone · Definition: Overall tone of the message · Values: positive, neutral, negative",
        "Use for a fixed set of named, unordered labels",
      ],
    },
  },
  {
    type: "ordinal",
    example: {
      title: "Ordinal",
      points: [
        "Label: Commitment_Strength · Definition: How strongly the message commits to an action · Values: low, medium, high",
        "Use for ordered labels where rank matters but spacing doesn't",
      ],
    },
  },
  {
    type: "numeric",
    example: {
      title: "Numeric",
      points: [
        "Label: Suggested_Effort · Definition: Effort level suggested in the message · Values: 0, 10, 20, 30, 40",
        "Use for counts, scales, or any value meant to be averaged or compared mathematically",
      ],
    },
  },
  {
    type: "text",
    example: {
      title: "Text",
      points: [
        "Label: Key_Phrase · Definition: The exact phrase that triggered this code · Values: free text",
        "Use for open-ended extraction rather than a fixed set of labels",
      ],
    },
  },
];

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

function Collapsible({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="howto-collapsible">
      <button className="howto-collapsible-head" onClick={() => setOpen((o) => !o)} type="button">
        <svg
          className={`chevron ${open ? "open" : ""}`}
          viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"
        >
          <path d="M4 6l4 4 4-4" />
        </svg>
        {label}
      </button>
      {open && <div className="howto-collapsible-body">{children}</div>}
    </div>
  );
}

export default function HowToPage({ onNavigate }: Props) {
  const [activeSection, setActiveSection] = useState<Section>("overview");

  return (
    <div className="tool-page active">
      <div className="tool-header">
        <div>
          <h1>Learn the Toolkit</h1>
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

        {/* ── Overview ── */}
        {activeSection === "overview" && (
          <>
            <div className="ana-section mt-16">
              <div className="ana-section-h">What this toolkit is for</div>
              <div className="tool-desc">
                <p>
                  The LLM Measurement Toolkit turns unstructured text — messages, transcripts,
                  open-ended responses — into structured, codable data using one or more language
                  models. It's built around three tools that usually get used in sequence, though
                  each one also works on its own.
                </p>
              </div>
            </div>

            <div className="ana-section mt-16">
              <div className="ana-section-h">The three tools</div>
              <div className="tool-desc">
                <div className="catgen-field">
                  <span className="catgen-label">Category Generator:</span>
                  Start here without a codebook. Upload your dataset, describe your research
                  goals and hypothesis, and get a draft set of categories to review and refine.
                </div>
                <div className="catgen-field">
                  <span className="catgen-label">LLM Encoding:</span>
                  The core tool. Upload your dataset, attach a codebook — your own or one from
                  Category Generator — and have one or more LLMs encode every row.
                </div>
                <div className="catgen-field">
                  <span className="catgen-label">Results Analysis:</span>
                  Upload results from multiple coders, human or LLM, and measure how well they
                  agree with each other.
                </div>
              </div>
            </div>

            <div className="ana-section mt-16">
              <div className="ana-section-h">Suggested workflow</div>
              <div className="tool-desc">
                <p>
                  No codebook yet? Draft one in <strong>Category Generator</strong>. Bring it
                  into <strong>LLM Encoding</strong> with your dataset and run the coding. If you
                  also have human-coded data, or want to compare multiple models, send the
                  outputs to <strong>Results Analysis</strong> to measure agreement.
                </p>
              </div>
            </div>
          </>
        )}

        {/* ── LLM Encoding ── */}
        {activeSection === "encoding" && (
          <>
            <div className="ana-section mt-16">
              <div className="ana-section-h">What this tool does</div>
              <div className="tool-desc">
                <p>
                  Upload a dataset, describe your experiment, define a codebook, and have one or
                  more LLMs encode every row according to your instructions.
                </p>
                <AtAGlance
                  items={[
                    { label: "Input", value: "CSV or Excel file" },
                    { label: "You configure", value: "Instructions, codebook, models" },
                    { label: "Output", value: "Encoded CSV + Python script" },
                  ]}
                />
              </div>
            </div>

            <StepSection n={1} title="Upload Dataset">
              <p>
                Upload a CSV or Excel file with the data you want coded. After uploading, you'll
                see a preview of the first few rows and a column count.
              </p>
              <p>
                Include identifying columns — a session ID and a message ID work well — and a
                column with the messages themselves. <strong>Don't</strong> include columns with
                already-coded data or empty placeholder columns for the variables you want coded.
                Those get defined in the Codebook step, and the tool creates them for you.
              </p>
            </StepSection>

            <StepSection n={2} title="Column & Rows">
              <p>
                Pick the column that contains the text to encode from the dropdown of column names.
              </p>
              <p>
                Optionally restrict the run to specific rows, e.g. <code>1-5, 8, 12-15</code>.
                Use a dash for ranges and commas to separate ranges or single rows. Leave this
                blank to encode the whole dataset.
              </p>
            </StepSection>

            <StepSection n={3} title="Experiment Instructions">
              <p>
                Give the model full context for what it's reading. Missing pieces here are the
                most common cause of inconsistent encoding, so work through each item below.
              </p>

              <div className="howto-checklist">
                {EXPERIMENT_CHECKLIST.map((item, i) => (
                  <div key={item.title} className="howto-checklist-item">
                    <div className="howto-checklist-title">
                      <span className="howto-step-badge howto-step-badge-sm">{i + 1}</span>
                      {item.title}
                    </div>
                    <ul className="howto-checklist-points">
                      {item.points.map((p) => (
                        <li key={p}>{p}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>

              <Collapsible label="Show a worked example">
                <pre className="howto-example">{EXAMPLE_INSTRUCTIONS}</pre>
              </Collapsible>
            </StepSection>

            <StepSection n={4} title="Encoding Instructions">
            <p>
                Tell the model exactly how to apply the codebook to each message. The two examples below
                show the same task structured two different ways (multi-label and single-label) which is
                the most important decision to get right here.
            </p>

            <div className="howto-checklist">
                {CODING_CHECKLIST.map((item, i) => (
                <div key={item.title} className="howto-checklist-item">
                    <div className="howto-checklist-title">
                    <span className="howto-step-badge howto-step-badge-sm">{i + 1}</span>
                    {item.title}
                    </div>
                    <ul className="howto-checklist-points">
                    {item.points.map((p) => (
                        <li key={p}>{p}</li>
                    ))}
                    </ul>
                </div>
                ))}
            </div>

            <Collapsible label="Show a multi-label example (mark every category that applies)">
                <pre className="howto-example">{CODING_EXAMPLE_MULTI}</pre>
            </Collapsible>

            <Collapsible label="Show a single-label example (assign exactly one category)">
                <pre className="howto-example">{CODING_EXAMPLE_SINGLE}</pre>
            </Collapsible>

            <div className="catgen-field mt-12">
                <span className="catgen-label">Empty message handling:</span>
                Set in the Encoding Instructions step above, but it depends on what you define here.
                The default is <strong>ignore</strong> — empty rows are skipped entirely and excluded from
                the output. <strong>Error</strong> flags empty rows without attempting to code them.
                <strong> Encode as value</strong> sends the empty row to the model anyway, so the value it
                assigns must already exist as one of this variable's allowed values — for example, a
                No_Message category with value <code>N</code> defined right here in the codebook.
            </div>

            </StepSection>

            <StepSection n={5} title="Codebook">
            <p>
                The list of variables to code. Each entry needs a label, a type, a definition, and (for
                every type except text) a set of allowed encoded values.
            </p>

            <div className="howto-checklist">
                {CODEBOOK_TYPE_EXAMPLES.map((t, i) => (
                <div key={t.type} className="howto-checklist-item">
                    <div className="howto-checklist-title">
                    <span className="howto-step-badge howto-step-badge-sm">{i + 1}</span>
                    {t.example.title}
                    </div>
                    <ul className="howto-checklist-points">
                    {t.example.points.map((p) => (
                        <li key={p}>{p}</li>
                    ))}
                    </ul>
                </div>
                ))}
            </div>

            <div className="howto-warning mt-12">
                <strong>Keep names and values in sync.</strong> The label, type, and allowed values you set
                here must match what you described in Experiment Instructions and Encoding Instructions
                word-for-word. If your encoding instructions say a category encodes as <code>P/E/N</code>
                but the codebook lists <code>0,1</code>, the model has conflicting rules to follow and
                results will be inconsistent.
            </div>
            </StepSection>

            <StepSection n={6} title="Models & Voting">
              <div className="catgen-field">
                <span className="catgen-label">Models:</span>
                Add one or more provider/model pairs, each with your own API key for the model.
              </div>
              <div className="catgen-field">
                <span className="catgen-label">Runs per model:</span>
                Run each model multiple times per row to enable voting.
              </div>
              <div className="catgen-field">
                <span className="catgen-label">Aggregation:</span>
                Combine multiple models or runs by majority vote (mode) or average (mean).
              </div>
            </StepSection>

            <div className="ana-section mt-16">
              <div className="ana-section-h">Running it</div>
              <div className="tool-desc">
                <p>
                  <strong>Script only</strong> generates a downloadable Python script without
                  running anything. <strong>Run Encoding</strong> validates your API keys, then
                  streams results live as each row is processed. When it finishes, a validation
                  report flags out-of-range or failed rows so you can re-run just those rows.
                </p>
              </div>
            </div>

            <div className="ana-section mt-16">
              <div className="ana-section-h">Demo video</div>
              <div className="tool-desc">
                <video controls className="howto-video">
                  <source src="/demos/encoding-demo.mp4" type="video/mp4" />
                </video>
              </div>
            </div>

            {onNavigate && (
            <button className="btn btn-primary mt-16 mb-16" onClick={() => onNavigate("encoding")}>
                Go to LLM Encoding
            </button>
            )}
          </>
        )}

        {/* ── Category Generator ── */}
        {activeSection === "catgen" && (
          <>
            <div className="ana-section mt-16">
              <div className="ana-section-h">What this tool does</div>
              <div className="tool-desc">
                <p>
                  Generate a starting codebook of categories automatically from your research
                  goals, hypothesis, and a sample of your data.
                </p>
                <AtAGlance
                  items={[
                    { label: "Input", value: "Goals, hypothesis, sample data" },
                    { label: "You configure", value: "Output type, target count, domain" },
                    { label: "Output", value: "Draft codebook of categories" },
                  ]}
                />
              </div>
            </div>

            <StepSection n={1} title="Research Context">
              <div className="catgen-field">
                <span className="catgen-label">Goals:</span>
                What you're trying to measure or classify.
              </div>
              <div className="catgen-field">
                <span className="catgen-label">Hypothesis:</span>
                Your expected relationship between variables — this shapes relevant, testable
                categories instead of generic ones.
              </div>
            </StepSection>

            <StepSection n={2} title="Generation Settings">
              <div className="catgen-field">
                <span className="catgen-label">Output type:</span>
                Classify, Tag, Rate, or Extract — determines the structure of generated
                categories (e.g. include/exclude criteria vs. a numeric scale with anchors).
              </div>
              <div className="catgen-field">
                <span className="catgen-label">Target count:</span>
                Roughly how many categories to generate.
              </div>
              <div className="catgen-field">
                <span className="catgen-label">Domain:</span>
                The field or context this coding scheme belongs to, e.g. psychotherapy or
                negotiation research.
              </div>
            </StepSection>

            <StepSection n={3} title="References">
              <p>
                Optional. Any existing coding framework you want the model to draw from, such as
                an established behavioral coding scheme.
              </p>
            </StepSection>

            <StepSection n={4} title="Sample Data">
              <p>
                Optional, but real examples meaningfully improve category quality. Upload a
                dataset and pick the message column, or paste in a few example messages directly.
              </p>
            </StepSection>

            <div className="ana-section mt-16">
              <div className="ana-section-h">Demo video</div>
              <div className="tool-desc">
                <video controls className="howto-video">
                  <source src="/demos/catgen-demo.mp4" type="video/mp4" />
                </video>
              </div>
            </div>

            {onNavigate && (
              <button className="btn btn-primary mt-16" onClick={() => onNavigate("catgen")}>
                Go to Category Generator
              </button>
            )}
          </>
        )}

        {/* ── Results Analysis ── */}
        {activeSection === "analysis" && (
          <>
            <div className="ana-section mt-16">
              <div className="ana-section-h">What this tool does</div>
              <div className="tool-desc">
                <p>
                  Upload results from multiple human coders and/or LLMs, match them on shared
                  episode columns, and compute inter-rater agreement.
                </p>
                <AtAGlance
                  items={[
                    { label: "Input", value: "2+ rater result files" },
                    { label: "You configure", value: "Episode columns, analysis variables" },
                    { label: "Output", value: "Agreement metrics, per-pair breakdown" },
                  ]}
                />
              </div>
            </div>

            <StepSection n={1} title="Upload Raters">
              <p>
                Upload one file per rater, sorted into Human Coders and LLM Results. Each file
                needs the same episode-identifying columns and the variables you want compared.
              </p>
            </StepSection>

            <StepSection n={2} title="Configuration">
              <div className="catgen-field">
                <span className="catgen-label">Episode columns:</span>
                The column(s) that uniquely identify a row across all rater files — e.g.
                participant ID or episode number.
              </div>
              <div className="catgen-field">
                <span className="catgen-label">Analysis variables:</span>
                The columns you want agreement computed on.
              </div>
            </StepSection>

            <StepSection n={3} title="Cross-check & Compute">
              <p>
                <strong>Cross-check files</strong> verifies all uploaded files share the expected
                columns and a common set of episodes before anything is computed. Once that
                passes, <strong>Compute Agreement</strong> produces overall metrics plus a
                detailed per-variable, per-pair breakdown — percent agreement, Cohen's Kappa, and
                Gwet's AC1.
              </p>
            </StepSection>

            <div className="ana-section mt-16">
              <div className="ana-section-h">Demo video</div>
              <div className="tool-desc">
                <video controls className="howto-video">
                  <source src="/demos/analysis-demo.mp4" type="video/mp4" />
                </video>
              </div>
            </div>

            {onNavigate && (
              <button className="btn btn-primary mt-16" onClick={() => onNavigate("analysis")}>
                Go to Results Analysis
              </button>
            )}
          </>
        )}

        {/* ── FAQ ── */}
        {activeSection === "faq" && (
          <div className="ana-section mt-16">
            <div className="ana-section-h">Frequently Asked Questions</div>
            <div className="tool-desc">
              <div className="catgen-field">
                <span className="catgen-label">Why is my run showing errors for some rows?</span>
                Check the empty message handling setting and confirm your API key is valid for
                the selected model.
              </div>
              <div className="catgen-field">
                <span className="catgen-label">Why can't I compute agreement?</span>
                You need at least two raters uploaded, episode columns selected, and analysis
                variables selected, with a successful cross-check first.
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}