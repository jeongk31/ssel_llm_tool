# CAT — Communication Annotation Tool

CAT is a web application developed by the Social Science Experimental Laboratory at
NYU Abu Dhabi for coding free-form communication with large language models (LLMs).
It is designed primarily for communication data from economic experiments, although
the workflow can support other structured content-analysis tasks.

Researchers can upload a dataset, define communication episodes, create a coding
manual, provide experimental context, run one or more LLMs, review validation results,
and download coded data without writing application code.

## Coding workflow

The guided tour uses a small, constructed dataset; it does not contain participant
data.

1. Upload a CSV or Excel (`.csv`, `.xlsx`, or `.xls`) source dataset.
2. Map source columns to CAT's `Message`, `Episode Identifier`, `Sender`, `Order`,
   and `Context` roles. CAT groups source rows into communication episodes while
   retaining the link between every episode and its original rows.
3. Review and, if needed, download the preprocessed episode-level data.
4. Create binary, categorical, numeric, or free-text coding variables. Variables can
   be coded once per episode or separately for each detected sender and can include
   definitions, permitted values, examples, and study-specific context.
5. Enter experimental instructions directly or convert a PDF into editable text with
   a supported document-capable model.
6. Configure models from OpenAI, Google Gemini, DeepSeek, Anthropic Claude, or xAI
   Grok, including model parameters and the number of calls.
7. Run the task in the browser or generate a standalone local-execution package that
   does not contain an API key. Browser runs can use multiple models and repeated calls,
   with aggregation selected separately for each coding variable.
8. Monitor episode-level progress, inspect validation issues, selectively rerun affected
   episodes, and use one button to download the complete results.

With one model call, the download is a CSV that preserves the order and columns of the
uploaded source data and appends every coding variable. If several source rows form one
communication episode, CAT assigns the episode-level codes to each of those rows.

With repeated calls or multiple models, the download is one ZIP archive. It contains
up to two overall CSV files: a source-row file with the final non-text aggregates and,
when the codebook contains text variables, a separate call-level file containing every
text response. Each LLM also has up to two corresponding CSV files containing its own
non-text aggregates and text responses. Finally, the archive contains one unchanged
call-level CSV for every individual run of every LLM. Categorical values are represented
in aggregate files as separate binary columns (for example, `option_a`, `option_b`, and
`option_c`), while their original labels remain unchanged in the individual-run files.
When a numeric mode has no unique winner, CAT uses the median; with an even number of
responses, this is the average of the two middle values.

```text
dataset_coded_results.zip
├── overall/
│   ├── aggregated_results.csv     # present when non-text variables exist
│   └── text_results.csv           # present when text variables exist
└── models/
    └── provider_model/
        ├── aggregated_results.csv # present when non-text variables exist
        ├── text_results.csv       # present when text variables exist
        └── runs/
            ├── run1.csv
            └── run2.csv
```

## Technology

| Layer | Technology |
|---|---|
| Frontend | Next.js App Router, React, TypeScript |
| Backend | Python 3.12, FastAPI, SQLAlchemy |
| Database | PostgreSQL through the asynchronous `asyncpg` driver |
| Data processing | pandas and openpyxl |
| Model integrations | OpenAI-compatible APIs, Google Gemini, and Anthropic |
| Styling | Project-specific CSS |

The public production service runs on a university-hosted Red Hat Enterprise Linux
server behind Nginx and HTTPS. The frontend and backend run as systemd-managed services,
and PostgreSQL provides the persistent metadata store. Hostnames, credentials, internal
paths, and administrative details are intentionally excluded from public documentation.

## Repository structure

```text
LLM_TOOL/
├── requirements.txt               # Root Python dependency entry point
├── backend/
│   ├── requirements.in            # Direct Python dependencies
│   ├── requirements.txt           # Fully pinned Python dependency lock
│   ├── app/
│   │   ├── main.py                # FastAPI application and registered routes
│   │   ├── config.py              # Environment-based application settings
│   │   ├── models/database.py     # Usage and contact-message database models
│   │   ├── routes/                # Coding, exports, instructions, analytics, and contact APIs
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

To update Python dependencies deliberately, edit `backend/requirements.in`, regenerate
the lock with `python -m pip install pip-tools==7.6.1` followed by
`pip-compile --generate-hashes --strip-extras --output-file=backend/requirements.txt backend/requirements.in`,
and run the complete test suite before committing the result.

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
- CAT asks for consent before collecting optional usage analytics. Acceptance enables
  the disclosed browser, IP-derived location, and configuration metadata. Rejection
  records only one anonymous visit count without a location or browser identifier.
- CAT stores consented operational metadata and contact-form submissions in PostgreSQL.
  It does not store dataset contents or API keys in that database.

See the complete [privacy notice](PRIVACY.md).

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
for Content Analysis in Experimental Economics*, by Andrzej Baranski, David J. Cooper,
and Jeong Kyu Lee. The repository's [`CITATION.cff`](CITATION.cff) provides machine-
readable citation metadata; the DOI will be added when one is assigned.

## Project policies

- [Contributing](CONTRIBUTING.md)
- [Security reporting](SECURITY.md)
- [Privacy](PRIVACY.md)
- [Changelog](CHANGELOG.md)
- [Deferred features](DEFERRED_FEATURES.md)
