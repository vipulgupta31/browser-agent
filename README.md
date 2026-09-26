# Browser Agent Form Demo

## Overview
AI browser agent: Gemini's `computer_use` tool looks at screenshots of a real, cloud-hosted browser and drives it (click, type) to complete a 
task, while Playwright executes the actions and independently verifies the result in the DOM.

## How it works

1. `form-agent.js` spins up a cloud browser session via
   [`@testmuai/browser-cloud`](https://www.npmjs.com/package/@testmuai/browser-cloud) and connects to it with Playwright.
2. It sends the task description + a screenshot to Gemini
   (`gemini.interactions.create` with the `computer_use` tool).
3. Gemini replies with an action (e.g. `click` at some coordinate, `type` some
   text). `computer-use.js` executes that action against the real page via
   Playwright.
4. A new screenshot is sent back to Gemini as the result of the action, and the
   loop repeats until Gemini reports the task done (or `MAX_STEPS` is hit).
5. The script then checks the actual page DOM for the expected result —
   independent of whatever Gemini *says* happened.

## Files

| File | Purpose |
|---|---|
| `form-agent.js` | Task definition, the agent loop, retry handling, DOM verification. |
| `computer-use.js` | Translates a Gemini computer-use action into a Playwright call. Currently supports `click` and `type` — add more `case`s here if a task needs other actions (`scroll`, `key_down`, etc.). |

## Prerequisites

- Node.js 18+
- A [Gemini API key](https://ai.google.dev/) with access to a `computer_use`-capable model
- [TestMu AI](https://testmuai.com/) (LambdaTest) username + access key for the cloud browser

## Setup

```bash
npm install
```

Create a `.env` file in the project root:

```
LT_USERNAME=your_testmuai_username
LT_ACCESS_KEY=your_testmuai_access_key
GEMINI_API_KEY=your_gemini_api_key
```

## Run

```bash
npm test
# or
node form-agent.js
```

Console output shows each action the agent takes, then `PASS`/`FAIL` based on
the actual page state. The script exits with code `1` on failure.

## Configuration

All of the below are constants at the top of `form-agent.js`:

- `FORM_URL` — page to open
- `TASK` — natural-language instructions sent to Gemini
- `EXPECTED_MESSAGE` — the value/text checked in the DOM after the run
- `MODEL` — Gemini model to use (must support `computer_use`)
- `MAX_STEPS` — safety cap on agent turns
- `VIEWPORT` — browser viewport; Gemini's click coordinates are normalized
  0-999 and scaled against this, so it must match the real rendered size
  (enforced via `page.setViewportSize`)

## Execution Screenshots

### Local Terminal Screenshot
<img width="1080" height="464" alt="Screenshot 2026-09-26 at 10 08 00 PM" src="https://github.com/user-attachments/assets/70d2136c-f0aa-43a3-93c6-1b06b904f2aa" />

### TestMu AI Dashboard Screenshot
<img width="1470" height="833" alt="Screenshot 2026-09-26 at 10 13 59 PM" src="https://github.com/user-attachments/assets/115b4575-be79-48da-9456-a2f8984384e8" />
