---
type: "Reference"
title: "Developer Workflows"
openwiki_generated: true
---

# Developer Workflows

This document outlines the local development setup, database seeding, automated testing, and CI pipeline workflows for the `artisansApp_backend` repository.

## 1. Prerequisites and Installation
Ensure Node.js `>=22.0.0` is installed on your machine.
Clone the repository, configure the environment file `.env`, and install dependencies:
```bash
npm install
```

---

## 2. Running Locally
Launch the Express application in development watch mode:
```bash
npm run dev
```
The server will run on port `5000` (or as configured by `PORT` in `.env`) and auto-reload on file edits.

To build the TypeScript files to JavaScript under `dist/` and start:
```bash
npm run build
npm start
```

---

## 3. Database Seeding Workflows
Several utility scripts are configured to manage local or dev database seeding:

- **`npm run seed:categories`**: Seeds service categories (such as Plumbing, Carpentry, etc.) into the database.
- **`npm run seed:workers`**: Seeds dummy worker profiles for testing dispatches.
- **`npm run seed:dev`**: Runs general seeding helpers for local development state.
- **`npm run seed:reset:dev`**: Re-initializes and purges dev seeding tables.
- **`npm run seed:verify`**: Verifies seed data consistency in the database tables.

---

## 4. Automated Testing
Run the Node.js native test runner against backend test scripts:
```bash
npm run test
```
Tests are located in the [tests/](file:///c:/Users/user/Downloads/FinalYearProject/artisansApp_backend/tests) directory (targeting files ending in `.test.ts`).

---

## 5. Documentation Maintenance
Documentation is managed via OpenWiki.
- To initialize documentation configs:
  ```bash
  npm run docs:wiki:init
  ```
- To fetch changes and run documentation update passes:
  ```bash
  npm run docs:wiki:update
  ```

---

## 6. Continuous Integration (CI)
CI is powered by GitHub Actions. The main workflows are stored under [.github/workflows/](file:///c:/Users/user/Downloads/FinalYearProject/artisansApp_backend/.github/workflows):
- **`openwiki-update.yml`**: Scheduled runner that pulls down documentation and updates the wiki files using OpenWiki configured with local or server LLM backends.
