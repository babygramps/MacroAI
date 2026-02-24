# MacroAI - Agent Instructions

## Cursor Cloud specific instructions

### Overview

MacroAI is a Next.js 15 (App Router) calorie/macro tracking web app using AWS Amplify Gen 2 (Cognito auth + DynamoDB). There is no local database or Docker — all backend services run in AWS cloud.

### Commands

Standard commands are in `package.json` scripts:

- **Dev server:** `npm run dev` (port 3000)
- **Lint:** `npm run lint` (ESLint; existing warnings in test/script files are expected)
- **Unit tests:** `npm test` (Jest, 239 tests, all mocked — no backend required)
- **E2E tests:** `npm run test:e2e` (Playwright; requires running dev server + Amplify sandbox + E2E credentials)
- **Build:** `npm run build`

### Non-obvious caveats

- **`amplify_outputs.json` is committed** and contains only public identifiers (Cognito pool IDs, AppSync endpoint). The app needs this file to connect to AWS services. Do not delete it.
- **No local database** — DynamoDB is cloud-only via Amplify. Unit tests mock all data access, so `npm test` works without any AWS credentials.
- **ESLint warnings are pre-existing** — running `eslint --max-warnings=0` fails due to unused-var warnings in test files and `scripts/validate-tdee.ts`. Running `npm run lint` (without `--max-warnings=0`) succeeds.
- **The Amplify sandbox** (`npx ampx sandbox`) deploys a personal cloud stack for auth+data. It requires AWS credentials and is not needed for unit tests or dev server startup (the committed `amplify_outputs.json` already points to a deployed stack).
- **Environment variables** `USDA_API_KEY` and `GEMINI_API_KEY` are only needed for server actions (food search, AI features). The app starts and renders the auth UI without them.
