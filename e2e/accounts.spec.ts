import { type Browser, expect, type Page, test } from "@playwright/test";
import type { DeviceLinkResponse } from "../src/shared/account";

const IPHONE_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const SHOTS = process.env.SHOTS_DIR;

async function openGame(browser: Browser, options: { userAgent?: string } = {}) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return { context, page, errors };
}

function hubWelcome(page: Page, playerName: string): Promise<void> {
  return new Promise((resolve) => {
    page.on("websocket", (socket) => {
      socket.on("framereceived", (frame) => {
        if (typeof frame.payload === "string" && frame.payload.includes(`"playerName":"${playerName}"`)) resolve();
      });
    });
  });
}

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${test.info().project.name}-${name}.png` });
}

async function expectInsideScreen(page: Page) {
  const viewport = page.viewportSize();
  const sizes = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(sizes.scrollWidth).toBe(sizes.clientWidth);
  for (const box of await page
    .locator(".qq-panel, .qq-card, .qq-panel-head, .qq-panel-foot")
    .evaluateAll((items) => items.map((item) => item.getBoundingClientRect().toJSON()))) {
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.top).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(viewport?.width ?? 0);
    expect(box.bottom).toBeLessThanOrEqual(viewport?.height ?? 0);
  }
}

async function signUp(page: Page): Promise<{ name: string; code: string }> {
  await page.goto("/");
  await page.getByRole("button", { name: "Play" }).click();
  const nameButton = page.locator(".qq-names button").first();
  const name = (await nameButton.textContent()) ?? "";
  await nameButton.click();
  const code = (await page.locator(".qq-code").getAttribute("aria-label"))?.replace("Secret code: ", "") ?? "";
  await page.getByRole("button", { name: "I wrote it down" }).click();
  return { name, code };
}

async function newDeviceLink(page: Page): Promise<DeviceLinkResponse> {
  await page.getByRole("button", { name: "Settings" }).click();
  const linkResponse = page.waitForResponse("**/api/link");
  await page.getByRole("button", { name: "Add a device" }).click();
  return (await linkResponse).json();
}

test("a player signs up, adds devices three ways, and signs one out", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "The full flow runs once; every screen size gets the screens test.");
  test.setTimeout(240_000);

  const first = await openGame(browser);
  const { name, code } = await signUp(first.page);
  const firstWelcome = hubWelcome(first.page, name);
  await first.page.getByRole("button", { name: "Yes, remember" }).click();
  await expect(first.page.locator(".qq-card-name")).toHaveText(name);
  await firstWelcome;

  const phone = await openGame(browser, { userAgent: IPHONE_AGENT });
  await phone.page.goto("/");
  await phone.page.getByRole("button", { name: "I have a secret code" }).click();
  await phone.page.getByRole("textbox", { name: "Secret code" }).fill(code.toUpperCase().replaceAll(" ", "-"));
  await phone.page.getByRole("button", { name: "Play" }).click();
  const phoneWelcome = hubWelcome(phone.page, name);
  await phone.page.getByRole("button", { name: "No", exact: true }).click();
  await expect(phone.page.locator(".qq-card-name")).toHaveText(name);
  await phoneWelcome;

  const link = await newDeviceLink(first.page);
  await expect(first.page.locator(".qq-qr svg")).toBeVisible();
  await expect(first.page.locator(".qq-short")).toHaveText(link.shortCode);
  const scanned = await openGame(browser);
  await scanned.page.goto(link.url);
  await scanned.page.getByRole("button", { name: "Yes, remember" }).click();
  await expect(scanned.page.locator(".qq-card-name")).toHaveText(name);
  await expect(scanned.page).toHaveURL(/\/$/);
  expect(scanned.errors).toEqual([]);
  await scanned.context.close();

  await first.page.getByRole("button", { name: "Done" }).click();
  await first.page.getByRole("button", { name: "Close" }).click();
  const secondLink = await newDeviceLink(first.page);
  const typed = await openGame(browser);
  await typed.page.goto("/");
  await typed.page.getByRole("button", { name: "Scan from my other device" }).click();
  await typed.page.getByRole("textbox", { name: "6-letter code" }).fill(secondLink.shortCode.toLowerCase());
  await typed.page.getByRole("button", { name: "Play" }).click();
  await typed.page.getByRole("button", { name: "No", exact: true }).click();
  await expect(typed.page.locator(".qq-card-name")).toHaveText(name);
  expect(typed.errors).toEqual([]);
  await typed.context.close();

  await first.page.getByRole("button", { name: "Done" }).click();
  await expect(first.page.locator(".qq-devices li")).toHaveCount(4);
  await expect(first.page.locator(".qq-tag")).toHaveCount(1);
  const iPhoneRow = first.page.locator(".qq-devices li", { hasText: "iPhone" });
  await iPhoneRow.getByRole("button", { name: "Sign out" }).click();
  await expect(first.page.getByText("iPhone is signed out.")).toBeVisible();
  await expect(first.page.locator(".qq-devices li")).toHaveCount(3);

  await expect(phone.page.getByText("You are signed out on this device.")).toBeVisible();
  expect((await (await phone.page.request.get("/api/me")).json()).player).toBeNull();
  expect((await phone.page.request.post("/api/link")).status()).toBe(401);

  for (const game of [first, phone]) {
    expect(game.errors).toEqual([]);
    await game.context.close();
  }
});

test("every account screen fits the screen", async ({ browser }) => {
  const { context, page, errors } = await openGame(browser);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Play" })).toBeVisible();
  await page.waitForTimeout(400);
  await expectInsideScreen(page);
  await shot(page, "1-welcome");

  await page.getByRole("button", { name: "I have a secret code" }).click();
  await page.getByRole("textbox", { name: "Secret code" }).fill("acorn acorn acorn 00");
  await page.getByRole("button", { name: "Play" }).click();
  await expect(page.getByRole("alert")).toHaveText(/does not match/);
  await expect(page.getByRole("textbox", { name: "Secret code" })).toHaveValue("acorn acorn acorn 00");
  await expectInsideScreen(page);
  await shot(page, "2-wrong-code");
  await page.getByRole("button", { name: "Back" }).click();

  await page.getByRole("button", { name: "Scan from my other device" }).click();
  await expectInsideScreen(page);
  await shot(page, "3-link-from-other");
  await page.getByRole("button", { name: "Back" }).click();

  await page.getByRole("button", { name: "Play" }).click();
  await expect(page.locator(".qq-names button")).toHaveCount(3);
  await expectInsideScreen(page);
  await shot(page, "4-pick-name");
  await page.locator(".qq-names button").first().click();
  await expect(page.locator(".qq-code span")).toHaveCount(4);
  await expectInsideScreen(page);
  await shot(page, "5-new-code");
  await page.getByRole("button", { name: "I wrote it down" }).click();
  await expectInsideScreen(page);
  await shot(page, "6-remember");
  await page.getByRole("button", { name: "No", exact: true }).click();
  await expect(page.locator(".qq-card")).toBeVisible();
  await page.waitForTimeout(800);
  await expectInsideScreen(page);
  await shot(page, "7-card");

  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.locator(".qq-devices li")).toHaveCount(1);
  await expectInsideScreen(page);
  await shot(page, "8-settings");
  await expect(page.locator(".qq-panel-head").getByRole("button", { name: "Close" })).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole("button", { name: "Add a device" })).toBeInViewport({ ratio: 1 });
  await page.getByRole("button", { name: "Add a device" }).click();
  await expect(page.locator(".qq-qr svg")).toBeVisible();
  await expectInsideScreen(page);
  await shot(page, "9-add-device");
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "Show my code" }).click();
  await expectInsideScreen(page);
  await shot(page, "10-show-code");
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "Sign out here" }).click();
  await expect(page.getByText("You are signed out on this device.")).toBeVisible();

  // The browser logs the 401 of the wrong-code step; nothing else may fail.
  expect(errors).toEqual(["Failed to load resource: the server responded with a status of 401 (Unauthorized)"]);
  await context.close();
});
