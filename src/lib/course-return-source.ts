export type CourseReturnSource = "catalog" | "assigned";

export function getCourseReturnSource(value: string | null | undefined): CourseReturnSource | null {
  if (value === "catalog" || value === "assigned") return value;
  return null;
}

export function getCourseBackLink(source: CourseReturnSource | null) {
  if (source === "catalog") {
    return {
      href: "/courses?tab=catalog",
      label: "Назад к каталогу",
    };
  }

  if (source === "assigned") {
    return {
      href: "/courses?tab=assigned",
      label: "Назад к моим курсам",
    };
  }

  return {
    href: "/courses",
    label: "Назад к курсам",
  };
}

export function appendCourseReturnSource(href: string, source: CourseReturnSource | null) {
  if (!source) return href;

  const [hrefWithoutHash, hash] = href.split("#", 2);
  const [pathname, query = ""] = hrefWithoutHash.split("?", 2);
  const params = new URLSearchParams(query);
  params.set("from", source);
  const nextQuery = params.toString();

  return `${pathname}${nextQuery ? `?${nextQuery}` : ""}${hash ? `#${hash}` : ""}`;
}
