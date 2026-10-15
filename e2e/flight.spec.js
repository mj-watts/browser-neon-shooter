import { test, expect } from "@playwright/test";

test("launch, play, pause, sound, exit and relaunch without runtime errors", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Neon Shooter", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Launch flight" }).click();
  const flight = page.getByRole("application", { name: "Neon space shooter" });
  await expect(flight).toBeVisible();
  await expect(flight.locator("canvas")).toBeVisible();
  await expect(flight.locator(".flight-wave strong")).toHaveText("01", { timeout: 15000 });
  await page.keyboard.down(" ");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("b");
  await page.keyboard.up(" ");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "PAUSED", exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/desktop-flight.png" });
  await page.getByRole("button", { name: "Resume flight" }).click();
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sound on", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sound off", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Flight briefing ↗", exact: true }).click();
  await expect(flight).toBeHidden();
  await page.getByRole("button", { name: "Enable space flight" }).click();
  await page.getByRole("button", { name: "Fly again" }).click();
  await expect(flight).toBeVisible();
  expect(errors).toEqual([]);
});

test("touch layout launches with automatic fire", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("http://127.0.0.1:4173/");
  await page.getByRole("button", { name: "Launch flight" }).tap();
  await expect(page.getByRole("application", { name: "Neon space shooter" })).toBeVisible();
  await expect(page.locator(".flight-wave strong")).toHaveText("01", { timeout: 15000 });
  await expect(page.locator(".flight-mobile-help")).toBeVisible();
  await page.screenshot({ path: "test-results/touch-flight.png" });
  expect(errors).toEqual([]);
  await context.close();
});

 test("scroll launches with normal motion preferences", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Launch flight" })).toBeEnabled();
  await page.evaluate(() => {
    const runway = document.querySelector(".terms-runway");
    window.scrollTo(0, runway.getBoundingClientRect().top + window.scrollY + window.innerHeight * 0.4);
  });
  await expect(page.getByRole("application", { name: "Neon space shooter" })).toBeVisible();
  await expect(page.locator(".flight-wave strong")).toHaveText("01", { timeout: 15000 });
  expect(errors).toEqual([]);
});
