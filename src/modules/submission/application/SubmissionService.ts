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

  private clampPercent(value: number): number {
    return Math.max(0, Math.min(100, value));
  }

  /**
   * Rounds score to 2 decimal places to avoid floating-point precision issues
   */
  private roundScore(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private computeScoreRows(
    questions: Array<{ id: number; correct_option: string; weight: number; negative_mark: number }>,
    answers: SubmissionAnswerInput[]
  ) {
    const answerMap = new Map<number, string | null>();
    for (const answer of answers) {
      answerMap.set(answer.question_id, answer.selected_option || null);
    }

    let earned = 0;
    let penalty = 0;
    const totalPossibleWeight = questions.reduce((acc, question) => acc + Number(question.weight || 0), 0);
    const answerRows = questions.map((question) => {
      const selected = answerMap.get(question.id) ?? null;
      const isCorrect = !!selected && selected === question.correct_option;
      const awardedPoints = isCorrect ? Number(question.weight || 0) : 0;
      const penaltyPoints = !isCorrect && !!selected ? Number(question.negative_mark || 0) : 0;
      earned += awardedPoints;
      penalty += penaltyPoints;
      return {
        question_id: question.id,
        selected_option: selected,
        is_correct: isCorrect ? 1 : 0,
        awarded_points: awardedPoints,
        penalty_points: penaltyPoints
      };
    });

    const rawScore = totalPossibleWeight > 0 ? ((earned - penalty) / totalPossibleWeight) * 100 : 0;
    const score = this.roundScore(this.clampPercent(rawScore));
    return { score, totalPossibleWeight, answerRows };
  }

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
      `SELECT eq.id, qi.correct_option, eq.weight, eq.negative_mark
       FROM exam_questions eq
       JOIN question_items qi ON qi.id = eq.question_item_id
       WHERE eq.exam_id = ?`
    );
    qStmt.bind([input.exam_id]);
    const questions: { id: number; correct_option: string; weight: number; negative_mark: number }[] = [];
    while (qStmt.step()) {
      questions.push(qStmt.getAsObject() as any);
    }
    qStmt.free();

    if (questions.length === 0) {
      throw new DomainError('Exam has no questions.', 400);
    }

    const { score, answerRows } = this.computeScoreRows(questions, input.answers);
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
      `INSERT INTO submission_answers
       (submission_id, exam_question_id, selected_option, is_correct, awarded_points, penalty_points)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    for (const answer of answerRows) {
      insertAnswer.bind([
        submissionId,
        answer.question_id,
        answer.selected_option,
        answer.is_correct,
        answer.awarded_points,
        answer.penalty_points
      ]);
      insertAnswer.step();
      insertAnswer.reset();
    }
    insertAnswer.free();
    db.run(
      `UPDATE attempt_sessions
       SET submitted_at = datetime('now'), updated_at = datetime('now')
       WHERE exam_id = ?
         AND submitted_at IS NULL
         AND ((? IS NOT NULL AND student_id = ?) OR (? IS NOT NULL AND student_name = ?))`,
      [
        input.exam_id,
        input.student_id || null,
        input.student_id || null,
        input.student_name || null,
        input.student_name || null
      ]
    );
    saveDb();

    return { submission_id: submissionId, score, total_questions: questions.length };
  }

  async rescoreExamSubmissions(examId: number) {
    if (!examId || Number.isNaN(examId)) {
      throw new DomainError('Valid exam_id is required.', 400);
    }

    const db = await getDb();
    const questionsStmt = db.prepare(
      `SELECT eq.id, qi.correct_option, eq.weight, eq.negative_mark
       FROM exam_questions eq
       JOIN question_items qi ON qi.id = eq.question_item_id
       WHERE eq.exam_id = ?`
    );
    questionsStmt.bind([examId]);
    const questions: Array<{ id: number; correct_option: string; weight: number; negative_mark: number }> = [];
    while (questionsStmt.step()) {
      questions.push(questionsStmt.getAsObject() as any);
    }
    questionsStmt.free();
    const totalQuestions = questions.length;

    if (totalQuestions === 0) {
      throw new DomainError('Exam has no questions.', 400);
    }

    const submissionsStmt = db.prepare('SELECT id FROM submissions WHERE exam_id = ?');
    submissionsStmt.bind([examId]);
    const submissionIds: number[] = [];
    while (submissionsStmt.step()) {
      const row = submissionsStmt.getAsObject() as any;
      submissionIds.push(Number(row.id));
    }
    submissionsStmt.free();

    const answersStmt = db.prepare(
      `SELECT exam_question_id as question_id, selected_option
       FROM submission_answers
       WHERE submission_id = ?`
    );
    const updateAnswerStmt = db.prepare(
      `UPDATE submission_answers
       SET is_correct = ?, awarded_points = ?, penalty_points = ?
       WHERE submission_id = ? AND exam_question_id = ?`
    );
    const updateSubmissionStmt = db.prepare(
      'UPDATE submissions SET score = ?, total_questions = ? WHERE id = ?'
    );

    for (const submissionId of submissionIds) {
      answersStmt.bind([submissionId]);
      const answers: SubmissionAnswerInput[] = [];
      while (answersStmt.step()) {
        const row = answersStmt.getAsObject() as any;
        answers.push({
          question_id: Number(row.question_id),
          selected_option: row.selected_option ?? null
        });
      }
      answersStmt.reset();

      const result = this.computeScoreRows(questions, answers);
      for (const row of result.answerRows) {
        updateAnswerStmt.bind([
          row.is_correct,
          row.awarded_points,
          row.penalty_points,
          submissionId,
          row.question_id
        ]);
        updateAnswerStmt.step();
        updateAnswerStmt.reset();
      }

      const score = result.score;
      updateSubmissionStmt.bind([score, totalQuestions, submissionId]);
      updateSubmissionStmt.step();
      updateSubmissionStmt.reset();
    }

    answersStmt.free();
    updateAnswerStmt.free();
    updateSubmissionStmt.free();
    saveDb();

    return {
      exam_id: examId,
      submissions_updated: submissionIds.length,
      total_questions: totalQuestions
    };
  }
}
