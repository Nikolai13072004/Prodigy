import "server-only";

import { createCopyCourse } from "../application/copy-course";
import { createCreateCourse } from "../application/create-course";
import { createCreateCourseFromPresentation } from "../application/create-course-from-presentation";
import { createCreateCourseFromTemplate } from "../application/create-course-from-template";
import { prismaCourseCreationRepository } from "../infrastructure/prisma-course-creation-repository";

const deps = { repository: prismaCourseCreationRepository };

export const createCourse = createCreateCourse(deps);
export const createCourseFromPresentation =
  createCreateCourseFromPresentation(deps);
export const createCourseFromTemplate =
  createCreateCourseFromTemplate(deps);
export const copyCourse = createCopyCourse(deps);
