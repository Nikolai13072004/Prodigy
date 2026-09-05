import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { PERMISSIONS, hasPermission, isPlatformAdminRole } from "@/lib/roles";
import { AdminHomeDashboard } from "./_home/AdminHomeDashboard";
import { HrHomePage, type HrHomeSearchParams } from "./_home/HrHomePage";

type HomePageProps = {
  searchParams: Promise<HrHomeSearchParams>;
};

// Тонкий роутер главной (ADR-013 IA-B): по роли выбирает дашборд.
// Админ → обзор платформы; ревьюер отчётов (не админ) → HR-дашборд;
// остальные → каталог курсов.
export default async function HomePage({ searchParams }: HomePageProps) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  const sp = await searchParams;

  const isPlatformAdmin = isPlatformAdminRole(session.user.roles);
  const canViewReports = hasPermission(
    session.user.roles,
    PERMISSIONS.REPORTS_VIEW,
    session.user.permissions
  );

  if (!isPlatformAdmin && canViewReports) {
    return <HrHomePage userId={session.user.id} searchParams={sp} />;
  }

  if (!isPlatformAdmin) {
    redirect("/courses");
  }

  return <AdminHomeDashboard />;
}
