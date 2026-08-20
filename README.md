# CAT — Communication Annotation Tool

CAT is a web application developed by the Social Science Experimental Laboratory at
NYU Abu Dhabi for coding free-form communication with large language models (LLMs).
It is designed primarily for communication data from economic experiments, although
the workflow can support other structured content-analysis tasks.

Researchers can upload a dataset, define communication episodes, create a coding
manual, provide experimental context, run one or more LLMs, review validation results,
and download coded data without writing application code.

## Main features

- Upload CSV or Excel (`.csv`, `.xlsx`, or `.xls`) datasets.
- Map source columns to `Message`, `Episode Identifier`, `Sender`, `Order`, and
  `Context` roles.
- Group multiple source rows into communication episodes while retaining the link
  between every episode and its original rows.
- Define binary, categorical, numeric, and free-text coding variables.
- Code variables once per episode or separately for each detected sender.
- Add definitions, permitted values, examples, and study-specific context to the
  coding manual.
- Enter experimental instructions directly or convert a PDF into editable text with
  a supported document-capable model.
- Run supported models from OpenAI, Google Gemini, DeepSeek, Anthropic Claude, and
  xAI Grok.
- Repeat model calls and aggregate results separately for each coding variable.
- Monitor episode-level progress, inspect validation issues, and selectively rerun
  affected episodes.
- Download a source-row CSV, an optional episode-level CSV, and detailed aggregate
  and call-level results.
- Generate a standalone local-execution package without embedding an API key.

## Coding workflow

1. Upload the source dataset.
2. Map columns to the roles CAT uses to construct communication episodes.
3. Review the preprocessed episode-level data.
4. Create the coding manual and choose how repeated responses are aggregated.
5. Add the experimental instructions and other relevant context.
6. Configure the provider, model, parameters, and number of calls.
7. Run the coding task or generate a standalone package.
8. Review validation results and download the coded data.

The primary coded CSV preserves the order and columns of the uploaded source data and
appends the final coding variables. If several source rows form one communication
episode, CAT assigns the episode-level codes to each of those rows.

## Technology

| Layer | Technology |
|---|---|
| Frontend | Next.js App Router, React, TypeScript |
| Backend | Python 3.12, FastAPI, SQLAlchemy |
| Database | PostgreSQL through the asynchronous `asyncpg` driver |
| Data processing | pandas and openpyxl |
| Model integrations | OpenAI-compatible APIs, Google Gemini, and Anthropic |
| Styling | Project-specific CSS |

## Repository structure

```text
LLM_TOOL/
├── requirements.txt               # Root Python dependency entry point
├── backend/
│   ├── requirements.txt           # Backend Python dependencies
│   ├── app/
│   │   ├── main.py                # FastAPI application and registered routes
│   │   ├── config.py              # Environment-based application settings
│   │   ├── models/database.py     # Usage and contact-message database models
│   │   ├── routes/                # Coding, exports, instructions, and analysis APIs
│   │   └── services/              # LLM execution, aggregation, and result generation
│   └── tests/                     # Backend test suite
├── frontend/
│   ├── src/app/                   # Next.js interface and workflow components
│   ├── public/                    # Logos, tour graphics, and demonstration video
│   ├── package.json
│   └── package-lock.json
└── .github/workflows/ci.yml       # Automated backend and frontend checks
```

## Requirements

- Python 3.12
- Node.js 22
- PostgreSQL
- An API key for each LLM provider used during browser-based coding

API keys are entered for individual runs. CAT does not write them to its database,
browser storage, generated packages, or application logs.

## Local installation

From the repository root, create an isolated Python environment and install the
backend dependencies:

```bash
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

Install the frontend dependencies in a separate step:

```bash
cd frontend
npm ci
cd ..
```

## Running locally

CAT requires PostgreSQL and does not silently fall back to SQLite. Set a valid
connection string before starting the backend:

```bash
export DATABASE_URL=postgresql://<user>:<password>@localhost:5432/<database>
cd backend
python -m uvicorn app.main:app --reload --port 8000
```

In another terminal, start the frontend:

```bash
cd frontend
npm run dev
```

The local interface is available at `http://localhost:3000`. By default, the frontend
forwards API requests to `http://localhost:8000`. Set `NEXT_PUBLIC_API_URL` before
starting the frontend if the backend uses a different address.

The database tables used for usage events and contact messages are created
automatically when the backend starts with a valid PostgreSQL connection.

## Tests and verification

Run the backend tests from the repository root:

```bash
cd backend
python -m unittest discover -s tests -v
```

Check the frontend:

```bash
cd frontend
npm run lint
npm run build
```

The GitHub Actions workflow also compiles the backend, runs its tests, checks required
application routes, audits production frontend dependencies, and builds the frontend.

## Generated local package

The generated ZIP contains a Python script, `source_rows.csv`, `episodes.csv`,
`row_map.csv`, a package-specific README, and a requirements file. The package never
contains an API key; its script reads `CAT_API_KEY` or requests the key securely at
runtime.

The current generated package uses the first configured provider and model and makes
one call per episode. Multi-model execution and repeated calls are available through
the browser workflow.

## Data handling

- API keys are kept in memory only for the requested operation.
- The selected LLM provider receives the experimental instructions, constructed
  communication episodes, coding manual, and selected context required for coding.
- CAT uses temporary server-side working files for uploaded datasets and results.
  Resetting the project or replacing a dataset requests cleanup, and scheduled cleanup
  removes temporary working files after the 24-hour threshold.
- The browser stores the current project configuration and a local copy of the uploaded
  dataset so work can be restored after a refresh. Resetting the project clears this
  browser copy.
- CAT stores operational usage metadata and contact-form submissions in PostgreSQL. It
  does not store dataset contents or API keys in that database.

Researchers are responsible for determining whether sending their data to the selected
LLM provider complies with participant consent, institutional requirements, data-use
agreements, and applicable law or policy. Sensitive datasets should be de-identified or
processed only through an institutionally approved provider.

## Research use

CAT implements a coding procedure; it does not establish construct validity or ground
truth. Researchers should validate a coding task against an appropriate human-coded
sample, retain the coding manual and configuration, inspect individual and aggregate
outputs, and report the models and settings used.

LLM outputs may vary between calls and may change when providers update their models.
Repeated calls and agreement across models can describe stability, but they do not by
themselves establish that a classification is correct.

## Citation

If CAT is used in research, please cite the accompanying paper, *CAT: An LLM-based Tool
for Content Analysis in Experimental Economics*. The complete bibliographic citation
and archival release identifier will be added when the paper and software release are
published.
