// Compatibility adapter. New assessment code imports the domain module directly.
export {
  scoreAssessment as scoreQuiz,
  scoreAssessmentQuestion as scoreOneQuestion,
} from "@/modules/assessment/domain/assessment";
