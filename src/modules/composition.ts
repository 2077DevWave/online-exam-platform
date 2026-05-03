import { ExamAccessService } from './exam/application/ExamAccessService';
import { TeacherExamService } from './exam/application/TeacherExamService';
import { SubmissionService } from './submission/application/SubmissionService';

const examAccessService = new ExamAccessService();
const teacherExamService = new TeacherExamService();
const submissionService = new SubmissionService(examAccessService);

export const services = {
  examAccessService,
  teacherExamService,
  submissionService
};
