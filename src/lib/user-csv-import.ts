import { STANDARD_ROLE_NAMES } from "@/lib/roles";
import { buildUserDisplayName } from "@/lib/users";

export type UserCsvImportDraftRow = {
  rowNumber: number;
  firstName: string;
  lastName: string | null;
  name: string;
  email: string;
  login: string;
  loginSource: "provided" | "derived";
  roles: string[];
  groupName: string | null;
  departmentName: string | null;
  organizationName: string | null;
  issues: string[];
  warnings: string[];
};

export type UserCsvImportDraft = {
  delimiter: "," | ";";
  headers: string[];
  issues: string[];
  rows: UserCsvImportDraftRow[];
  summary: {
    totalRows: number;
    readyRows: number;
    errorRows: number;
    warningRows: number;
  };
};

type BuildUserCsvImportDraftArgs = {
  csvText: string;
  canEditAccessLevel: boolean;
  roleNames: string[];
  groupNames: string[];
  departmentNames: string[];
  organizationNames: string[];
};

const HEADER_ALIASES: Record<
  string,
  "email" | "name" | "firstName" | "lastName" | "login" | "role" | "group" | "department" | "organization"
> = {
  email: "email",
  e_mail: "email",
  mail: "email",
  почта: "email",
  name: "name",
  full_name: "name",
  full_name_fio: "name",
  fullname: "name",
  fio: "name",
  фио: "name",
  first_name: "firstName",
  firstname: "firstName",
  given_name: "firstName",
  имя: "firstName",
  last_name: "lastName",
  lastname: "lastName",
  family_name: "lastName",
  surname: "lastName",
  фамилия: "lastName",
  login: "login",
  username: "login",
  user_name: "login",
  логин: "login",
  role: "role",
  roles: "role",
  роль: "role",
  роли: "role",
  group: "group",
  group_name: "group",
  группа: "group",
  department: "department",
  department_name: "department",
  dept: "department",
  подразделение: "department",
  organization: "organization",
  organization_name: "organization",
  org: "organization",
  компания: "organization",
  организация: "organization",
};

function normalizeHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9а-яё_]/gi, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function canonicalHeader(value: string) {
  const normalized = normalizeHeader(value);
  return HEADER_ALIASES[normalized] ?? null;
}

function countDelimiter(line: string, delimiter: "," | ";") {
  let count = 0;
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === delimiter) {
      count += 1;
    }
  }

  return count;
}

function detectDelimiter(input: string): "," | ";" {
  const firstLine = input
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);

  if (!firstLine) return ",";

  return countDelimiter(firstLine, ";") > countDelimiter(firstLine, ",") ? ";" : ",";
}

function parseCsvCells(input: string, delimiter: "," | ";") {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = "";
  let inQuotes = false;

  const source = input.replace(/^\uFEFF/, "");

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const nextChar = source[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentCell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === delimiter) {
      currentRow.push(currentCell);
      currentCell = "";
      continue;
    }

    if (!inQuotes && char === "\r") {
      if (nextChar === "\n") {
        index += 1;
      }
      currentRow.push(currentCell);
      rows.push(currentRow);
      currentRow = [];
      currentCell = "";
      continue;
    }

    if (!inQuotes && char === "\n") {
      currentRow.push(currentCell);
      rows.push(currentRow);
      currentRow = [];
      currentCell = "";
      continue;
    }

    currentCell += char;
  }

  if (currentCell.length > 0 || currentRow.length > 0) {

    currentRow.push(currentCell);
    rows.push(currentRow);
  }

  return rows;
}

function trimCell(value: string | undefined) {
  return String(value ?? "").trim();
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function splitLegacyFullName(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" ") || null,
  };
}

function normalizeLookupKey(value: string) {
  return value.trim().toLocaleLowerCase("ru");
}

function normalizeLoginCandidate(value: string) {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-._]+|[-._]+$/g, "")
    .slice(0, 48);

  return normalized;
}

function deriveLoginFromEmail(email: string) {
  const emailLocalPart = email.split("@")[0] ?? "";
  return normalizeLoginCandidate(emailLocalPart);
}

function ensureUniqueLogin(baseLogin: string, usedLogins: Set<string>) {
  if (!usedLogins.has(baseLogin)) {
    usedLogins.add(baseLogin);
    return baseLogin;
  }

  let attempt = 2;
  while (attempt < 10_000) {
    const suffix = `-${attempt}`;
    const truncatedBase = baseLogin.slice(0, Math.max(1, 48 - suffix.length));
    const candidate = `${truncatedBase}${suffix}`;
    if (!usedLogins.has(candidate)) {
      usedLogins.add(candidate);
      return candidate;
    }
    attempt += 1;
  }

  return baseLogin;
}

function splitRoleValues(value: string) {
  return [...new Set(value.split(/[;|]/).map((item) => item.trim()).filter(Boolean))];
}

export function buildUserCsvImportDraft(args: BuildUserCsvImportDraftArgs): UserCsvImportDraft {
  const csvText = args.csvText.trim();
  if (!csvText) {
    return {
      delimiter: ",",
      headers: [],
      issues: ["Загрузите CSV-файл или вставьте CSV-содержимое."],
      rows: [],
      summary: {
        totalRows: 0,
        readyRows: 0,
        errorRows: 0,
        warningRows: 0,
      },
    };
  }

  const delimiter = detectDelimiter(csvText);
  const rawRows = parseCsvCells(csvText, delimiter).filter((row) => row.some((cell) => trimCell(cell)));
  if (rawRows.length === 0) {
    return {
      delimiter,
      headers: [],
      issues: ["CSV не содержит строк с данными."],
      rows: [],
      summary: {
        totalRows: 0,
        readyRows: 0,
        errorRows: 0,
        warningRows: 0,
      },
    };
  }

  const headerRow = rawRows[0] ?? [];
  const canonicalHeaders = headerRow.map((value) => canonicalHeader(value));
  const headers = headerRow.map(trimCell);
  const issues: string[] = [];

  const emailIndex = canonicalHeaders.findIndex((header) => header === "email");
  const fullNameIndex = canonicalHeaders.findIndex((header) => header === "name");
  const firstNameIndex = canonicalHeaders.findIndex((header) => header === "firstName");
  const lastNameIndex = canonicalHeaders.findIndex((header) => header === "lastName");
  const loginIndex = canonicalHeaders.findIndex((header) => header === "login");
  const roleIndex = canonicalHeaders.findIndex((header) => header === "role");
  const groupIndex = canonicalHeaders.findIndex((header) => header === "group");
  const departmentIndex = canonicalHeaders.findIndex((header) => header === "department");
  const organizationIndex = canonicalHeaders.findIndex((header) => header === "organization");

  if (emailIndex < 0) {
    issues.push("Не найден обязательный столбец `email`.");
  }
  if (firstNameIndex < 0 && fullNameIndex < 0) {
    issues.push("Не найден обязательный столбец `firstName` или `имя`.");
  }

  const roleNameMap = new Map(args.roleNames.map((roleName) => [normalizeLookupKey(roleName), roleName]));
  const groupNameMap = new Map(args.groupNames.map((groupName) => [normalizeLookupKey(groupName), groupName]));
  const departmentNameMap = new Map(
    args.departmentNames.map((departmentName) => [normalizeLookupKey(departmentName), departmentName])
  );
  const organizationNameMap = new Map(
    args.organizationNames.map((organizationName) => [normalizeLookupKey(organizationName), organizationName])
  );

  const usedSuggestedLogins = new Set<string>();
  const seenEmails = new Set<string>();
  const seenExplicitLogins = new Set<string>();

  const rows = rawRows.slice(1).map((row, index) => {
    const rowNumber = index + 2;
    const legacyName = trimCell(fullNameIndex >= 0 ? row[fullNameIndex] : "");
    const legacyNameParts = splitLegacyFullName(legacyName);
    const firstName = trimCell(firstNameIndex >= 0 ? row[firstNameIndex] : "") || legacyNameParts.firstName;
    const lastName = trimCell(lastNameIndex >= 0 ? row[lastNameIndex] : "") || legacyNameParts.lastName;
    const name = buildUserDisplayName(firstName, lastName);
    const email = trimCell(emailIndex >= 0 ? row[emailIndex] : "").toLowerCase();
    const rawLogin = trimCell(loginIndex >= 0 ? row[loginIndex] : "");
    const rawRoleValue = trimCell(roleIndex >= 0 ? row[roleIndex] : "");
    const rawGroupName = trimCell(groupIndex >= 0 ? row[groupIndex] : "");
    const rawDepartmentName = trimCell(departmentIndex >= 0 ? row[departmentIndex] : "");
    const rawOrganizationName = trimCell(organizationIndex >= 0 ? row[organizationIndex] : "");
    const issuesForRow: string[] = [];
    const warnings: string[] = [];

    if (!firstName) {
      issuesForRow.push("Не указано имя.");
    }

    if (!email) {
      issuesForRow.push("Не указан email.");
    } else if (!isValidEmail(email)) {
      issuesForRow.push("Укажите корректный email.");
    } else if (seenEmails.has(email)) {
      issuesForRow.push("Email дублируется в CSV.");
    } else {
      seenEmails.add(email);
    }

    const baseLogin = normalizeLoginCandidate(rawLogin || deriveLoginFromEmail(email));
    const loginSource: "provided" | "derived" = rawLogin ? "provided" : "derived";
    let login = baseLogin;

    if (!baseLogin) {
      issuesForRow.push("Не удалось определить логин. Добавьте столбец `login` или используйте email с латиницей.");
    } else if (loginSource === "provided") {
      if (seenExplicitLogins.has(baseLogin)) {
        issuesForRow.push("Логин дублируется в CSV.");
      } else {
        seenExplicitLogins.add(baseLogin);
        usedSuggestedLogins.add(baseLogin);
      }
    } else {
      login = ensureUniqueLogin(baseLogin, usedSuggestedLogins);
      if (login !== baseLogin) {
        warnings.push(`Логин будет создан автоматически: ${login}.`);
      } else {
        warnings.push(`Логин будет создан автоматически: ${login}.`);
      }
    }

    const roles = args.canEditAccessLevel
      ? (() => {
          if (!rawRoleValue) {
            return [STANDARD_ROLE_NAMES.STUDENT];
          }

          const resolvedRoles = splitRoleValues(rawRoleValue)
            .map((roleValue) => roleNameMap.get(normalizeLookupKey(roleValue)) ?? null)
            .filter((roleValue): roleValue is string => Boolean(roleValue));

          if (resolvedRoles.length === 0) {
            issuesForRow.push("Не удалось распознать роль из CSV.");
            return [STANDARD_ROLE_NAMES.STUDENT];
          }

          if (resolvedRoles.length !== splitRoleValues(rawRoleValue).length) {
            issuesForRow.push("Одна или несколько ролей не найдены в системе.");
          }

          return [...new Set(resolvedRoles)];
        })()
      : [STANDARD_ROLE_NAMES.STUDENT];

    const groupName = rawGroupName ? groupNameMap.get(normalizeLookupKey(rawGroupName)) ?? null : null;
    if (rawGroupName && !groupName) {
      issuesForRow.push("Группа из CSV не найдена.");
    }

    const departmentName = rawDepartmentName
      ? departmentNameMap.get(normalizeLookupKey(rawDepartmentName)) ?? null
      : null;
    if (rawDepartmentName && !departmentName) {
      issuesForRow.push("Подразделение из CSV не найдено.");
    }

    const organizationName = rawOrganizationName
      ? organizationNameMap.get(normalizeLookupKey(rawOrganizationName)) ?? null
      : null;
    if (rawOrganizationName && !organizationName) {
      issuesForRow.push("Организация из CSV не найдена.");
    }

    if (!args.canEditAccessLevel && rawRoleValue) {
      warnings.push("Колонка `role` будет проигнорирована: HR импортирует только учеников.");
    }

    return {
      firstName,
      lastName,
      rowNumber,
      name,
      email,
      login,
      loginSource,
      roles,
      groupName,
      departmentName,
      organizationName,
      issues: issuesForRow,
      warnings,
    } satisfies UserCsvImportDraftRow;
  });

  return {
    delimiter,
    headers,
    issues,
    rows,
    summary: {
      totalRows: rows.length,
      readyRows: rows.filter((row) => row.issues.length === 0).length,
      errorRows: rows.filter((row) => row.issues.length > 0).length,
      warningRows: rows.filter((row) => row.warnings.length > 0).length,
    },
  };
}
