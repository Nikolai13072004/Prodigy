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
            ? "bg-white font-medium text-[#0f315d] shadow-[inset_0_-3px_0_#0f315d]"
            : "border border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:text-zinc-900"
        }`}
      >
        {label}
      </button>
    </form>
  );
}
