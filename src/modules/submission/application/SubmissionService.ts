import { getDb, saveDb } from '../../../database';
import { DomainError } from '../../shared/DomainError';
import { ExamAccessService } from '../../exam/application/ExamAccessService';

interface SubmissionAnswerInput {
  question_id: number;
  selected_option: string | null;
}

interface CreateSubmissionInput {
  exam_id: number;
  student_name?: string;
  student_id?: string;
  started_at?: string;
  answers: SubmissionAnswerInput[];
  exam_token?: string;
}

export class SubmissionService {
  constructor(private readonly examAccessService = new ExamAccessService()) {}

  async createSubmission(input: CreateSubmissionInput, authHeader?: string) {
    if (!input.exam_id || !Array.isArray(input.answers)) {
      throw new DomainError('exam_id and answers array are required.', 400);
    }

    const tokenFromHeader = (authHeader || '').replace('Bearer ', '');
    const exam = await this.examAccessService.validateSubmissionAccess(
      input.exam_id,
      input.student_id || null,
      input.exam_token || tokenFromHeader
    );

    if (!exam.allow_multiple_submissions) {
      const already = await this.examAccessService.hasAlreadySubmitted(
        input.exam_id,
        input.student_name || '',
        input.student_id || ''
      );
      if (already) {
        throw new DomainError('You have already submitted this exam.', 409);
      }
    }

    const db = await getDb();
    const qStmt = db.prepare('SELECT id, correct_option FROM questions WHERE exam_id = ?');
    qStmt.bind([input.exam_id]);
    const questions: { id: number; correct_option: string }[] = [];
    while (qStmt.step()) {
      questions.push(qStmt.getAsObject() as any);
    }
    qStmt.free();

    if (questions.length === 0) {
      throw new DomainError('Exam has no questions.', 400);
    }

    let correctCount = 0;
    const answersToInsert = input.answers.map((answer) => {
      const question = questions.find((q) => q.id === answer.question_id);
      const isCorrect = !!question && answer.selected_option === question.correct_option;
      if (isCorrect) {
        correctCount += 1;
      }
      return {
        question_id: answer.question_id,
        selected_option: answer.selected_option || null,
        is_correct: isCorrect ? 1 : 0
      };
    });

    const score = (correctCount / questions.length) * 100;
    const insertSubmission = db.prepare(`
      INSERT INTO submissions (exam_id, student_name, student_id, score, total_questions, started_at, finished_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `);
    insertSubmission.bind([
      input.exam_id,
      input.student_name || null,
      input.student_id || null,
      score,
      questions.length,
        input.started_at || null
    ]);
    insertSubmission.step();
    insertSubmission.free();

    const subIdResult = db.exec('SELECT last_insert_rowid() as id');
    if (!subIdResult.length || !subIdResult[0].values.length) {
      throw new Error('Insert failed');
    }
    const submissionId = subIdResult[0].values[0][0] as number;

    const insertAnswer = db.prepare(
      'INSERT INTO answers (submission_id, question_id, selected_option, is_correct) VALUES (?, ?, ?, ?)'
    );
    for (const answer of answersToInsert) {
      insertAnswer.bind([submissionId, answer.question_id, answer.selected_option, answer.is_correct]);
      insertAnswer.step();
      insertAnswer.reset();
    }
    insertAnswer.free();
    saveDb();

    return { submission_id: submissionId, score, total_questions: questions.length };
  }
}
