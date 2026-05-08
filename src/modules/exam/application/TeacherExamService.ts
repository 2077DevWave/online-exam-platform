import { getDb, insertRow, saveDb } from '../../../database';
import { DomainError } from '../../shared/DomainError';

interface ExamInput {
  title?: string;
  duration_minutes?: number;
  require_name?: boolean;
  require_student_id?: boolean;
  allow_multiple_submissions?: boolean;
  shuffle_questions?: boolean;
  shuffle_options?: boolean;
  status?: string;
  password?: string;
  start_time?: string;
  end_time?: string;
}

export class TeacherExamService {
  async createExam(teacherId: number, input: ExamInput) {
    if (!input.title || !input.duration_minutes) {
      throw new DomainError('Title and duration_minutes are required.', 400);
    }
    if (input.status && !['draft', 'published'].includes(input.status)) {
      throw new DomainError('status must be draft or published', 400);
    }
    if (input.start_time && Number.isNaN(Date.parse(input.start_time))) {
      throw new DomainError('Invalid start_time format', 400);
    }
    if (input.end_time && Number.isNaN(Date.parse(input.end_time))) {
      throw new DomainError('Invalid end_time format', 400);
    }

    const examId = await insertRow(
      `INSERT INTO exams (teacher_id, title, duration_minutes, require_name, require_student_id, allow_multiple_submissions, shuffle_questions, shuffle_options, status, password, start_time, end_time)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        teacherId,
        input.title,
        input.duration_minutes,
        input.require_name ? 1 : 0,
        input.require_student_id ? 1 : 0,
        input.allow_multiple_submissions ? 1 : 0,
        input.shuffle_questions ? 1 : 0,
        input.shuffle_options ? 1 : 0,
        input.status || 'published',
        input.password || null,
        input.start_time || null,
        input.end_time || null
      ]
    );
    saveDb();
    return examId;
  }

  async ensureOwnership(examId: number, teacherId: number) {
    const db = await getDb();
    const check = db.prepare('SELECT id, teacher_id FROM exams WHERE id = ?');
    check.bind([examId]);
    if (!check.step()) {
      check.free();
      throw new DomainError('Exam not found', 404);
    }
    const exam = check.getAsObject() as any;
    check.free();
    if (Number(exam.teacher_id) === teacherId) return;

    const memberStmt = db.prepare(
      `SELECT 1 AS ok
       FROM organization_members om_owner
       JOIN organization_members om_actor ON om_actor.organization_id = om_owner.organization_id
       WHERE om_owner.teacher_id = ? AND om_actor.teacher_id = ?
       LIMIT 1`
    );
    memberStmt.bind([Number(exam.teacher_id), teacherId]);
    const sameOrganization = memberStmt.step();
    memberStmt.free();
    if (!sameOrganization) {
      throw new DomainError('Exam not found', 404);
    }
  }
}
