import "server-only";

import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import type {
  SurveyQuestionData,
  SurveyQuestionsSyncArgs,
  SurveyTemplateRepository,
  SurveyTemplateTransaction,
} from "../application/survey-template-ports";

function questionDataForOp(
  args: SurveyQuestionsSyncArgs,
  index: number,
): SurveyQuestionData & { orderIndex: number } {
  const question = args.questions[index];
  return { ...question, orderIndex: index };
}

async function syncCourseQuestions(
  client: Prisma.TransactionClient,
  args: SurveyQuestionsSyncArgs,
) {
  for (const op of args.ops) {
    const data = questionDataForOp(args, op.index);
    if (op.kind === "update") {
      await client.courseSurveyQuestion.update({
        where: { id: op.id },
        data,
      });
    } else {
      await client.courseSurveyQuestion.create({
        data: { templateId: args.templateId, ...data },
      });
    }
  }
  if (args.toDeleteIds.length > 0) {
    await client.courseSurveyQuestion.deleteMany({
      where: {
        templateId: args.templateId,
        id: { in: args.toDeleteIds },
      },
    });
  }
}

async function syncItemQuestions(
  client: Prisma.TransactionClient,
  args: SurveyQuestionsSyncArgs,
) {
  for (const op of args.ops) {
    const data = questionDataForOp(args, op.index);
    if (op.kind === "update") {
      await client.courseItemSurveyQuestion.update({
        where: { id: op.id },
        data,
      });
    } else {
      await client.courseItemSurveyQuestion.create({
        data: { templateId: args.templateId, ...data },
      });
    }
  }
  if (args.toDeleteIds.length > 0) {
    await client.courseItemSurveyQuestion.deleteMany({
      where: {
        templateId: args.templateId,
        id: { in: args.toDeleteIds },
      },
    });
  }
}

function createTransaction(
  client: Prisma.TransactionClient,
): SurveyTemplateTransaction {
  return {
    async upsertCourseTemplate(input) {
      if (input.existingId) {
        const template = await client.courseSurveyTemplate.update({
          where: { id: input.existingId },
          data: input.fields,
          select: { id: true },
        });
        return template;
      }
      const template = await client.courseSurveyTemplate.create({
        data: {
          courseId: input.courseId,
          ...input.fields,
        },
        select: { id: true },
      });
      return template;
    },

    syncCourseQuestions(args) {
      return syncCourseQuestions(client, args);
    },

    async replaceCourseQuestions(templateId, questions) {
      await client.courseSurveyQuestion.deleteMany({
        where: { templateId },
      });
      if (questions.length === 0) return;
      await client.courseSurveyQuestion.createMany({
        data: questions.map((question, index) => ({
          templateId,
          ...question,
          orderIndex: index,
        })),
      });
    },

    async updateCourseItem(itemId, fields) {
      // Совпадает с оригиналом: при переключении на SURVEY стираем artifacts
      // предыдущего типа (content/fileUrl/totalSlides).
      await client.courseItem.update({
        where: { id: itemId },
        data: {
          title: fields.title,
          isRequired: fields.isRequired,
          content: null,
          fileUrl: null,
          totalSlides: null,
        },
      });
    },

    async upsertItemTemplate(input) {
      if (input.existingId) {
        const template = await client.courseItemSurveyTemplate.update({
          where: { id: input.existingId },
          data: input.fields,
          select: { id: true },
        });
        return template;
      }
      const template = await client.courseItemSurveyTemplate.create({
        data: {
          courseId: input.courseId,
          courseItemId: input.courseItemId,
          ...input.fields,
        },
        select: { id: true },
      });
      return template;
    },

    syncItemQuestions(args) {
      return syncItemQuestions(client, args);
    },

    async replaceItemQuestions(templateId, questions) {
      await client.courseItemSurveyQuestion.deleteMany({
        where: { templateId },
      });
      if (questions.length === 0) return;
      await client.courseItemSurveyQuestion.createMany({
        data: questions.map((question, index) => ({
          templateId,
          ...question,
          orderIndex: index,
        })),
      });
    },

    async createReusableTemplate(input) {
      const created = await client.reusableCourseSurveyTemplate.create({
        data: {
          title: input.title,
          description: input.description,
          introImageUrl: input.introImageUrl,
          isRequired: input.isRequired,
          sourceCourseId: input.sourceCourseId,
          createdById: input.createdById,
          questions: {
            create: input.questions.map((question, index) => ({
              title: question.title,
              type: question.type,
              optionsJson: question.optionsJson,
              isRequired: question.isRequired,
              orderIndex: index,
            })),
          },
        },
        select: { id: true },
      });
      return created;
    },

    async markCourseContentChangedIfPublished(courseId) {
      const course = await client.course.findUnique({
        where: { id: courseId },
        select: { status: true },
      });
      if (!course || course.status !== "PUBLISHED") return;
      await client.course.update({
        where: { id: courseId },
        data: { hasUnpublishedChanges: true },
      });
    },

    async recordEffects(effects) {
      if (!effects.audits || effects.audits.length === 0) return;
      // createMany быстрее, но нам нужен предсказуемый порядок для тестов —
      // цикл create OK, аудитов максимум 2.
      for (const audit of effects.audits) {
        await client.auditLogEvent.create({
          data: {
            actorId: audit.actorId,
            actorLogin: audit.actorLogin,
            actorName: audit.actorName,
            action: audit.action,
            objectType: audit.objectType,
            objectId: audit.objectId,
            objectLabel: audit.objectLabel,
            ipAddress: audit.ipAddress,
            userAgent: audit.userAgent,
            metadataJson:
              audit.metadata === undefined
                ? null
                : JSON.stringify(audit.metadata),
          },
        });
      }
    },
  };
}

export const prismaSurveyTemplateRepository: SurveyTemplateRepository = {
  async findCourseTemplate(courseId) {
    const template = await prisma.courseSurveyTemplate.findUnique({
      where: { courseId },
      select: {
        id: true,
        questions: { select: { id: true } },
      },
    });
    if (!template) return null;
    return {
      id: template.id,
      existingQuestionIds: template.questions.map((question) => question.id),
    };
  },

  async findItem(courseId, itemId) {
    const item = await prisma.courseItem.findFirst({
      where: { id: itemId, courseId, archivedAt: null },
      select: { id: true, type: true },
    });
    return item;
  },

  async findItemTemplate(courseItemId) {
    const template = await prisma.courseItemSurveyTemplate.findUnique({
      where: { courseItemId },
      select: {
        id: true,
        questions: { select: { id: true } },
      },
    });
    if (!template) return null;
    return {
      id: template.id,
      existingQuestionIds: template.questions.map((question) => question.id),
    };
  },

  async findReusableTemplate(reusableTemplateId) {
    const template = await prisma.reusableCourseSurveyTemplate.findUnique({
      where: { id: reusableTemplateId },
      include: {
        questions: { orderBy: { orderIndex: "asc" } },
      },
    });
    if (!template) return null;
    return {
      id: template.id,
      title: template.title,
      description: template.description,
      introImageUrl: template.introImageUrl,
      isRequired: template.isRequired,
      questions: template.questions.map((question) => ({
        title: question.title,
        type: question.type,
        optionsJson: question.optionsJson,
        isRequired: question.isRequired,
      })),
    };
  },

  async transact(execute) {
    return prisma.$transaction((client) => execute(createTransaction(client)));
  },
};
