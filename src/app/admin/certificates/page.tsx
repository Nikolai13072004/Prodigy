import type { ReactNode } from "react";
import Link from "next/link";
import {
  issueCertificateManually,
  restoreCertificate,
  revokeCertificate,
} from "@/app/actions/certificate-actions";
import { Badge, Button, Field, Input, TD, TH, THead, TR, Table } from "@/components/ui";
import { requirePermission } from "@/lib/auth-guards";
import { PERMISSIONS } from "@/lib/roles";
import { selectCertificatesRegistry } from "./_queries/select-certificates-registry";

type Props = {
  searchParams: Promise<{
    q?: string;
    revoked?: string;
    restored?: string;
    issued?: string;
    error?: string;
  }>;
};

const dateFormat = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

const VIA_LABELS: Record<string, string> = {
  LEARNING: "Материал",
  ASSESSMENT_SUBMIT: "Тест",
  ASSESSMENT_REVIEW: "Проверка",
  MANUAL: "Вручную",
};

function issueBanner(status: string | undefined): string | null {
  if (!status) return null;
  if (status === "ISSUED") return "Сертификат выдан.";
  if (status === "ALREADY_ISSUED") return "У пользователя уже есть сертификат по этому курсу.";
  if (status === "NOT_ELIGIBLE") return "Сертификат не выдан: условия не выполнены.";
  return null;
}

const BANNER_TONE: Record<"success" | "warning" | "danger", string> = {
  success: "bg-[var(--success-soft)] text-[var(--success)]",
  warning: "bg-[var(--warning-soft)] text-[var(--warning)]",
  danger: "bg-[var(--danger-soft)] text-[var(--danger)]",
};

function Banner({ tone, children }: { tone: "success" | "warning" | "danger"; children: ReactNode }) {
  return <div className={`mt-4 rounded-lg px-4 py-2 text-sm ${BANNER_TONE[tone]}`}>{children}</div>;
}

export default async function AdminCertificatesPage({ searchParams }: Props) {
  await requirePermission(PERMISSIONS.CERTIFICATES_MANAGE);
  const sp = await searchParams;
  const query = sp.q ?? "";
  const rows = await selectCertificatesRegistry(query);

  const issuedMessage = issueBanner(sp.issued);
  const errorMessage =
    sp.error === "notfound"
      ? "Сертификат не найден."
      : sp.error === "missing"
        ? "Укажите ID курса и пользователя."
        : null;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-semibold text-[var(--ink)]">Сертификаты</h1>
      <p className="mt-1 text-sm text-[var(--ink-muted)]">
        Реестр выданных сертификатов о прохождении курсов.
      </p>

      {sp.revoked ? <Banner tone="warning">Сертификат аннулирован.</Banner> : null}
      {sp.restored ? <Banner tone="success">Сертификат восстановлен.</Banner> : null}
      {issuedMessage ? <Banner tone="success">{issuedMessage}</Banner> : null}
      {errorMessage ? <Banner tone="danger">{errorMessage}</Banner> : null}

      <form method="get" className="mt-6 flex flex-wrap items-center gap-2">
        <Input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Серийный номер, ученик или курс"
          className="max-w-md"
        />
        <Button type="submit">Найти</Button>
        {query ? (
          <Link href="/admin/certificates" className="text-sm text-[var(--ink-muted)] underline">
            Сбросить
          </Link>
        ) : null}
      </form>

      <details className="mt-4 rounded-[var(--radius-panel)] border border-[var(--line)] bg-[var(--surface-raised)] p-4">
        <summary className="cursor-pointer text-sm font-medium text-[var(--ink)]">
          Выдать сертификат вручную
        </summary>
        <form action={issueCertificateManually} className="mt-3 flex flex-wrap items-end gap-3">
          <Field label="ID курса" htmlFor="cert-course">
            <Input id="cert-course" name="courseId" required className="w-64" />
          </Field>
          <Field label="ID пользователя" htmlFor="cert-user">
            <Input id="cert-user" name="userId" required className="w-64" />
          </Field>
          <Button type="submit">Выдать</Button>
        </form>
        <p className="mt-2 text-xs text-[var(--ink-muted)]">
          Принудительная выдача обходит проверку завершённости. Проверка идемпотентна: повторная выдача
          вернёт существующий сертификат.
        </p>
      </details>

      <div className="mt-6">
        <Table className="min-w-[820px]">
          <THead>
            <TR>
              <TH>Серийный номер</TH>
              <TH>Ученик</TH>
              <TH>Курс</TH>
              <TH>Выдан</TH>
              <TH>Канал</TH>
              <TH>Статус</TH>
              <TH>Действия</TH>
            </TR>
          </THead>
          <tbody>
            {rows.length === 0 ? (
              <TR>
                <TD colSpan={7} className="py-8 text-center text-[var(--ink-muted)]">
                  {query ? "Ничего не найдено." : "Сертификатов пока нет."}
                </TD>
              </TR>
            ) : (
              rows.map((row) => {
                const isRevoked = row.status === "REVOKED";
                return (
                  <TR key={row.id}>
                    <TD>
                      <Link
                        href={`/certificates/${row.serial}`}
                        className="font-mono text-xs text-[var(--accent)] underline"
                      >
                        {row.serial.slice(0, 12)}…
                      </Link>
                    </TD>
                    <TD>
                      <div className="text-[var(--ink)]">{row.learnerName}</div>
                      <div className="text-xs text-[var(--ink-muted)]">{row.learnerLogin}</div>
                    </TD>
                    <TD className="text-[var(--ink-muted)]">{row.courseTitle}</TD>
                    <TD className="text-[var(--ink-muted)]">{dateFormat.format(row.issuedAt)}</TD>
                    <TD className="text-[var(--ink-muted)]">{VIA_LABELS[row.issuedVia] ?? row.issuedVia}</TD>
                    <TD>
                      <Badge tone={isRevoked ? "danger" : "success"}>
                        {isRevoked ? "Аннулирован" : "Действителен"}
                      </Badge>
                    </TD>
                    <TD>
                      {isRevoked ? (
                        <form action={restoreCertificate}>
                          <input type="hidden" name="certificateId" value={row.id} />
                          <Button type="submit" variant="secondary" size="sm">
                            Восстановить
                          </Button>
                        </form>
                      ) : (
                        <form action={revokeCertificate} className="flex items-center gap-1">
                          <input type="hidden" name="certificateId" value={row.id} />
                          <input
                            name="reason"
                            placeholder="Причина"
                            className="h-8 w-32 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface-raised)] px-2 text-xs text-[var(--ink)] placeholder:text-[var(--ink-muted)] focus:border-[var(--accent)] focus:outline-none"
                          />
                          <Button type="submit" variant="danger" size="sm">
                            Аннулировать
                          </Button>
                        </form>
                      )}
                    </TD>
                  </TR>
                );
              })
            )}
          </tbody>
        </Table>
      </div>
    </main>
  );
}
