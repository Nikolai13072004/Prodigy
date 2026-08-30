import { saveAdminCoursesViewPreference } from "@/app/actions/user-preference-actions";

type AdminCourseView = "cards" | "list" | "table";

type AdminViewPreferenceLinkProps = {
  href: string;
  active: boolean;
  label: string;
  view: AdminCourseView;
};

export function AdminViewPreferenceLink({
  href,
  active,
  label,
  view,
}: AdminViewPreferenceLinkProps) {
  return (
    <form action={saveAdminCoursesViewPreference}>
      <input type="hidden" name="view" value={view} />
      <input type="hidden" name="returnTo" value={href} />
      <button
        type="submit"
        className={`rounded-md px-3 py-2 text-sm transition ${
          active
            ? "bg-[var(--surface-raised)] font-medium text-[var(--accent)] shadow-[inset_0_-3px_0_var(--accent)]"
            : "border border-[var(--line)] bg-[var(--surface-raised)] text-[var(--ink-muted)] hover:border-[var(--line)] hover:text-[var(--ink)]"
        }`}
      >
        {label}
      </button>
    </form>
  );
}
