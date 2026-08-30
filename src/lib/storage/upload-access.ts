import "server-only";

import prisma from "@/lib/prisma";
import { canManageCourse, canViewCourseContent } from "@/lib/access";
import { getPermissionsForRoleNames } from "@/lib/role-profiles";
import { PERMISSIONS, canAccessAllCourses, hasPermission, isPlatformAdminRole } from "@/lib/roles";
import { classifyUploadKey, type UploadClass } from "@/lib/storage/classify-upload-key";

export { classifyUploadKey, type UploadClass };

// Авторизация доступа к файлу из `/uploads/<key>`.
//
// Роут `app/uploads/[...path]/route.ts` — единственная точка выдачи байтов
// (хранилище вынесено из `public/`, статика Next больше не перехватывает).
// Здесь решается, вправе ли текущий пользователь получить конкретный файл.
//
// Связь «ключ → владелец» восстанавливается по префиксу ключа и по полям,
// которые ссылаются на URL файла. Дедупликация допускает один-ко-многим (один
// физический ключ у нескольких курсов/пользователей), поэтому доступ даётся,
// если проходит ХОТЬ ОДНА ссылающаяся сущность.

export type UploadSessionUser = {
  id: string;
  roles: string[];
  avatarUrl?: string | null;
};

type CourseOwnerRef = { courseId: string; ownerId: string | null };

function uploadUrl(key: string) {
  return `/uploads/${key}`;
}

async function materialCourses(fileUrls: string[]): Promise<CourseOwnerRef[]> {
  const items = await prisma.courseItem.findMany({
    where: { fileUrl: { in: fileUrls } },
    select: { courseId: true, course: { select: { ownerId: true } } },
  });
  return items.map((item) => ({ courseId: item.courseId, ownerId: item.course.ownerId }));
}

async function quizMediaCourses(needle: string): Promise<CourseOwnerRef[]> {
  const questions = await prisma.question.findMany({
    where: { config: { contains: needle } },
    select: {
      quiz: { select: { courseItem: { select: { courseId: true, course: { select: { ownerId: true } } } } } },
    },
  });
  const fromQuestions = questions
    .map((q) => q.quiz?.courseItem)
    .filter((ci): ci is NonNullable<typeof ci> => Boolean(ci))
    .map((ci) => ({ courseId: ci.courseId, ownerId: ci.course.ownerId }));
  if (fromQuestions.length > 0) return fromQuestions;

  // Вопрос мог быть удалён/архивирован — медиа остаётся в снапшоте попытки.
  const attempts = await prisma.quizAttempt.findMany({
    where: { questionSnapshot: { contains: needle } },
    select: {
      quiz: { select: { courseItem: { select: { courseId: true, course: { select: { ownerId: true } } } } } },
    },
  });
  return attempts
    .map((a) => a.quiz?.courseItem)
    .filter((ci): ci is NonNullable<typeof ci> => Boolean(ci))
    .map((ci) => ({ courseId: ci.courseId, ownerId: ci.course.ownerId }));
}

async function anyCourseAccessible(
  user: UploadSessionUser,
  permissions: string[],
  courses: CourseOwnerRef[]
): Promise<boolean> {
  for (const course of courses) {
    if (canManageCourse(user.roles, user.id, { ownerId: course.ownerId })) return true;
    if (await canViewCourseContent(user.id, user.roles, course.courseId, permissions)) return true;
  }
  return false;
}

/**
 * Главная проверка: вправе ли пользователь получить файл `/uploads/<key>`.
 * Вызывается из роута после аутентификации.
 */
export async function canAccessUpload(user: UploadSessionUser, key: string): Promise<boolean> {
  const cls = classifyUploadKey(key);
  const permissions = await getPermissionsForRoleNames(user.roles);
  const isStaffAll = isPlatformAdminRole(user.roles) || canAccessAllCourses(user.roles, permissions);

  switch (cls.kind) {
    case "course-cover":
      // Обложки, миниатюры и интро-картинки опросов показываются в каталоге
      // всем аутентифицированным (карточки курсов), поэтому не гейтятся строже
      // самого факта входа. Строгая проверка сломала бы каталог.
      return true;

    case "avatar": {
      if (isStaffAll) return true;
      if (user.avatarUrl && user.avatarUrl === uploadUrl(key)) return true;
      // Чужой аватар — только тем, кто видит карточки пользователей.
      return hasPermission(user.roles, PERMISSIONS.USERS_VIEW, permissions);
    }

    case "quiz-attachment": {
      if (isStaffAll) return true;
      const attempt = await prisma.quizAttempt.findFirst({
        where: { answers: { contains: uploadUrl(key) } },
        select: {
          userId: true,
          quiz: { select: { courseItem: { select: { course: { select: { ownerId: true } } } } } },
        },
      });
      if (!attempt) return false;
      // Владелец вложения — загрузивший ученик.
      if (attempt.userId === user.id) return true;
      // Либо менеджер курса (проверка ответов на ручном ревью).
      const owner = attempt.quiz?.courseItem?.course;
      if (owner && canManageCourse(user.roles, user.id, { ownerId: owner.ownerId })) return true;
      return false;
    }

    case "quiz-media":
      if (isStaffAll) return true;
      return anyCourseAccessible(user, permissions, await quizMediaCourses(uploadUrl(key)));

    case "pptx-html5":
      if (!cls.baseName) return false;
      if (isStaffAll) return true;
      // Пакет HTML5 привязан к материалу по конвенции имён: baseName == uuid
      // презентации, у материала `fileUrl == /uploads/<baseName>.pptx`.
      return anyCourseAccessible(user, permissions, await materialCourses([uploadUrl(`${cls.baseName}.pptx`)]));

    case "root-file": {
      if (isStaffAll) return true;
      // Корневой файл — либо сам материал (fileUrl == ключ), либо PDF-превью
      // презентации (fileUrl == <baseName>.pptx). Проверяем оба варианта.
      const urls = [uploadUrl(key)];
      if (cls.extension === ".pdf") urls.push(uploadUrl(`${cls.baseName}.pptx`));
      return anyCourseAccessible(user, permissions, await materialCourses(urls));
    }
  }
}
