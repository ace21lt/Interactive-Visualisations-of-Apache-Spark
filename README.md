# Interactive Spark Visualisations

[![DOI](https://zenodo.org/badge/1088796914.svg)](https://doi.org/10.5281/zenodo.20832498)

> A dissertation project (University of Sheffield) an interactive teaching tool that makes Apache Spark's distributed execution visible to students, step by step. The current live deployment link is - https://interactive-visualisations-of-apache-spark-prod.up.railway.app/

## Overview
Apache Spark's execution model is difficult to teach because students cannot see what is happening inside the cluster. This tool addresses that by connecting to a student's own Databricks workspace, executing structured teaching notebooks, and rendering the resulting execution traces as interactive D3.js visualisations.

The interface walks students through a sequence of lab steps. For each step, the tool displays the relevant PySpark or scikit-learn notebook code. On editable steps, students can adjust parameters, such as the number of partitions, a filter predicate, or the regularisation coefficient.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Browser (React + D3.js)                                     │
│  Step navigation · CodeMirror editor · D3 visualisations     │
└──────────────────────────┬───────────────────────────────────┘
                           │ HTTP POST /trigger
┌──────────────────────────▼───────────────────────────────────┐
│  Backend (Scala 3 + ZIO)                                     │
│  Injects student edits into notebook template                │
│  Submits job to Databricks Jobs API                          │
│  Polls run status · Parses JSON trace from notebook output   │
│  Serves compiled React bundle in production (SPA fallback)   │
└──────────────────────────┬───────────────────────────────────┘
                           │ Databricks REST API
┌──────────────────────────▼───────────────────────────────────┐
│  Databricks (Serverless Compute)                             │
│  Executes teaching notebook · Returns JSON trace via         │
│  dbutils.notebook.exit()                                     │
└──────────────────────────────────────────────────────────────┘
```

> **Local dev vs production:** locally, the React frontend and Scala backend run as two separate Docker services (ports 3000 and 8080). In the Railway production deployment, the backend JAR serves the compiled React bundle directly from `/app/public` — a single service.

### Stack

| Layer | Technology |
|---|---|
| Frontend | React, Vite, D3.js, CodeMirror 6, plain CSS |
| Backend | Scala 3.3.1, ZIO 2.0.19, ZIO HTTP 3.0.0-RC4, JVM 21 |
| Notebook execution | Databricks Serverless Compute, Jobs API |
| Deployment | Railway (single service, Docker multi-stage build) |
| Testing | ZIO Test (backend), Playwright (frontend E2E) |

---

## How It Works

1. **Login** — the student enters their Databricks workspace URL and personal access token (PAT). The backend validates both and issues a session cookie.
2. **Select a lab** — Lab 1 or Lab 2 is selected. The tool loads the default notebook code for each step.
3. **Step navigation** — steps are displayed in sequence. Each step shows the relevant notebook code in an embedded CodeMirror editor alongside a task description.
4. **Editable steps** — on steps marked editable, the student can modify parameters (e.g. `NUM_PARTITIONS = 8`, `reg_param = 0.1`). Read-only steps display a `Read Only` label and suppress the Run button.
5. **Run** — clicking **Run Code** sends the edited region to the backend. The backend injects it into the notebook template (delimited by `# SPARK-VIZ-STEP-n-BEGIN` / `# SPARK-VIZ-STEP-n-END` markers), imports the notebook into the student's workspace, and submits it as a Databricks job.
6. **Trace rendering** — once the job completes, the structured JSON trace returned by `dbutils.notebook.exit()` is parsed and the D3 visualisations update to reflect the actual execution results.
7. **Cross-run history** — results from successive runs are retained in-session and displayed as comparison charts, letting students observe how parameter changes affect execution behaviour.

---

## Running Locally

### Prerequisites

- **Databricks workspace** with Serverless Compute enabled and a valid PAT
- **Docker** (recommended), or Node.js 20+ and Java 21 JDK + sbt

### 1. Configure credentials

Create a `.env` file in the repo root:

```bash
# Direct mode — backend uses these credentials for all requests
DATABRICKS_HOST=https://your-workspace.cloud.databricks.com
DATABRICKS_TOKEN=your_personal_access_token

# Session mode — leave both unset; students log in via the UI
# DATABRICKS_HOST=
# DATABRICKS_TOKEN=

# Optional: protect the whole app with HTTP Basic Auth
# DEV_PASSWORD=your_password
```

### 2. Start the stack

```bash
docker compose up --build
```

Open `http://localhost:3000`. To verify the backend independently: `curl http://localhost:8080/health`.

### 3. Run without Docker

**Backend:**
```bash
./run.sh    # sources .env and runs: sbt run
```

**Frontend** (separate terminal):
```bash
cd frontend
npm install
npm run dev    # http://localhost:3000
# Outside Docker, set: VITE_API_URL=http://localhost:8080
```

---

## Development

### Running tests

```bash
# Backend (ZIO Test)
sbt test
sbt "testOnly api.LoginLogoutSpec"

# Frontend (Playwright E2E)
cd frontend
npx playwright test
```

Test output: `target/test-reports/` (backend), `frontend/playwright-report/` (frontend).

### Project structure

```
.
├── backend/
│   └── src/
│       ├── main/scala/
│       │   ├── Main.scala              # Server entrypoint, static file serving, SPA fallback
│       │   ├── api/                    # HTTP routes and error handling
│       │   ├── handlers/               # Login, health, notebook execution handlers
│       │   ├── service/                # Databricks service layer
│       │   ├── databricks/             # Notebook templating, job submission, output parsing
│       │   ├── credentials/            # PAT credential resolution
│       │   └── session/                # In-memory session management
│       └── main/resources/
│           ├── lab1_notebook_template.py
│           ├── lab2_notebook_template.py
│           └── datasets/               # NASA log data, Advertising CSV
│
├── frontend/
│   └── src/
│       ├── App.js                      # App shell, lab state, run orchestration
│       ├── components/
│       │   ├── CodePanel.js            # CodeMirror editor, step templates, run dispatch
│       │   ├── Login.js                # Workspace URL + PAT login form
│       │   ├── TourButton.js           # Guided tour launcher
│       │   └── visualisations/
│       │       ├── Lab1Layout.js       # Lab 1 step layout and D3 wiring
│       │       ├── Lab2Layout.js       # Lab 2 step layout and D3 wiring
│       │       └── [D3 components]     # Partition diagram, scatter, coefficient chart, etc.
│       ├── config/                     # Guided tour step definitions
│       └── theme/                      # Colour palette (Okabe-Ito, Sheffield brand)
│
├── Dockerfile                          # Multi-stage build: Vite -> sbt assembly -> runtime JAR
├── docker-compose.yml                  # Local dev: two services (frontend :3000, backend :8080)
├── railway.toml                        # Railway deployment config
└── build.sbt
```

### Adding a new lab

1. Create `src/main/resources/lab<n>_notebook_template.py` with `# SPARK-VIZ-STEP-<n>-BEGIN` / `# SPARK-VIZ-STEP-<n>-END` markers around each editable region
2. Register the template in `NotebookTemplate.scala`
3. Create `frontend/src/components/visualisations/Lab<n>Layout.js`
4. Add `{ id: 'lab<n>', label: 'Lab <n>: ...' }` to the `LABS` array in `App.js`

---

## Troubleshooting

**Login fails with "Invalid workspace URL"**
The URL must be exactly `https://your-workspace.cloud.databricks.com`. Check the PAT has not expired and has permission to submit jobs.

**401 / 403 after login**
A 401 means the PAT has expired. A 403 means the PAT lacks sufficient workspace permissions. Both trigger an automatic logout with an explanatory message.

**Notebook execution times out**
The project uses Databricks **Serverless Compute** so no cluster needs to be running. If execution times out, check that Serverless is enabled on your workspace and that the PAT has job submission permissions.

**Frontend cannot reach backend**
In local dev outside Docker, set `VITE_API_URL=http://localhost:8080`. In Docker, Vite proxies `/api` and `/trigger` to `http://backend:8080` automatically. Confirm the backend is healthy: `curl http://localhost:8080/health`.

---

## Dissertation context

This repository is the implementation for an UG dissertation at the University of Sheffield. The final project report covers the requirements, design decisions, evaluation methodology, and user study results. The live deployment is hosted on Railway and was used for a user study with COM6012 students.

---

**Status:** Active development · **Last updated:** May 2026
