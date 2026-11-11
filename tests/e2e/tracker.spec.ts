import { test, expect, type Page } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { db } from "../../src/server/db.ts";
import { hashToken, scopes } from "../../src/server/auth.ts";

async function signIn(page: Page, name: string) {
  await page.getByRole("button", { name: /Explore demo personas/ }).click();
  await page.getByRole("radio", { name, exact: true }).check();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

test("independent review and audited resolution", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await signIn(page, "Alex Morgan");
  await expect(
    page.getByRole("heading", { name: "Dashboard" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Needs attention" }),
  ).toBeVisible();
  await expect(page.locator("tbody tr").first()).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("overview.png"),
    fullPage: true,
  });
  const geometry = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    overflowing: [...document.querySelectorAll("body *")]
      .filter(
        (element) =>
          element.getBoundingClientRect().right >
          document.documentElement.clientWidth + 1,
      )
      .slice(0, 12)
      .map((element) => ({
        tag: element.tagName,
        class: element.className,
        right: element.getBoundingClientRect().right,
      })),
  }));
  expect(geometry.width, JSON.stringify(geometry)).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );
  await page.getByRole("link", { name: "Create issue", exact: true }).click();
  let title = `E2E access review ${testInfo.project.name} ${Date.now()}`;
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page
    .getByLabel("Description", { exact: true })
    .fill(
      "Review privileged access, remove unused accounts, and retain the signed review record.",
    );
  await page.getByRole("radio", { name: /High/ }).check();
  await page.getByRole("combobox", { name: "Owner" }).click();
  await page.locator('[role="option"][data-value="demo-analyst"]').click();
  await page
    .getByLabel("Target resolution date", { exact: true })
    .fill("2020-01-01");
  await page
    .getByRole("button", { name: "Save and register issue", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Edit issue details" }).first().click();
  await expect(page.locator("h1")).toHaveText("Issue details");
  title = `${title} updated`;
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByRole("combobox", { name: "Status" }).click();
  await page.getByRole("option", { name: "In progress" }).click();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Run analysis" }).click();
  await expect(
    page.getByText("Required before review", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Evidence URL", { exact: true })
    .fill("https://example.com/signed-review");
  await page
    .getByLabel("Description", { exact: true })
    .first()
    .fill("Signed access review record");
  await page.getByRole("button", { name: "Attach reference" }).click();
  await expect(
    page.getByRole("link", { name: "Signed access review record" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Run analysis" }).click();
  await expect(
    page.getByText("Awaiting an independent approver."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Approve closure" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Sign out", exact: true })
    .click();
  await signIn(page, "Jordan Lee");
  await page
    .getByLabel("Approval rationale")
    .fill(
      "Independently reviewed the attached evidence and authorize closure.",
    );
  await page.getByRole("button", { name: "Approve closure" }).click();
  await expect(
    page.getByRole("button", { name: "Execute approved plan" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Sign out", exact: true })
    .click();
  await signIn(page, "Alex Morgan");
  await page.getByRole("button", { name: "Execute approved plan" }).click();
  await expect(page.getByText("Plan executed", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save changes" })).toHaveCount(
    0,
  );
  await page.reload();
  await expect(page.getByText("Plan executed", { exact: true })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("completed-issue.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(errors).toEqual([]);
});

test("viewer can filter issues but cannot create or edit", async ({ page }) => {
  await page.goto("/issues");
  await signIn(page, "Sam Rivera");
  await page
    .getByRole("searchbox", { name: "Search issues" })
    .fill("Quarterly access review overdue");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(
    page.getByRole("link", { name: "Create issue", exact: true }),
  ).toHaveCount(0);
  await page.goto("/issues/new");
  await expect(
    page.getByText("Your role cannot create issues.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Approvals" }),
  ).toHaveCount(0);
  await page.goto("/approvals");
  await expect(
    page.getByText("Approver access is required to view the approvals queue.", { exact: false }),
  ).toBeVisible();
});

test("analysts cannot view or access the approvals queue", async ({ page }) => {
  await page.goto("/approvals");
  await signIn(page, "Alex Morgan");
  await page.goto("/");
  await expect(
    page.getByText("Approver access is required to view the approvals queue.", { exact: false }),
  ).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Pending human approvals" })).toHaveCount(0);
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Approvals" }),
  ).toHaveCount(0);
  await page.goto("/approvals");
  await expect(
    page.getByText("Approver access is required to view the approvals queue.", { exact: false }),
  ).toBeVisible();
});

test("create issue severity choices stay balanced and interactive", async ({
  page,
}) => {
  await page.goto("/issues/new");
  await signIn(page, "Alex Morgan");
  await expect(page.getByLabel("Title", { exact: true })).not.toHaveAttribute("placeholder");
  const cards = page.locator(".severity-option");
  await expect(cards).toHaveCount(4);
  const widths = await cards.evaluateAll((elements) =>
    elements.map((element) => element.getBoundingClientRect().width),
  );
  expect(Math.max(...widths) - Math.min(...widths)).toBeLessThan(2);

  for (const severity of ["High", "Critical"]) {
    const option = page.getByRole("radio", { name: new RegExp(severity) });
    await option.check();
    await expect(option).toBeChecked();
    await expect(option.locator("xpath=..")).toHaveCSS(
      "background-color",
      severity === "Critical" ? "rgb(255, 241, 239)" : "rgb(232, 246, 242)",
    );
  }
});

test("approver can review the seeded pending proposal", async ({ page }) => {
  await page.goto("/issues/CW-103");
  await signIn(page, "Jordan Lee");
  await expect(page.getByRole("heading", { name: "Incident response exercise evidence" })).toBeVisible();
  const approve = page.getByRole("button", { name: "Approve closure" });
  await expect(approve).toBeVisible();
  await expect(approve).toBeDisabled();
  await expect(page.getByRole("button", { name: "Reject proposal" })).toBeVisible();
  await page.getByLabel("Approval rationale").fill("The exercise evidence supports the recorded closure criteria.");
  await expect(approve).toBeEnabled();
});

test("register controls, global audit log, and reports use persisted data", async ({
  page,
}) => {
  await page.goto("/issues");
  await signIn(page, "Alex Morgan");
  if (page.viewportSize()!.width > 600) {
    await expect(
      page.getByRole("columnheader", { name: "Evidence" }),
    ).toBeVisible();
  } else {
    await expect(page.locator("tbody tr").first()).toContainText(/\d+ links?/);
  }
  const compact = page.locator(".view-switch button").nth(1);
  await compact.click();
  await expect(compact).toHaveAttribute("aria-pressed", "true");
  const issueTable = page.locator(".issue-register .table-scroll");
  await expect(issueTable).toHaveClass(/compact-view/);
  const compactCellPadding = await issueTable
    .locator("tbody td")
    .first()
    .evaluate((cell) => Number.parseFloat(getComputedStyle(cell).paddingTop));
  const tableMode = page.locator(".view-switch button").first();
  await tableMode.click();
  await expect(tableMode).toHaveAttribute("aria-pressed", "true");
  await expect(issueTable).not.toHaveClass(/compact-view/);
  const tableCellPadding = await issueTable
    .locator("tbody td")
    .first()
    .evaluate((cell) => Number.parseFloat(getComputedStyle(cell).paddingTop));
  expect(compactCellPadding).toBeLessThan(tableCellPadding);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  expect((await download).suggestedFilename()).toMatch(
    /^compliwise-issues\.csv$/,
  );
  await page.goto("/audit");
  await expect(page.locator("h1")).toHaveText("Audit logs");
  await expect(page.locator("tbody tr").first()).toBeVisible();
  await page
    .getByRole("searchbox", { name: "Search audit logs" })
    .fill("ISSUE_CREATED");
  await expect(page.locator("tbody tr").first()).toContainText("Issue created");
  await page.goto("/reports");
  await expect(
    page.getByRole("heading", { name: "Compliance reports" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Issues by severity" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Issues by status" }),
  ).toBeVisible();
});

test("login returns to the requested issue and logout requires confirmation", async ({
  page,
}, testInfo) => {
  let logoutRequests = 0;
  page.on("request", (request) => {
    if (
      request.method() === "DELETE" &&
      new URL(request.url()).pathname === "/api/auth/session"
    )
      logoutRequests++;
  });
  await page.goto("/issues/CW-101");
  await expect(page).toHaveURL(/\/login\?next=/);
  await page.getByRole("button", { name: /Explore demo personas/ }).click();
  await expect(
    page.getByRole("radio", { name: "Alex Morgan", exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeEnabled();
  await page.getByRole("radio", { name: "Alex Morgan", exact: true }).check();
  await expect(page).toHaveURL(/\/login\?next=/);
  await page.screenshot({
    path: testInfo.outputPath("login.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/issues\/CW-101$/);
  await expect(
    page.getByRole("heading", {
      name: "Quarterly access review overdue",
      exact: true,
    }),
  ).toBeVisible();
  const trigger = page.getByRole("button", { name: "Sign out", exact: true });
  const dialog = page.getByRole("dialog", { name: "Sign out" });
  await trigger.click();
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Cancel", exact: true }),
  ).toBeFocused();
  await page.screenshot({
    path: testInfo.outputPath("logout-modal.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  expect(logoutRequests).toBe(0);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/auth/session", async (route) => {
    if (route.request().method() === "DELETE") await gate;
    await route.continue();
  });
  try {
    await trigger.click();
    await dialog.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(
      dialog.getByRole("button", { name: "Signing out...", exact: true }),
    ).toBeDisabled();
    await expect(
      dialog.getByRole("button", { name: "Cancel", exact: true }),
    ).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
  } finally {
    release();
  }
  await expect(page).toHaveURL(/\/login\?next=/);
  expect(logoutRequests).toBe(1);
  expect((await page.request.get("/api/auth/session")).status()).toBe(401);
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "Welcome back",
    }),
  ).toBeVisible();
});

test("failed logout preserves the session and leaves the modal recoverable", async ({
  page,
}) => {
  await page.goto("/");
  await signIn(page, "Alex Morgan");
  await expect(
    page.getByRole("heading", { name: "Dashboard" }),
  ).toBeVisible();
  await page.route("**/api/auth/session", async (route) => {
    if (route.request().method() === "DELETE")
      await route.fulfill({
        status: 503,
        json: {
          error: { message: "Sign-out service unavailable. Try again." },
        },
      });
    else await route.continue();
  });
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveText(
    "Sign-out service unavailable. Try again.",
  );
  expect((await page.request.get("/api/auth/session")).status()).toBe(200);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Dashboard" }),
  ).toBeVisible();
});

test("login errors are recoverable and external return URLs are ignored", async ({
  page,
}) => {
  await page.goto("/login?next=https%3A%2F%2Funtrusted.example");
  await page.route("**/api/auth/session", async (route) => {
    if (route.request().method() === "POST")
      await route.fulfill({
        status: 503,
        json: { error: { message: "Sign-in service unavailable. Try again." } },
      });
    else await route.continue();
  });
  await signIn(page, "Sam Rivera");
  await expect(
    page.getByText("Sign-in service unavailable. Try again.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeEnabled();
  await expect(page.getByRole("radio", { name: "Sam Rivera" })).toBeChecked();
  await page.unroute("**/api/auth/session");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL("/");
  await expect(
    page.getByRole("heading", { name: "Dashboard" }),
  ).toBeVisible();
});

test("MCP resolution requires human approval and executes once", async ({
  request,
  baseURL,
}, testInfo) => {
  expect(new URL(process.env.DATABASE_URL!).searchParams.get("schema")).toBe(
    "tracker_test",
  );
  const token = randomBytes(32).toString("base64url");
  const credential = await db.serviceToken.create({
    data: {
      userId: "remediation-agent",
      tokenHash: hashToken(token),
      scopes: [...scopes],
      expiresAt: new Date(Date.now() + 60000),
    },
  });
  const env = Object.fromEntries(
    Object.entries({
      ...process.env,
      MCP_SERVICE_TOKEN: token,
      MCP_API_URL: baseURL,
    }).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
  const client = new Client({ name: "e2e-agent", version: "1" });
  const headers = { Origin: baseURL! };
  async function tool(name: string, args: Record<string, unknown>) {
    const result = await client.callTool({ name, arguments: args });
    expect(result.isError).not.toBe(true);
    return (result.structuredContent as { data: Record<string, unknown> }).data;
  }
  try {
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: ["--env-file=.env", "src/mcp/index.ts"],
        env,
        stderr: "inherit",
      }),
    );
    expect(
      (
        await request.post("/api/auth/session", {
          headers,
          data: { userId: "demo-analyst" },
        })
      ).ok(),
    ).toBe(true);
    const response = await request.post("/api/issues", {
      headers,
      data: {
        title: `MCP review ${testInfo.project.name} ${Date.now()}`,
        description:
          "Perform access review externally and submit evidence for independent verification.",
        ownerId: "demo-analyst",
        severity: "HIGH",
        dueDate: "2020-01-01",
      },
    });
    expect(response.status()).toBe(201);
    const issue = await response.json();
    const blocked = await tool("analyze_issue", {
      issueId: issue.id,
      version: 1,
    });
    expect(blocked.state).toBe("BLOCKED");
    const denied = await client.callTool({
      name: "execute_approved_plan",
      arguments: { runId: blocked.id },
    });
    expect(denied.isError).toBe(true);
    await tool("add_evidence_reference", {
      issueId: issue.id,
      version: 1,
      url: "https://example.com/e2e-mcp-review",
      description: "Illustrative test evidence for human review",
    });
    const current = await tool("get_issue", { issueId: issue.id });
    const proposal = await tool("analyze_issue", {
      issueId: issue.id,
      version: current.version,
    });
    expect(proposal.state).toBe("PROPOSED");
    expect(
      (
        await request.post("/api/auth/session", {
          headers,
          data: { userId: "demo-approver" },
        })
      ).ok(),
    ).toBe(true);
    expect(
      (
        await request.post(`/api/plans/${proposal.id}/review`, {
          headers,
          data: {
            approved: true,
            note: "Independent test reviewer inspected the reference and authorized closure.",
          },
        })
      ).ok(),
    ).toBe(true);
    expect(
      (await tool("execute_approved_plan", { runId: proposal.id }))
        .alreadyExecuted,
    ).toBe(false);
    expect(
      (await tool("execute_approved_plan", { runId: proposal.id }))
        .alreadyExecuted,
    ).toBe(true);
    expect((await tool("get_issue", { issueId: issue.id })).status).toBe(
      "COMPLETED",
    );
    const history = await tool("get_issue_audit", { issueId: issue.id });
    expect(
      (history.items as { action: string }[]).filter(
        (event) => event.action === "PLAN_EXECUTED",
      ),
    ).toHaveLength(1);
  } finally {
    await client.close();
    await db.serviceToken.delete({ where: { id: credential.id } });
    await request.delete("/api/auth/session", { headers });
    await db.$disconnect();
  }
});
