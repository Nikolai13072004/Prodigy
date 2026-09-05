import type { CourseTemplateKey } from "@/lib/course-creation-options";

// Чистые структуры стартовых шаблонов курса и план создания их элементов.
// Вынесено из course-creation-actions (createCourseFromTemplate): статический blueprint + расчёт
// item'ов (orderIndex/moduleId/content/isRequired/needsQuiz). Запись в БД остаётся в транзакции.

export type TemplateItemBlueprint = {
  moduleIndex: number;
  type: "TEXT" | "PDF" | "VIDEO" | "QUIZ";
  title: string;
  content?: string | null;
  isRequired?: boolean;
};

export type TemplateModuleBlueprint = {
  title: string;
  description?: string | null;
};

export type CourseTemplateBlueprint = {
  modules: TemplateModuleBlueprint[];
  items: TemplateItemBlueprint[];
};

export function getCourseTemplateBlueprint(templateKey: CourseTemplateKey): CourseTemplateBlueprint {
  if (templateKey === "presentation_with_quiz") {
    return {
      modules: [
        {
          title: "Материалы курса",
          description: "Добавьте презентацию и сопроводительные материалы.",
        },
        {
          title: "Проверка знаний",
          description: "Настройте вопросы итогового теста.",
        },
      ],
      items: [
        {
          moduleIndex: 0,
          type: "PDF",
          title: "Презентация",
          isRequired: true,
        },
        {
          moduleIndex: 1,
          type: "QUIZ",
          title: "Итоговый тест",
          isRequired: true,
        },
      ],
    };
  }

  if (templateKey === "required_training") {
    return {
      modules: [
        {
          title: "Обязательные материалы",
          description: "Основная информация, которую нужно изучить всем назначенным ученикам.",
        },
        {
          title: "Контроль понимания",
          description: "Закрепление и финальная проверка.",
        },
      ],
      items: [
        {
          moduleIndex: 0,
          type: "TEXT",
          title: "Инструкция",
          content: "<p>Опишите правила, регламент или порядок действий.</p>",
          isRequired: true,
        },
        {
          moduleIndex: 0,
          type: "PDF",
          title: "Презентация",
          isRequired: true,
        },
        {
          moduleIndex: 1,
          type: "QUIZ",
          title: "Финальный тест",
          isRequired: true,
        },
      ],
    };
  }

  return {
    modules: [
      {
        title: "Введение",
        description: "Цели курса и краткий контекст.",
      },
      {
        title: "Основная часть",
        description: "Ключевые материалы и практические примеры.",
      },
      {
        title: "Закрепление",
        description: "Итоги, проверка знаний и дополнительные материалы.",
      },
    ],
    items: [
      {
        moduleIndex: 0,
        type: "TEXT",
        title: "О курсе",
        content: "<p>Опишите цели курса, аудиторию и ожидаемый результат.</p>",
        isRequired: true,
      },
      {
        moduleIndex: 1,
        type: "TEXT",
        title: "Основной материал",
        content: "<p>Добавьте структуру, тезисы и ссылки на рабочие материалы.</p>",
        isRequired: true,
      },
      {
        moduleIndex: 2,
        type: "QUIZ",
        title: "Проверка знаний",
        isRequired: true,
      },
    ],
  };
}

export type TemplateCourseItemSpec = {
  orderIndex: number;
  moduleId: string | null;
  type: TemplateItemBlueprint["type"];
  title: string;
  content: string | null;
  isRequired: boolean;
  needsQuiz: boolean;
};

// Разворачивает blueprint-элементы в план создания: последовательный orderIndex, привязка к модулю
// по индексу (нет модуля → null), дефолтный content для TEXT, isRequired по умолчанию true,
// признак создания quiz для QUIZ. Порядок сохраняется — как в исходном цикле транзакции.
export function planTemplateCourseItems(
  moduleIds: string[],
  items: TemplateItemBlueprint[],
): TemplateCourseItemSpec[] {
  return items.map((item, index) => ({
    orderIndex: index,
    moduleId: moduleIds[item.moduleIndex] ?? null,
    type: item.type,
    title: item.title,
    content:
      item.type === "TEXT"
        ? item.content ?? "<p>Заполните содержание материала.</p>"
        : null,
    isRequired: item.isRequired ?? true,
    needsQuiz: item.type === "QUIZ",
  }));
}
