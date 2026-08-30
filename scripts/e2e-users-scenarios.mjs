import { chromium } from "playwright";

const BASE_URL = process.env.BASE_URL || "http://localhost:3101";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function loginAsAdmin(page) {
  await page.goto(`${BASE_URL}/admin/users-groups`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="login"]', "admin");
  await page.fill('input[name="password"]', "admin");
  await page.getByRole("button", { name: "Войти" }).click();
  await page.waitForURL(/\/admin\/users-groups/);
  await page.waitForSelector("#users-section table tbody tr");
}

async function runEditByLeftClick(page) {
  const row = page.locator("#users-section table tbody tr").first();
  const prompts = [];

  const dialogHandler = async (dialog) => {
    prompts.push(dialog.message());
    if (dialog.type() === "prompt") {
      await dialog.accept(dialog.defaultValue() || "");
      return;
    }
    await dialog.dismiss();
  };

  page.on("dialog", dialogHandler);
  const patchPromise = page.waitForResponse((res) => /\/api\/users\//.test(res.url()) && res.request().method() === "PATCH");
  await row.locator("button").first().click();
  const patch = await patchPromise;
  page.off("dialog", dialogHandler);

  assert(prompts.join("|") === "Имя|Логин|Email", `ЛКМ: неверная цепочка prompt: ${prompts.join(" -> ")}`);
  assert(patch.status() === 200, `ЛКМ: PATCH вернул ${patch.status()}`);
}

async function runEditByContextMenu(page) {
  const row = page.locator("#users-section table tbody tr").first();
  const prompts = [];

  const dialogHandler = async (dialog) => {
    prompts.push(dialog.message());
    if (dialog.type() === "prompt") {
      await dialog.accept(dialog.defaultValue() || "");
      return;
    }
    await dialog.dismiss();
  };

  page.on("dialog", dialogHandler);
  const patchPromise = page.waitForResponse((res) => /\/api\/users\//.test(res.url()) && res.request().method() === "PATCH");

  await row.click({ button: "right" });
  await page.getByRole("button", { name: "Редактировать пользователя" }).click();

  const patch = await patchPromise;
  page.off("dialog", dialogHandler);

  assert(prompts.join("|") === "Имя|Логин|Email", `ПКМ: неверная цепочка prompt: ${prompts.join(" -> ")}`);
  assert(patch.status() === 200, `ПКМ: PATCH вернул ${patch.status()}`);
}

async function runCreateUserScenario(page) {
  const login = `ui_user_${Date.now()}`;
  const email = `${login}@lms.local`;
  const name = `UI User ${Date.now()}`;

  await page.getByRole("link", { name: "Новый пользователь" }).click();
  await page.waitForURL(/\/admin\/users\/new/);

  await page.fill('input[name="name"]', name);
  await page.fill('input[name="login"]', login);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "ui_test_password");
  await page.selectOption('select[name="role"]', "USER");

  const createResponsePromise = page.waitForResponse(
    (res) => res.request().method() === "POST" && /\/admin\/users\/new/.test(res.url()),
    { timeout: 30000 }
  );
  await page.getByRole("button", { name: "Создать пользователя" }).click();
  const createResponse = await createResponsePromise;
  assert(createResponse.status() < 400, `Создание: POST вернул ${createResponse.status()}`);

  return { login };
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();

try {
  await loginAsAdmin(page);
  await runEditByLeftClick(page);
  await runEditByContextMenu(page);
  const created = await runCreateUserScenario(page);

  console.log("UI_SCENARIOS_OK");
  console.log("1) ЛКМ по имени пользователя -> редактирование открывается и PATCH успешен.");
  console.log("2) ПКМ по строке + 'Редактировать пользователя' -> редактирование открывается и PATCH успешен.");
  console.log("3) Кнопка 'Новый пользователь' -> форма создания открывается и submit выполняется успешно.");
  console.log(`CREATED_LOGIN=${created.login}`);
} finally {
  await browser.close();
}
