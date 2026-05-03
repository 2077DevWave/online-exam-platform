import bcrypt from 'bcryptjs';
import { getDb } from '../../../database';
import { generateExamToken, verifyExamToken } from '../../../utils/tokens';
import { DomainError } from '../../shared/DomainError';

export interface PublicExamView {
  id: number;
  title: string;
  duration_minutes: number;
  require_name: boolean;
  require_student_id: boolean;
  allow_multiple_submissions: boolean;
  shuffle_questions: boolean;
  shuffle_options: boolean;
  has_password: boolean;
  require_student_auth: boolean;
  questions: Array<Record<string, unknown>>;
}

export class ExamAccessService {
  private assertExamAvailability(exam: any): void {
    const nowMs = Date.now();
    if (exam.start_time) {
      const startMs = Date.parse(exam.start_time);
      if (!Number.isNaN(startMs) && nowMs < startMs) {
        throw new DomainError(`Exam has not started yet. It will be available at ${exam.start_time}`, 403);
      }
    }
    if (exam.end_time) {
      const endMs = Date.parse(exam.end_time);
      if (!Number.isNaN(endMs) && nowMs > endMs) {
        throw new DomainError('Exam has already ended.', 403);
      }
    }
  }

  async getPublicExam(examId: number): Promise<PublicExamView> {
    const db = await getDb();
    const examStmt = db.prepare(
      'SELECT id, title, duration_minutes, require_name, require_student_id, allow_multiple_submissions, shuffle_questions, shuffle_options, status, password, start_time, end_time FROM exams WHERE id = ?'
    );
    examStmt.bind([examId]);
    let exam: any = null;
    if (examStmt.step()) {
      exam = examStmt.getAsObject();
    }
    examStmt.free();

    if (!exam) {
      throw new DomainError('Exam not found', 404);
    }
    if (exam.status !== 'published') {
      throw new DomainError('Exam not published yet', 404);
    }

    this.assertExamAvailability(exam);

    const sStmt = db.prepare('SELECT COUNT(*) as cnt FROM exam_students WHERE exam_id = ?');
    sStmt.bind([examId]);
    sStmt.step();
    const studentCount = (sStmt.getAsObject() as any).cnt;
    sStmt.free();

    const qStmt = db.prepare(
      `SELECT eq.id, qi.text,
              MAX(CASE WHEN qio.option_key = 'A' THEN qio.option_text END) AS option_a,
              MAX(CASE WHEN qio.option_key = 'B' THEN qio.option_text END) AS option_b,
              MAX(CASE WHEN qio.option_key = 'C' THEN qio.option_text END) AS option_c,
              MAX(CASE WHEN qio.option_key = 'D' THEN qio.option_text END) AS option_d
       FROM exam_questions eq
       JOIN question_items qi ON qi.id = eq.question_item_id
       JOIN question_item_options qio ON qio.question_item_id = qi.id
       WHERE eq.exam_id = ?
       GROUP BY eq.id, qi.text
       ORDER BY eq.id`
    );
    qStmt.bind([examId]);
    const questions: any[] = [];
    while (qStmt.step()) {
      questions.push(qStmt.getAsObject());
    }
    qStmt.free();

    return {
      id: exam.id,
      title: exam.title,
      duration_minutes: exam.duration_minutes,
      require_name: !!exam.require_name,
      require_student_id: !!exam.require_student_id,
      allow_multiple_submissions: !!exam.allow_multiple_submissions,
      shuffle_questions: !!exam.shuffle_questions,
      shuffle_options: !!exam.shuffle_options,
      has_password: !!exam.password,
      require_student_auth: studentCount > 0,
      questions
    };
  }

  async verifyPassword(examId: number, password: string): Promise<string> {
    const db = await getDb();
    const stmt = db.prepare('SELECT password FROM exams WHERE id = ? AND status = "published"');
    stmt.bind([examId]);
    if (!stmt.step()) {
      stmt.free();
      throw new DomainError('Exam not found', 404);
    }
    const row = stmt.getAsObject() as any;
    stmt.free();
    this.assertExamAvailability(row);

    if (!row.password || row.password !== password) {
      throw new DomainError('Incorrect password', 401);
    }
    return generateExamToken({ exam_id: examId, type: 'password' });
  }

  async loginStudent(examId: number, studentId: string, password: string): Promise<string> {
    const db = await getDb();
    const examStmt = db.prepare('SELECT start_time, end_time FROM exams WHERE id = ? AND status = "published"');
    examStmt.bind([examId]);
    if (!examStmt.step()) {
      examStmt.free();
      throw new DomainError('Exam not found', 404);
    }
    const exam = examStmt.getAsObject() as any;
    examStmt.free();
    this.assertExamAvailability(exam);

    const stmt = db.prepare('SELECT password_hash FROM exam_students WHERE exam_id = ? AND student_id = ?');
    stmt.bind([examId, studentId]);
    if (!stmt.step()) {
      stmt.free();
      throw new DomainError('Invalid credentials', 401);
    }
    const row = stmt.getAsObject() as any;
    stmt.free();

    const valid = await bcrypt.compare(password, row.password_hash);
    if (!valid) {
      throw new DomainError('Invalid credentials', 401);
    }
    return generateExamToken({ exam_id: examId, type: 'student', student_id: studentId });
  }

  async hasAlreadySubmitted(examId: number, name: string, studentId: string): Promise<boolean> {
    const db = await getDb();
    const examStmt = db.prepare('SELECT allow_multiple_submissions, require_name, require_student_id FROM exams WHERE id = ?');
    examStmt.bind([examId]);
    if (!examStmt.step()) {
      examStmt.free();
      throw new DomainError('Exam not found', 404);
    }
    const exam = examStmt.getAsObject() as any;
    examStmt.free();

    if (exam.allow_multiple_submissions) {
      return false;
    }

    let condition = 'exam_id = ?';
    const params: any[] = [examId];
    if (exam.require_name && name) {
      condition += ' AND student_name = ?';
      params.push(name);
    }
    if (exam.require_student_id && studentId) {
      condition += ' AND student_id = ?';
      params.push(studentId);
    }

    if ((exam.require_name && !name) || (exam.require_student_id && !studentId)) {
      return false;
    }

    const stmt = db.prepare(`SELECT COUNT(*) as cnt FROM submissions WHERE ${condition}`);
    stmt.bind(params);
    stmt.step();
    const row = stmt.getAsObject() as any;
    stmt.free();
    return row.cnt > 0;
  }

  async validateSubmissionAccess(examId: number, studentId: string | null, examToken?: string): Promise<any> {
    const db = await getDb();
    const examStmt = db.prepare('SELECT * FROM exams WHERE id = ?');
    examStmt.bind([examId]);
    if (!examStmt.step()) {
      examStmt.free();
      throw new DomainError('Exam not found', 404);
    }
    const exam = examStmt.getAsObject() as any;
    examStmt.free();
    if (exam.status !== 'published') {
      throw new DomainError('Exam not published yet', 404);
    }
    this.assertExamAvailability(exam);

    const sStmt = db.prepare('SELECT COUNT(*) as cnt FROM exam_students WHERE exam_id = ?');
    sStmt.bind([examId]);
    sStmt.step();
    const hasStudentList = (sStmt.getAsObject() as any).cnt > 0;
    sStmt.free();

    const hasPassword = !!exam.password;
    if (!hasPassword && !hasStudentList) {
      return exam;
    }

    if (!examToken) {
      throw new DomainError('Exam access token required', 401);
    }

    let payload;
    try {
      payload = verifyExamToken(examToken);
    } catch (_error) {
      throw new DomainError('Invalid or expired exam token', 401);
    }

    if (payload.exam_id !== examId) {
      throw new DomainError('Token does not match exam', 401);
    }
    if (hasStudentList && payload.type === 'student') {
      if (exam.require_student_id && payload.student_id !== studentId) {
        throw new DomainError('Student ID mismatch', 401);
      }
      return exam;
    }
    if (hasPassword && payload.type === 'password') {
      return exam;
    }

    throw new DomainError('Token type not accepted for this exam', 401);
  }
}
