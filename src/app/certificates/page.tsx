import Link from "next/link";
import { requireSession } from "@/lib/auth-guards";
import { selectUserCertificates } from "./_queries/select-user-certificates";

const dateFormat = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" });

export default async function CertificatesPage() {
  const session = await requireSession();
  const certificates = await selectUserCertificates(session.user.id);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold text-[var(--ink)]">Мои сертификаты</h1>
      <p className="mt-1 text-sm text-[var(--ink-muted)]">Сертификаты о прохождении курсов.</p>

      {certificates.length === 0 ? (
        <div
          className="mt-8 rounded-xl p-8 text-center text-sm text-[var(--ink-muted)]"
          style={{ border: "1px solid var(--accent-soft)" }}
        >
          Пока нет сертификатов. Завершите курс — сертификат появится здесь.
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {certificates.map((certificate) => {
            const isRevoked = certificate.status === "REVOKED";
            return (
              <li key={certificate.serial}>
                <Link
                  href={`/certificates/${certificate.serial}`}
                  className="flex items-center justify-between gap-4 rounded-xl p-4 transition hover:bg-[var(--accent-soft)]"
                  style={{ border: "1px solid var(--accent-soft)" }}
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-[var(--ink)]">{certificate.courseTitle}</p>
                    <p className="text-sm text-[var(--ink-muted)]">
                      Выдан {dateFormat.format(certificate.issuedAt)}
                      {certificate.scorePercent != null ? ` · Результат ${certificate.scorePercent}%` : ""}
                    </p>
                  </div>
                  <span
                    className="shrink-0 rounded-full px-3 py-1 text-xs font-medium"
                    style={
                      isRevoked
                        ? { background: "var(--danger-soft)", color: "var(--danger)" }
                        : { background: "var(--success-soft)", color: "var(--success)" }
                    }
                  >
                    {isRevoked ? "Аннулирован" : "Действителен"}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
