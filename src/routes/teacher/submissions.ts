// src/routes/teacher/submissions.ts
import { Router, Response } from 'express';
import { getDb } from '../../database';
import { AuthRequest } from '../../middleware/auth';
import { services } from '../../modules/composition';
import { toErrorResponse } from '../../modules/shared/DomainError';

const router = Router();
const { teacherExamService } = services;

// GET /exams/:id/submissions/export
router.get('/exams/:id/submissions/export', async (req: AuthRequest, res: Response) => {
  try {
    const teacherId = req.teacherId!;
    const examId = parseInt(String(req.params.id), 10);
    const db = await getDb();

    await teacherExamService.ensureOwnership(examId, teacherId);
    const titleStmt = db.prepare('SELECT title FROM exams WHERE id = ?');
    titleStmt.bind([examId]);
    titleStmt.step();
    const examTitle = (titleStmt.getAsObject() as any).title;
    titleStmt.free();

    const subStmt = db.prepare(`
      SELECT s.id, s.student_name, s.student_id, s.score, s.total_questions, s.started_at, s.finished_at
      FROM submissions s
      WHERE s.exam_id = ?
      ORDER BY s.finished_at DESC
    `);
    subStmt.bind([examId]);
    const subs: any[] = [];
    while (subStmt.step()) subs.push(subStmt.getAsObject());
    subStmt.free();

    // Build CSV
    let csv = 'Student Name,Student ID,Score (%),Correct,Total,Started,Finished\n';
    subs.forEach(sub => {
      csv += `"${sub.student_name || ''}","${sub.student_id || ''}",${sub.score.toFixed(1)},"${Math.round(sub.score * sub.total_questions / 100)}","${sub.total_questions}","${sub.started_at}","${sub.finished_at}"\n`;
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="submissions_${examTitle.replace(/[^a-z0-9]/gi,'_')}.csv"`);
    res.send(csv);
  } catch (err) {
    const mapped = toErrorResponse(err);
    if (mapped.statusCode >= 500) console.error(err);
    res.status(mapped.statusCode).json(mapped.body);
  }
});

// GET /exams/:id/submissions
router.get('/exams/:id/submissions', async (req: AuthRequest, res: Response) => {
  try {
    const teacherId = req.teacherId!;
    const examId = parseInt(String(req.params.id), 10);
    const db = await getDb();

    await teacherExamService.ensureOwnership(examId, teacherId);

    const stmt = db.prepare(`
      SELECT id, student_name, student_id, score, total_questions, started_at, finished_at
      FROM submissions WHERE exam_id = ?
      ORDER BY finished_at DESC
    `);
    stmt.bind([examId]);
    const submissions: any[] = [];
    while (stmt.step()) submissions.push(stmt.getAsObject());
    stmt.free();

    res.json(submissions);
  } catch (err) {
    const mapped = toErrorResponse(err);
    if (mapped.statusCode >= 500) console.error(err);
    res.status(mapped.statusCode).json(mapped.body);
  }
});

// GET /submissions/:id - detailed review
router.get('/submissions/:id', async (req: AuthRequest, res: Response) => {
  try {
    const teacherId = req.teacherId!;
    const submissionId = parseInt(String(req.params.id), 10);
    const db = await getDb();

    // Get submission
    const subStmt = db.prepare('SELECT * FROM submissions WHERE id = ?');
    subStmt.bind([submissionId]);
    if (!subStmt.step()) { subStmt.free(); return res.status(404).json({ error: 'Submission not found' }); }
    const submission = subStmt.getAsObject() as any;
    subStmt.free();

    // Verify teacher owns the exam
    const examStmt = db.prepare('SELECT teacher_id FROM exams WHERE id = ?');
    examStmt.bind([submission.exam_id]);
    if (!examStmt.step() || (examStmt.getAsObject() as any).teacher_id !== teacherId) {
      examStmt.free();
      return res.status(404).json({ error: 'Submission not found' });
    }
    examStmt.free();

    // Get answers with question details
    const ansStmt = db.prepare(`
      SELECT a.id, a.question_id, a.selected_option, a.is_correct,
             q.text, q.option_a, q.option_b, q.option_c, q.option_d, q.correct_option
      FROM answers a
      JOIN questions q ON a.question_id = q.id
      WHERE a.submission_id = ?
      ORDER BY q.id
    `);
    ansStmt.bind([submissionId]);
    const answers: any[] = [];
    while (ansStmt.step()) answers.push(ansStmt.getAsObject());
    ansStmt.free();

    submission.answers = answers;
    res.json(submission);
  } catch (err) {
    const mapped = toErrorResponse(err);
    if (mapped.statusCode >= 500) console.error(err);
    res.status(mapped.statusCode).json(mapped.body);
  }
});

export default router;