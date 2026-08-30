import assert from "node:assert/strict";
import { test } from "node:test";
import { buildUserCsvImportDraft } from "./user-csv-import";

// Разбор CSV для массового импорта пользователей: определение разделителя,
// синонимы заголовков (в т.ч. русские), валидация строк, деривация логинов,
// разрешение ролей/групп/подразделений/организаций.

function draft(csvText: string, over: Partial<Parameters<typeof buildUserCsvImportDraft>[0]> = {}) {
  return buildUserCsvImportDraft({
    csvText,
    canEditAccessLevel: true,
    roleNames: ["Ученик", "HR-менеджер", "Разработчик курсов"],
    groupNames: ["Группа А", "Отдел продаж"],
    departmentNames: ["Бухгалтерия"],
    organizationNames: ["ООО Ромашка"],
    ...over,
  });
}

const STUDENT = "Ученик";

// -------------------------------------------------------------- пустой ввод

test("пустой CSV → подсказка загрузить файл", () => {
  const result = draft("   ");
  assert.deepEqual(result.issues, ["Загрузите CSV-файл или вставьте CSV-содержимое."]);
  assert.deepEqual(result.rows, []);
  assert.equal(result.summary.totalRows, 0);
});

test("CSV из одних пустых ячеек → нет строк с данными", () => {
  const result = draft(",,\n,,");
  assert.deepEqual(result.issues, ["CSV не содержит строк с данными."]);
  assert.deepEqual(result.rows, []);
});

// ------------------------------------------------------ разделитель и заголовки

test("автоопределение разделителя ; и латинских заголовков", () => {
  const result = draft("email;name\nu@x.ru;Иван Петров");
  assert.equal(result.delimiter, ";");
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].email, "u@x.ru");
  assert.equal(result.rows[0].firstName, "Иван");
  assert.equal(result.rows[0].lastName, "Петров");
  assert.equal(result.rows[0].name, "Иван Петров");
});

test("русские синонимы заголовков распознаются", () => {
  const result = draft(
    "почта,фио,роль,группа,подразделение,организация\n" +
      "u@x.ru,Иван Петров,HR-менеджер,Группа А,Бухгалтерия,ООО Ромашка",
  );
  const row = result.rows[0];
  assert.equal(row.email, "u@x.ru");
  assert.equal(row.name, "Иван Петров");
  assert.deepEqual(row.roles, ["HR-менеджер"]);
  assert.equal(row.groupName, "Группа А");
  assert.equal(row.departmentName, "Бухгалтерия");
  assert.equal(row.organizationName, "ООО Ромашка");
  assert.deepEqual(row.issues, []);
});

test("отсутствие обязательных столбцов фиксируется на уровне файла", () => {
  assert.ok(draft("имя\nИван").issues.includes("Не найден обязательный столбец `email`."));
  assert.ok(
    draft("email\nu@x.ru").issues.includes("Не найден обязательный столбец `firstName` или `имя`."),
  );
});

// -------------------------------------------------------------- валидная строка

test("валидная строка готова к импорту, логин деривится из email", () => {
  const result = draft("email,имя\njohn.doe@corp.ru,Иван");
  const row = result.rows[0];
  assert.equal(row.login, "john.doe");
  assert.equal(row.loginSource, "derived");
  assert.deepEqual(row.roles, [STUDENT], "роль по умолчанию — ученик");
  assert.deepEqual(row.issues, []);
  assert.equal(row.warnings.some((w) => w.includes("Логин будет создан автоматически")), true);
  assert.equal(result.summary.readyRows, 1);
  assert.equal(result.summary.errorRows, 0);
  assert.equal(result.summary.warningRows, 1);
});

test("устаревшее поле ФИО разбивается на имя и фамилию", () => {
  const row = draft("email,фио\nu@x.ru,Иван Петров Сергеевич").rows[0];
  assert.equal(row.firstName, "Иван");
  assert.equal(row.lastName, "Петров Сергеевич");
  assert.equal(row.name, "Иван Петров Сергеевич");
});

// -------------------------------------------------------------- email

test("невалидный, отсутствующий и дублирующийся email помечаются", () => {
  assert.ok(draft("email,имя\nне-почта,Иван").rows[0].issues.includes("Укажите корректный email."));
  assert.ok(draft("email,имя\n,Иван").rows[0].issues.includes("Не указан email."));

  const dup = draft("email,имя\nU@X.ru,Иван\nu@x.ru,Пётр");
  assert.deepEqual(dup.rows[0].issues, [], "первый — ок");
  assert.ok(dup.rows[1].issues.includes("Email дублируется в CSV."), "дубль без учёта регистра");
});

test("нет имени → ошибка строки", () => {
  assert.ok(draft("email,имя\nu@x.ru,").rows[0].issues.includes("Не указано имя."));
});

// -------------------------------------------------------------- логины

test("явный логин: источник provided, дубликат — ошибка", () => {
  const result = draft("email,имя,логин\nu1@x.ru,Иван,ivan\nu2@x.ru,Пётр,ivan");
  assert.equal(result.rows[0].loginSource, "provided");
  assert.equal(result.rows[0].login, "ivan");
  assert.equal(result.rows[0].warnings.length, 0, "явный логин без авто-предупреждения");
  assert.ok(result.rows[1].issues.includes("Логин дублируется в CSV."));
});

test("деривированные логины уникализируются суффиксом", () => {
  const result = draft("email,имя\nivan@a.ru,Иван\nivan@b.ru,Пётр");
  assert.equal(result.rows[0].login, "ivan");
  assert.equal(result.rows[1].login, "ivan-2");
  assert.ok(result.rows[1].warnings.some((w) => w.includes("ivan-2")));
});

test("email без латиницы в локальной части → логин не определить", () => {
  const row = draft("email,имя\nиван@x.ru,Иван").rows[0];
  assert.ok(
    row.issues.some((issue) => issue.startsWith("Не удалось определить логин")),
    "кириллический логин не деривится",
  );
});

// -------------------------------------------------------------- роли

test("разрешение ролей: неизвестная, частично неизвестная, множественная", () => {
  const unknown = draft("email,имя,роль\nu@x.ru,Иван,Босс").rows[0];
  assert.ok(unknown.issues.includes("Не удалось распознать роль из CSV."));
  assert.deepEqual(unknown.roles, [STUDENT], "откат на ученика");

  const multi = draft("email,имя,роль\nu@x.ru,Иван,HR-менеджер|Разработчик курсов").rows[0];
  assert.deepEqual(multi.roles, ["HR-менеджер", "Разработчик курсов"]);

  const partial = draft("email,имя,роль\nu@x.ru,Иван,HR-менеджер|Неизвестно").rows[0];
  assert.ok(partial.issues.includes("Одна или несколько ролей не найдены в системе."));
  assert.deepEqual(partial.roles, ["HR-менеджер"]);

  const caseInsensitive = draft("email,имя,роль\nu@x.ru,Иван,hr-менеджер").rows[0];
  assert.deepEqual(caseInsensitive.roles, ["HR-менеджер"], "регистр роли не важен");
});

test("HR без права на уровень доступа: роль игнорируется, только ученик", () => {
  const row = draft("email,имя,роль\nu@x.ru,Иван,HR-менеджер", { canEditAccessLevel: false }).rows[0];
  assert.deepEqual(row.roles, [STUDENT]);
  assert.ok(row.warnings.includes("Колонка `role` будет проигнорирована: HR импортирует только учеников."));
});

// ---------------------------------------------------- группа/подразделение/организация

test("неизвестные группа/подразделение/организация фиксируются", () => {
  const row = draft("email,имя,группа,подразделение,организация\nu@x.ru,Иван,Нет,Нет,Нет").rows[0];
  assert.ok(row.issues.includes("Группа из CSV не найдена."));
  assert.ok(row.issues.includes("Подразделение из CSV не найдено."));
  assert.ok(row.issues.includes("Организация из CSV не найдена."));
  assert.equal(row.groupName, null);
});

// -------------------------------------------------------------- кавычки CSV

test("кавычки: разделитель и экранированные кавычки внутри ячейки", () => {
  const commaInside = draft('email,фио\nu@x.ru,"Петров, Иван"').rows[0];
  assert.equal(commaInside.name, "Петров, Иван", "запятая внутри кавычек не делит ячейку");

  const escaped = draft('email,фио\nu@x.ru,"Иван ""Гроза"""').rows[0];
  assert.equal(escaped.name, 'Иван "Гроза"', "удвоенные кавычки → одна");
});
