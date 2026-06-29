'use client'

import { useState } from "react";

type Section = "overview" | "coding" | "catgen" | "analysis" | "faq";

interface Props {
  onNavigate?: (tool: "coding" | "catgen" | "analysis") => void;
}

const SECTIONS: { value: Section; label: string }[] = [
  { value: "coding", label: "LLM Coding" },
  { value: "faq", label: "FAQ" },
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

export default function HowToPage({ onNavigate }: Props) {
  const [activeSection, setActiveSection] = useState<Section>("coding");

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

        {/* ── LLM Coding ── */}
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
                used throughout this toolkit are drawn from {PAPER_CITATION_FULL}
              </div>
            </div>

            <StepSection n={1} title="Coding Instructions & Codebook">
              <p>
                Tell the model how to apply the codebook: <strong>single-label</strong> (one category per row) or <strong>multi-label</strong> (all that apply). Define each category and how to handle empty messages.
              </p>

              <p className="mt-12"><strong>Multi-label example</strong> (mark every category that applies):</p>
              <pre className="howto-example">{CODING_EXAMPLE_MULTI}</pre>

              <p className="mt-12"><strong>Single-label example</strong> (assign exactly one category):</p>
              <pre className="howto-example">{CODING_EXAMPLE_SINGLE}</pre>
              <p className="howto-cite">Coding schemes adapted from {PAPER_CITATION_SHORT}.</p>

              <p className="mt-12">
                The codebook is the list of variables to code. Each entry needs a label, a type, a definition, and (for every type except text) a set of allowed coded values. Supported variable types: <strong>Binary</strong>, <strong>Categorical</strong>, <strong>Ordinal</strong>, <strong>Numeric</strong>, and <strong>Text</strong>.
              </p>
              <div className="howto-warning mt-12">
                <strong>Keep names and values in sync.</strong> The label, type, and allowed values you set here must match what you describe in your coding instructions word-for-word.
              </div>
            </StepSection>

            <StepSection n={2} title="Experiment Instructions">
              <p>
                Paste the full instructions participants received — tasks, roles, payoffs, and communication rules. Include any extra context such as examples or on-screen prompts. Missing context is the most common cause of inconsistent coding.
              </p>
              <p className="mt-12"><strong>Example:</strong></p>
              <pre className="howto-example">{EXAMPLE_INSTRUCTIONS}</pre>
              <p className="howto-cite">Experiment instructions adapted from {PAPER_CITATION_SHORT}.</p>
            </StepSection>

            <StepSection n={3} title="Upload Dataset">
              <p>
                Upload a CSV or Excel file with the data you want coded. Include an ID column that uniquely identifies each row and the column containing the text to code. Don't include columns for the variables you want coded — define those in the Codebook.
              </p>
            </StepSection>

            <StepSection n={4} title="Select Column">
              <p>
                Pick the column that contains the text to code from the dropdown of column names.
              </p>
            </StepSection>

            <StepSection n={5} title="Models & Aggregation">
              <div className="catgen-field">
                <span className="catgen-label">Models:</span>
                Add one or more provider/model pairs, each with your own API key. Supported providers are OpenAI, Anthropic, Google (Gemini), DeepSeek, Mistral, and Together AI.
              </div>
              <div className="catgen-field">
                <span className="catgen-label">Runs per model:</span>
                Run each model multiple times per row to enable voting. More runs reduce variance at the cost of more API calls.
              </div>
              <div className="catgen-field">
                <span className="catgen-label">Aggregation:</span>
                Combine multiple models or runs by majority vote (mode) or average (mean). Mode is recommended for categorical and binary variables; mean for numeric or ordinal ones.
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