# SOMPlanner

A simple project management app for the SOMLITS work plan and risk register (Node.js + Express).

## Run it

1. Install Node.js 18 or newer from https://nodejs.org (the LTS installer).
2. In this folder:
   ```
   npm install
   npm start
   ```
3. Open http://localhost:3000

The first start creates the SQLite database `data/somplanner.db`, filled with the work plan (121 rows), risk register (37 risks), draft business rules and requirements from the Inception Report. If an older `data/db.json` exists, its data is moved into the database automatically and the JSON file is kept as a dated backup.

| Login    | Password    | Permission                |
|----------|-------------|---------------------------|
| `editor` | `editor123` | Can edit everything       |
| `viewer` | `viewer123` | View only (can download attachments and export CSV) |

Change these passwords from **Users** (top right) after you first log in. You can add more users there too.

## What it does

- **Work Plan tab**: all the work plan columns, grouped by milestone. Click a row to open its panel below it, where you can:
  - edit the task fields
  - enter the **result / submission** (this sets the status to *Submitted*)
  - attach files
  - record the **MoLFR approval** (Approved sets the task to *Completed*; Rework Required sets *Rework Required*)
  - log **MoLFR review / feedback** and team feedback
  - add waiting periods and read the activity history
- **Timeline & Waiting tab**: a Gantt chart. Drag across a task's row to mark a **waiting period** (for example, waiting for MoLFR review). It shows as an orange hatched bar with its length in days. Click the bar to edit or delete it. Waiting days are added up per task, per milestone and at the top of the page (MoLFR / AHDAA / other).
- **Risk Register tab**: all the register columns. Score and rating are worked out for you (15+ High, 8–14 Medium, under 8 Low), with a summary, a heat map and a count by category.
- **Late**: a task is late when its planned end has passed and it is not completed or approved.
- **Export CSV**: available on both tabs.

## Data & backup

Everything is stored in the `data/` folder:

- `somplanner.db` — the SQLite database (tasks, submissions, feedback, MoLFR reviews, delays, waiting periods, activity log, risks, business rules, requirements, users and login sessions). SQLite may also keep two small helper files next to it (`-wal`, `-shm`); keep them together.
- `uploads/` — attached files.

To back up, stop the server and copy the `data/` folder (or use `sqlite3 data/somplanner.db ".backup backup.db"` while it runs). You can open the database with any SQLite tool, e.g. DB Browser for SQLite. To start again from the PDF data, stop the server and delete `data/`.

To use a different port: `PORT=8080 npm start`.

## Server settings (environment variables)

| Variable | Purpose |
|---|---|
| `PORT` | Port to listen on (default 3000) |
| `DATA_DIR` | Folder for the database and uploads; use a persistent disk on a server |
| `RULES_PASSWORD` / `DOCS_PASSWORD` | Business Rules / Documents section passwords for a new database |
| `TRUST_PROXY` | Set to `1` when running behind a reverse proxy / load balancer, so login limits see real client addresses |

Change the default user passwords after the first login. Logins lock for 5 minutes after 5 wrong tries for a username (20 from one address).
