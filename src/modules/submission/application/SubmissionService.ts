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
    const qStmt = db.prepare(
      `SELECT eq.id, qi.correct_option
       FROM exam_questions eq
       JOIN question_items qi ON qi.id = eq.question_item_id
       WHERE eq.exam_id = ?`
    );
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
      VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `);
    insertSubmission.bind([
      input.exam_id,
      input.student_name || null,
      input.student_id || null,
      score,
      questions.length
    ]);
    insertSubmission.step();
    insertSubmission.free();

    const subIdResult = db.exec('SELECT last_insert_rowid() as id');
    if (!subIdResult.length || !subIdResult[0].values.length) {
      throw new Error('Insert failed');
    }
    const submissionId = subIdResult[0].values[0][0] as number;

    const insertAnswer = db.prepare(
      'INSERT INTO submission_answers (submission_id, exam_question_id, selected_option, is_correct) VALUES (?, ?, ?, ?)'
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

  async rescoreExamSubmissions(examId: number) {
    if (!examId || Number.isNaN(examId)) {
      throw new DomainError('Valid exam_id is required.', 400);
    }

    const db = await getDb();
    const totalQuestionsStmt = db.prepare('SELECT COUNT(*) AS total FROM exam_questions WHERE exam_id = ?');
    totalQuestionsStmt.bind([examId]);
    totalQuestionsStmt.step();
    const totalQuestions = Number((totalQuestionsStmt.getAsObject() as any).total || 0);
    totalQuestionsStmt.free();

    if (totalQuestions === 0) {
      throw new DomainError('Exam has no questions.', 400);
    }

    db.run(
      `
      UPDATE submission_answers
      SET is_correct = CASE
        WHEN selected_option = (
          SELECT qi.correct_option
          FROM exam_questions eq
          JOIN question_items qi ON qi.id = eq.question_item_id
          WHERE eq.id = submission_answers.exam_question_id
          AND eq.exam_id = ?
        ) THEN 1
        ELSE 0
      END
      WHERE submission_id IN (SELECT id FROM submissions WHERE exam_id = ?)
      `,
      [examId, examId]
    );

    const submissionsStmt = db.prepare('SELECT id FROM submissions WHERE exam_id = ?');
    submissionsStmt.bind([examId]);
    const submissionIds: number[] = [];
    while (submissionsStmt.step()) {
      const row = submissionsStmt.getAsObject() as any;
      submissionIds.push(Number(row.id));
    }
    submissionsStmt.free();

    const correctCountStmt = db.prepare(`
      SELECT COUNT(*) AS correct_count
      FROM submission_answers sa
      JOIN exam_questions eq ON eq.id = sa.exam_question_id
      WHERE sa.submission_id = ?
      AND eq.exam_id = ?
      AND sa.is_correct = 1
    `);
    const updateSubmissionStmt = db.prepare(
      'UPDATE submissions SET score = ?, total_questions = ? WHERE id = ?'
    );

    for (const submissionId of submissionIds) {
      correctCountStmt.bind([submissionId, examId]);
      correctCountStmt.step();
      const correctCount = Number((correctCountStmt.getAsObject() as any).correct_count || 0);
      correctCountStmt.reset();

      const score = (correctCount / totalQuestions) * 100;
      updateSubmissionStmt.bind([score, totalQuestions, submissionId]);
      updateSubmissionStmt.step();
      updateSubmissionStmt.reset();
    }

    correctCountStmt.free();
    updateSubmissionStmt.free();
    saveDb();

    return {
      exam_id: examId,
      submissions_updated: submissionIds.length,
      total_questions: totalQuestions
    };
  }
}
