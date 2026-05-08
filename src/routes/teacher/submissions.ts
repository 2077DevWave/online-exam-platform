// src/routes/teacher/submissions.ts
import { Router, Response } from 'express';
import { getDb, saveDb } from '../../database';
import { AuthRequest } from '../../middleware/auth';
import { services } from '../../modules/composition';
import { toErrorResponse } from '../../modules/shared/DomainError';

const router = Router();
const { teacherExamService, submissionService } = services;

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
    let csv = 'Student Name,Student ID,Score (%),Total,Started,Finished\n';
    subs.forEach(sub => {
      csv += `"${sub.student_name || ''}","${sub.student_id || ''}",${sub.score.toFixed(1)},"${sub.total_questions}","${sub.started_at}","${sub.finished_at}"\n`;
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
      SELECT sa.id, sa.exam_question_id AS question_id, sa.selected_option, sa.is_correct,
             sa.awarded_points, sa.penalty_points, sa.needs_review, sa.reviewer_note,
             sa.reviewed_by_teacher_id, sa.reviewed_at, sa.reviewer_override_is_correct,
             eq.weight, eq.negative_mark, qi.text, qi.correct_option,
             MAX(CASE WHEN qio.option_key = 'A' THEN qio.option_text END) AS option_a,
             MAX(CASE WHEN qio.option_key = 'B' THEN qio.option_text END) AS option_b,
             MAX(CASE WHEN qio.option_key = 'C' THEN qio.option_text END) AS option_c,
             MAX(CASE WHEN qio.option_key = 'D' THEN qio.option_text END) AS option_d
      FROM submission_answers sa
      JOIN exam_questions eq ON eq.id = sa.exam_question_id
      JOIN question_items qi ON qi.id = eq.question_item_id
      JOIN question_item_options qio ON qio.question_item_id = qi.id
      WHERE sa.submission_id = ?
      GROUP BY sa.id, sa.exam_question_id, sa.selected_option, sa.is_correct, sa.awarded_points, sa.penalty_points,
               sa.needs_review, sa.reviewer_note, sa.reviewed_by_teacher_id, sa.reviewed_at, sa.reviewer_override_is_correct,
               eq.weight, eq.negative_mark, qi.text, qi.correct_option
      ORDER BY sa.exam_question_id
    `);
    ansStmt.bind([submissionId]);
    const answers: any[] = [];
    while (ansStmt.step()) answers.push(ansStmt.getAsObject());
    ansStmt.free();

    submission.answers = answers;

    const integrityStmt = db.prepare(
      `SELECT id, event_type, event_payload_json, ip_address, device_fingerprint, created_at
       FROM integrity_events
       WHERE exam_id = ? AND (
         attempt_session_id IN (
           SELECT id FROM attempt_sessions
           WHERE exam_id = ?
           AND ((? IS NOT NULL AND student_id = ?) OR (? IS NOT NULL AND student_name = ?))
         )
       )
       ORDER BY created_at ASC`
    );
    integrityStmt.bind([
      submission.exam_id,
      submission.exam_id,
      submission.student_id || null,
      submission.student_id || null,
      submission.student_name || null,
      submission.student_name || null
    ]);
    const integrity_events: any[] = [];
    while (integrityStmt.step()) integrity_events.push(integrityStmt.getAsObject());
    integrityStmt.free();
    submission.integrity_events = integrity_events;
    res.json(submission);
  } catch (err) {
    const mapped = toErrorResponse(err);
    if (mapped.statusCode >= 500) console.error(err);
    res.status(mapped.statusCode).json(mapped.body);
  }
});

// POST /exams/:id/submissions/rescore
router.post('/exams/:id/submissions/rescore', async (req: AuthRequest, res: Response) => {
  try {
    const teacherId = req.teacherId!;
    const examId = parseInt(String(req.params.id), 10);

    await teacherExamService.ensureOwnership(examId, teacherId);
    const result = await submissionService.rescoreExamSubmissions(examId);
    res.json(result);
  } catch (err) {
    const mapped = toErrorResponse(err);
    if (mapped.statusCode >= 500) console.error(err);
    res.status(mapped.statusCode).json(mapped.body);
  }
});

router.post('/submissions/:id/answers/:answerId/review', async (req: AuthRequest, res: Response) => {
  try {
    const teacherId = req.teacherId!;
    const submissionId = parseInt(String(req.params.id), 10);
    const answerId = parseInt(String(req.params.answerId), 10);
    const { override_is_correct, note, needs_review } = req.body;
    const db = await getDb();

    const ownerStmt = db.prepare(
      `SELECT s.exam_id
       FROM submissions s
       JOIN exams e ON e.id = s.exam_id
       WHERE s.id = ? AND e.teacher_id = ?`
    );
    ownerStmt.bind([submissionId, teacherId]);
    if (!ownerStmt.step()) {
      ownerStmt.free();
      return res.status(404).json({ error: 'Submission not found' });
    }
    ownerStmt.free();

    const existingStmt = db.prepare(
      'SELECT is_correct, reviewer_override_is_correct FROM submission_answers WHERE id = ? AND submission_id = ?'
    );
    existingStmt.bind([answerId, submissionId]);
    if (!existingStmt.step()) {
      existingStmt.free();
      return res.status(404).json({ error: 'Answer not found' });
    }
    const existing = existingStmt.getAsObject() as any;
    existingStmt.free();

    db.run(
      `UPDATE submission_answers
       SET reviewer_override_is_correct = ?, reviewer_note = ?, needs_review = ?,
           reviewed_by_teacher_id = ?, reviewed_at = datetime('now')
       WHERE id = ? AND submission_id = ?`,
      [
        override_is_correct === undefined ? null : (override_is_correct ? 1 : 0),
        note || null,
        needs_review ? 1 : 0,
        teacherId,
        answerId,
        submissionId
      ]
    );
    db.run(
      `INSERT INTO review_audit_logs
       (submission_answer_id, actor_teacher_id, previous_is_correct, new_is_correct, note)
       VALUES (?, ?, ?, ?, ?)`,
      [
        answerId,
        teacherId,
        existing.reviewer_override_is_correct ?? existing.is_correct,
        override_is_correct === undefined ? null : (override_is_correct ? 1 : 0),
        note || null
      ]
    );
    saveDb();
    res.json({ success: true });
  } catch (err) {
    const mapped = toErrorResponse(err);
    if (mapped.statusCode >= 500) console.error(err);
    res.status(mapped.statusCode).json(mapped.body);
  }
});

router.get('/exams/:id/analytics', async (req: AuthRequest, res: Response) => {
  try {
    const teacherId = req.teacherId!;
    const examId = parseInt(String(req.params.id), 10);
    const db = await getDb();
    await teacherExamService.ensureOwnership(examId, teacherId);

    const totalsStmt = db.prepare(
      'SELECT COUNT(*) AS submissions, AVG(score) AS avg_score, MIN(score) AS min_score, MAX(score) AS max_score FROM submissions WHERE exam_id = ?'
    );
    totalsStmt.bind([examId]);
    totalsStmt.step();
    const totals = totalsStmt.getAsObject();
    totalsStmt.free();

    const itemMetricsStmt = db.prepare(
      `SELECT sa.exam_question_id AS question_id, qi.text,
              AVG(CASE WHEN sa.is_correct = 1 THEN 1.0 ELSE 0.0 END) AS difficulty_index,
              AVG(sa.awarded_points - sa.penalty_points) AS avg_points
       FROM submission_answers sa
       JOIN submissions s ON s.id = sa.submission_id
       JOIN exam_questions eq ON eq.id = sa.exam_question_id
       JOIN question_items qi ON qi.id = eq.question_item_id
       WHERE s.exam_id = ?
       GROUP BY sa.exam_question_id, qi.text
       ORDER BY sa.exam_question_id`
    );
    itemMetricsStmt.bind([examId]);
    const items: any[] = [];
    while (itemMetricsStmt.step()) items.push(itemMetricsStmt.getAsObject());
    itemMetricsStmt.free();

    const distributionStmt = db.prepare(
      `SELECT
         SUM(CASE WHEN score < 40 THEN 1 ELSE 0 END) AS below_40,
         SUM(CASE WHEN score >= 40 AND score < 60 THEN 1 ELSE 0 END) AS from_40_to_59,
         SUM(CASE WHEN score >= 60 AND score < 80 THEN 1 ELSE 0 END) AS from_60_to_79,
         SUM(CASE WHEN score >= 80 THEN 1 ELSE 0 END) AS above_80
       FROM submissions
       WHERE exam_id = ?`
    );
    distributionStmt.bind([examId]);
    distributionStmt.step();
    const distribution = distributionStmt.getAsObject();
    distributionStmt.free();

    res.json({ totals, items, distribution });
  } catch (err) {
    const mapped = toErrorResponse(err);
    if (mapped.statusCode >= 500) console.error(err);
    res.status(mapped.statusCode).json(mapped.body);
  }
});

export default router;
