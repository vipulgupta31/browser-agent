// Gemini coordinates are normalized 0-999; scale to the real viewport size,
// which can differ from what was requested at session creation.
function denormalize(value, dimension) {
  return Math.round((value / 1000) * dimension);
}

// Executes one computer-use action against the live Playwright page.
export async function executeAction(page, viewport, name, args) {
  switch (name) {
    case "click":
      await page.mouse.click(denormalize(args.x, viewport.width), denormalize(args.y, viewport.height));
      break;
    case "type":
      await page.keyboard.type(args.text);
      if (args.press_enter) await page.keyboard.press("Enter");
      break;
    default:
      throw new Error(`Unsupported computer-use action: ${name}`);
  }

  return { url: page.url() };
}
