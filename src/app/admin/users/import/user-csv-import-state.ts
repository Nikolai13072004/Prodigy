export type UserCsvImportResultRow = {
  rowNumber: number;
  name: string;
  email: string;
  login: string;
  roles: string[];
  status: "imported" | "error";
  detail: string;
};

export type UserCsvImportActionState = {
  status: "idle" | "success" | "error";
  message: string | null;
  summary: {
    totalRows: number;
    importedCount: number;
    errorCount: number;
    queuedEmailsCount: number;
  } | null;
  rows: UserCsvImportResultRow[];
};

export const INITIAL_USER_CSV_IMPORT_STATE: UserCsvImportActionState = {
  status: "idle",
  message: null,
  summary: null,
  rows: [],
};
