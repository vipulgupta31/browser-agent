import "dotenv/config";
import { Browser } from "@testmuai/browser-cloud";
import { GoogleGenAI } from "@google/genai";
import { executeAction } from "./computer-use.js";

const FORM_URL =
  "https://www.testmuai.com/selenium-playground/simple-form-demo/";

const EXPECTED_MESSAGE = "9";

const VIEWPORT = { width: 1440, height: 900 };
const MAX_STEPS = 30;
const MODEL = "gemini-3.5-flash-lite";

const TASK = `
Open the form at: ${FORM_URL}

Scroll to the "Two Input Fields" section.
Enter the first value as 4.
Enter the second value as 5.
Click on the "Get Sum" button.
Verify the Result as ${EXPECTED_MESSAGE}.
`;

async function screenshotOf(page) {
  const data = await page.screenshot({ type: "png" });
  return { type: "image", data: data.toString("base64"), mime_type: "image/png" };
}

// Retries on rate limits and client-side timeouts.
async function createInteraction(gemini, params, retries = 3) {
  try {
    return await gemini.interactions.create(params, { timeout: 90000 });
  } catch (err) {
    const isRateLimited = err.status === 429;
    const isTimeout = err.name === "APIConnectionTimeoutError";
    if ((!isRateLimited && !isTimeout) || retries <= 0) throw err;

    let delayMs;
    if (isRateLimited) {
      const match = /retry in ([\d.]+)s/i.exec(err.message || "");
      delayMs = match ? Math.ceil(parseFloat(match[1]) * 1000) : 5000 * (4 - retries);
      console.log(`Rate limited, retrying in ${Math.ceil(delayMs / 1000)}s...`);
    } else {
      delayMs = 2000 * (4 - retries);
      console.log(`Request timed out, retrying in ${Math.ceil(delayMs / 1000)}s...`);
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));

    return createInteraction(gemini, params, retries - 1);
  }
}

async function runAgentLoop(gemini, page) {
  let interaction = await createInteraction(gemini, {
    model: MODEL,
    input: [{ type: "text", text: TASK }, await screenshotOf(page)],
    tools: [{ type: "computer_use", environment: "browser" }],
  });

  let steps = 0;

  while (interaction.status === "requires_action" && steps < MAX_STEPS) {
    steps++;

    const calls = (interaction.steps || []).filter(
      (step) => step.type === "function_call"
    );

    const resultsInput = [];

    for (const call of calls) {
      console.log(`Step ${steps}: ${call.name}(${JSON.stringify(call.arguments)})`);

      let outcome;
      let isError = false;
      try {
        outcome = await executeAction(page, VIEWPORT, call.name, call.arguments);
      } catch (err) {
        outcome = { error: err.message };
        isError = true;
      }

      resultsInput.push({
        type: "function_result",
        name: call.name,
        call_id: call.id,
        is_error: isError,
        result: [{ type: "text", text: JSON.stringify(outcome) }, await screenshotOf(page)],
      });
    }

    interaction = await createInteraction(gemini, {
      model: MODEL,
      previous_interaction_id: interaction.id,
      input: resultsInput,
      tools: [{ type: "computer_use", environment: "browser" }],
    });
  }

  if (interaction.status !== "completed") {
    console.log(`Agent stopped with status "${interaction.status}" after ${steps} step(s).`);
  }

  return interaction;
}

async function verifySuccessMessage(page) {
  try {
    // Scoped to the result element, not a page-wide text search.
    const result = page.locator("#addmessage");
    await result.waitFor({ state: "visible", timeout: 10000 });
    return (await result.innerText()).trim() === EXPECTED_MESSAGE;
  } catch {
    return false;
  }
}

async function main() {
  const browserCloud = new Browser();
  const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const session = await browserCloud.sessions.create({
    adapter: "playwright",
    dimensions: VIEWPORT,
    timeout: 1800000,
    lambdatestOptions: {
      build: "AI Browser Agent",
      name: "Simple Form Sum",
      "LT:Options": {
        username: process.env.LT_USERNAME,
        accessKey: process.env.LT_ACCESS_KEY,
        idleTimeout: 600,
      },
    },
  });

  const { browser, page } = await browserCloud.playwright.connect(session);

  let success = false;

  try {
    // Cloud sessions don't always honor requested `dimensions`; force it so
    // click coordinates (denormalized against VIEWPORT) land correctly.
    await page.setViewportSize(VIEWPORT);
    await page.goto(FORM_URL);

    const interaction = await runAgentLoop(gemini, page);
    console.log("Final model output:", interaction.output_text);

    // Check the real page, not just the model's claim.
    success = await verifySuccessMessage(page);
    console.log(
      success
        ? `PASS: success message found — "${EXPECTED_MESSAGE}"`
        : "FAIL: success message not found on page."
    );
  } finally {
    await browser.close();
    await browserCloud.sessions.release(session.id);
  }

  process.exitCode = success ? 0 : 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});