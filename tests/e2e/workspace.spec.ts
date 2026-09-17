import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page, baseURL }) => {
  const response = await page.request.post("/api/auth/login", { headers: { Origin: baseURL! }, data: { email: "sara.khan@demo.openeyes.local", password: process.env.DEMO_ACCOUNT_PASSWORD } });
  expect(response.status()).toBe(200);
});

test("bilateral plan retains eye, site, and notes across views and navigation", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Anatomy practice", exact: true }).click();
  await expect(page.getByTestId("add-to-plan")).toBeDisabled();
  await page.getByTestId("select-OD-optic_nerve").click();
  await page.getByTestId("select-OS-lens").click();
  await page.getByTestId("add-to-plan").click();
  await expect(page.getByTestId("plan-count")).toHaveText("2");
  await expect(page.getByTestId("add-to-plan")).toBeDisabled();
  await page.getByTestId("plan-OD-optic_nerve").getByRole("textbox").fill("Right-eye practice note");
  await page.getByRole("button", { name: "2D diagram", exact: true }).click();
  await expect(page.getByTestId("select-OD-optic_nerve")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("select-OS-lens")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("diagram-OS").getByRole("button", { name: "OS Retina", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("summary-OD")).toContainText("Optic nerve");
  await expect(page.getByTestId("summary-OS")).toContainText("Retina");
  await page.getByTestId("add-to-plan").click();
  await expect(page.getByTestId("plan-count")).toHaveText("3");
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page.getByRole("button", { name: "Anatomy practice", exact: true }).click();
  await expect(page.getByTestId("plan-OD-optic_nerve").getByRole("textbox")).toHaveValue("Right-eye practice note");
  await page.getByRole("button", { name: "Clear practice plan", exact: true }).click();
  await page.getByRole("button", { name: "Keep working", exact: true }).click();
  await expect(page.getByTestId("plan-count")).toHaveText("3");
  await page.getByRole("button", { name: "Clear practice plan", exact: true }).click();
  await page.getByRole("button", { name: "Clear plan", exact: true }).click();
  await expect(page.getByTestId("plan-count")).toHaveText("0");
  expect(errors).toEqual([]);
});

test("both WebGL scenes render and right-eye camera controls leave the left eye unchanged", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Anatomy practice", exact: true }).click();
  const right = page.getByTestId("scene-OD").locator("canvas");
  const left = page.getByTestId("scene-OS").locator("canvas");
  await expect(right).toBeVisible();
  await expect(left).toBeVisible();
  await page.getByTestId("select-OD-optic_nerve").click();
  await expect.poll(async () => (await right.screenshot()).length).toBeGreaterThan(4000);
  await expect(left).toHaveAttribute("data-camera-pose", /.+/);
  const originalRight = await right.getAttribute("data-camera-pose");
  const originalLeft = await left.getAttribute("data-camera-pose");
  await page.getByRole("button", { name: "OD Zoom in", exact: true }).click();
  await expect.poll(async () => right.getAttribute("data-camera-pose")).not.toBe(originalRight);
  expect(await left.getAttribute("data-camera-pose")).toBe(originalLeft);
  const bounds = await right.boundingBox();
  if (!bounds) throw new Error("Right eye has no viewport");
  const beforeDrag = await right.getAttribute("data-camera-pose");
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + 55, bounds.y + bounds.height / 2 + 15, { steps: 10 });
  await page.mouse.up();
  await expect.poll(async () => right.getAttribute("data-camera-pose")).not.toBe(beforeDrag);
  expect(await left.getAttribute("data-camera-pose")).toBe(originalLeft);
  await page.getByRole("button", { name: "OD Reset view", exact: true }).click();
  await expect(page.getByTestId("select-OD-optic_nerve")).toHaveAttribute("aria-pressed", "true");
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({ path: "test-results/anatomy-desktop.png", fullPage: true });
});

test("clicking the 3D optic nerve selects OD and context loss preserves that selection", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Anatomy practice", exact: true }).click();
  const canvas = page.getByTestId("scene-OD").locator("canvas");
  await expect(canvas).toBeVisible();
  await expect.poll(async () => (await canvas.screenshot()).length).toBeGreaterThan(4000);
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error("Right eye has no viewport");
  await canvas.click({ position: { x: bounds.width * .81, y: bounds.height * .48 } });
  await expect(page.getByTestId("summary-OD")).toContainText("Optic nerve");
  await expect(page.getByTestId("summary-OS")).toContainText("No structure selected");
  await canvas.evaluate(element => {
    const gl = (element as HTMLCanvasElement).getContext("webgl2");
    if (!gl) throw new Error("Expected an active WebGL2 context");
    const extension = gl.getExtension("WEBGL_lose_context");
    if (!extension) throw new Error("Context loss extension is unavailable");
    extension.loseContext();
  });
  await expect(page.getByTestId("diagram-OD")).toBeVisible();
  await expect(page.getByTestId("diagram-OS")).toBeVisible();
  await expect(page.getByTestId("select-OD-optic_nerve")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("add-to-plan").click();
  await expect(page.getByTestId("plan-OD-optic_nerve")).toBeVisible();
});

test("missing WebGL falls back automatically and preserves the treatment workflow", async ({ page }) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, ...args: unknown[]) {
      if (kind.startsWith("webgl") || kind === "experimental-webgl") return null;
      return Reflect.apply(getContext, this, [kind, ...args]);
    } as typeof getContext;
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Anatomy practice", exact: true }).click();
  await expect(page.getByText("3D is unavailable on this device.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "3D exploration", exact: true })).toBeDisabled();
  await page.getByTestId("diagram-OD").getByRole("button", { name: "OD Optic nerve", exact: true }).click();
  await page.getByTestId("add-to-plan").click();
  await expect(page.getByTestId("plan-OD-optic_nerve")).toBeVisible();
});

test("all anatomical structures map to plan rows with keyboard accessible controls", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Anatomy practice", exact: true }).click();
  await page.getByRole("button", { name: "2D diagram", exact: true }).click();
  const buttons = page.locator('[data-testid^="select-OD-"]');
  await expect(buttons).toHaveCount(11);
  for (const button of await buttons.all()) {
    await button.focus();
    await page.keyboard.press("Space");
    await page.getByTestId("add-to-plan").click();
  }
  await expect(page.getByTestId("plan-count")).toHaveText("11");
  await expect(page.getByTestId("summary-OS")).toContainText("No structure selected");
});

test("tablet and Urdu preview preserve OD/OS placement without page overflow", async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.goto("/");
  await page.getByRole("button", { name: "Anatomy practice", exact: true }).click();
  await page.getByRole("button", { name: "2D diagram", exact: true }).click();
  await page.getByTestId("select-OD-macula").click();
  const odBefore = await page.getByTestId("diagram-OD").boundingBox();
  const osBefore = await page.getByTestId("diagram-OS").boundingBox();
  expect(odBefore!.x).toBeLessThan(osBefore!.x);
  await page.getByRole("button", { name: "Switch language", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByTestId("select-OD-macula")).toHaveAttribute("aria-pressed", "true");
  const odAfter = await page.getByTestId("diagram-OD").boundingBox();
  const osAfter = await page.getByTestId("diagram-OS").boundingBox();
  expect(odAfter!.x).toBeLessThan(osAfter!.x);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({ path: "test-results/anatomy-tablet-rtl.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Open navigation", exact: true }).click();
  await expect(page.getByRole("button", { name: "Close navigation", exact: true }).last()).toBeVisible();
});
