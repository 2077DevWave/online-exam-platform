// src/routes/teacher/exams.ts
import { Router, Response } from 'express';
import { getDb, saveDb } from '../../database';
import { AuthRequest } from '../../middleware/auth';
import { services } from '../../modules/composition';
import { toErrorResponse } from '../../modules/shared/DomainError';

const router = Router();
const { teacherExamService } = services;

// POST /exams
router.post('/exams', async (req: AuthRequest, res: Response) => {
  try {
    const teacherId = req.teacherId!;
    const {
      title,
      duration_minutes,
      require_name = true,
      require_student_id = false,
      allow_multiple_submissions = true,
      shuffle_questions = true,
      shuffle_options = true,
      status = 'published',
      password,
      start_time,
      end_time
    } = req.body;

    const examId = await teacherExamService.createExam(teacherId, {
      title,
      duration_minutes,
      require_name,
      require_student_id,
      allow_multiple_submissions,
      shuffle_questions,
      shuffle_options,
      status,
      password,
      start_time,
      end_time
    });

    res.status(201).json({
      id: examId, title, duration_minutes, require_name, require_student_id,
      allow_multiple_submissions, shuffle_questions, shuffle_options, status,
      password: !!password
    });
  } catch (err) {
    const mapped = toErrorResponse(err);
    if (mapped.statusCode >= 500) console.error(err);
    res.status(mapped.statusCode).json(mapped.body);
  }
});

// GET /exams
router.get('/exams', async (req: AuthRequest, res: Response) => {
  try {
    const teacherId = req.teacherId!;
    const db = await getDb();
    const stmt = db.prepare('SELECT * FROM exams WHERE teacher_id = ? ORDER BY created_at DESC');
    stmt.bind([teacherId]);
    const exams: any[] = [];
    while (stmt.step()) exams.push(stmt.getAsObject());
    stmt.free();
    // Convert integer booleans, hide password
    exams.forEach(e => {
      e.require_name = !!e.require_name;
      e.require_student_id = !!e.require_student_id;
      e.allow_multiple_submissions = !!e.allow_multiple_submissions;
      e.shuffle_questions = !!e.shuffle_questions;
      e.shuffle_options = !!e.shuffle_options;
      e.password = e.password ? '****' : null;
    });
    res.json(exams);
  } catch (err) {
    const mapped = toErrorResponse(err);
    if (mapped.statusCode >= 500) console.error(err);
    res.status(mapped.statusCode).json(mapped.body);
  }
});

// GET /exams/:id (with questions and students list)
router.get('/exams/:id', async (req: AuthRequest, res: Response) => {
  try {
    const teacherId = req.teacherId!;
    const examId = parseInt(String(req.params.id), 10);
    const db = await getDb();

    const examStmt = db.prepare('SELECT * FROM exams WHERE id = ? AND teacher_id = ?');
    examStmt.bind([examId, teacherId]);
    let exam: any = null;
    if (examStmt.step()) exam = examStmt.getAsObject();
    examStmt.free();
    if (!exam) return res.status(404).json({ error: 'Exam not found' });

    // Questions
    const qStmt = db.prepare(`
      SELECT eq.id, eq.exam_id, eq.weight, eq.negative_mark, qi.text, qi.correct_option,
             MAX(CASE WHEN qio.option_key = 'A' THEN qio.option_text END) AS option_a,
             MAX(CASE WHEN qio.option_key = 'B' THEN qio.option_text END) AS option_b,
             MAX(CASE WHEN qio.option_key = 'C' THEN qio.option_text END) AS option_c,
             MAX(CASE WHEN qio.option_key = 'D' THEN qio.option_text END) AS option_d
      FROM exam_questions eq
      JOIN question_items qi ON qi.id = eq.question_item_id
      JOIN question_item_options qio ON qio.question_item_id = qi.id
      WHERE eq.exam_id = ?
      GROUP BY eq.id, eq.exam_id, eq.weight, eq.negative_mark, qi.text, qi.correct_option
      ORDER BY eq.id
    `);
    qStmt.bind([examId]);
    const questions: any[] = [];
    while (qStmt.step()) questions.push(qStmt.getAsObject());
    qStmt.free();

    // Allowed students
    const sStmt = db.prepare('SELECT id, student_id FROM exam_students WHERE exam_id = ? ORDER BY student_id');
    sStmt.bind([examId]);
    const students: any[] = [];
    while (sStmt.step()) students.push(sStmt.getAsObject());
    sStmt.free();

    exam.questions = questions;
    exam.students = students;
    // Convert booleans
    exam.require_name = !!exam.require_name;
    exam.require_student_id = !!exam.require_student_id;
    exam.allow_multiple_submissions = !!exam.allow_multiple_submissions;
    exam.shuffle_questions = !!exam.shuffle_questions;
    exam.shuffle_options = !!exam.shuffle_options;
    exam.password = exam.password ? '****' : null;

    res.json(exam);
  } catch (err) {
    const mapped = toErrorResponse(err);
    if (mapped.statusCode >= 500) console.error(err);
    res.status(mapped.statusCode).json(mapped.body);
  }
});

// PUT /exams/:id
router.put('/exams/:id', async (req: AuthRequest, res: Response) => {
  try {
    const teacherId = req.teacherId!;
    const examId = parseInt(String(req.params.id), 10);
    const db = await getDb();
    await teacherExamService.ensureOwnership(examId, teacherId);

    const {
      title, duration_minutes,
      require_name = true, require_student_id = false,
      allow_multiple_submissions = true,
      shuffle_questions = true, shuffle_options = true,
      status = 'published', password,
      start_time, end_time   // <-- ADD
    } = req.body;

    const fields: string[] = [];
    const params: any[] = [];

    if (title !== undefined) { fields.push('title = ?'); params.push(title); }
    if (duration_minutes !== undefined) { fields.push('duration_minutes = ?'); params.push(duration_minutes); }
    if (require_name !== undefined) { fields.push('require_name = ?'); params.push(require_name ? 1 : 0); }
    if (require_student_id !== undefined) { fields.push('require_student_id = ?'); params.push(require_student_id ? 1 : 0); }
    if (allow_multiple_submissions !== undefined) { fields.push('allow_multiple_submissions = ?'); params.push(allow_multiple_submissions ? 1 : 0); }
    if (shuffle_questions !== undefined) { fields.push('shuffle_questions = ?'); params.push(shuffle_questions ? 1 : 0); }
    if (shuffle_options !== undefined) { fields.push('shuffle_options = ?'); params.push(shuffle_options ? 1 : 0); }
    if (status !== undefined) {
      if (!['draft','published'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
      fields.push('status = ?'); params.push(status);
    }
    if (password !== undefined) { fields.push('password = ?'); params.push(password || null); }
    if (start_time !== undefined) {
    if (start_time && isNaN(Date.parse(start_time))) return res.status(400).json({ error: 'Invalid start_time' });
      fields.push('start_time = ?');
      params.push(start_time || null);
    }
    if (end_time !== undefined) {
      if (end_time && isNaN(Date.parse(end_time))) return res.status(400).json({ error: 'Invalid end_time' });
      fields.push('end_time = ?');
      params.push(end_time || null);
    }

    if (fields.length > 0) {
      params.push(examId);
      db.run(`UPDATE exams SET ${fields.join(', ')} WHERE id = ?`, params);
      saveDb();
    }

    const updated = db.prepare('SELECT * FROM exams WHERE id = ?');
    updated.bind([examId]);
    updated.step();
    const exam = updated.getAsObject();
    updated.free();
    exam.password = exam.password ? '****' : null;
    res.json(exam);
  } catch (err) {
    const mapped = toErrorResponse(err);
    if (mapped.statusCode >= 500) console.error(err);
    res.status(mapped.statusCode).json(mapped.body);
  }
});

// DELETE /exams/:id
router.delete('/exams/:id', async (req: AuthRequest, res: Response) => {
  try {
    const teacherId = req.teacherId!;
    const examId = parseInt(String(req.params.id), 10);
    const db = await getDb();
    db.run('DELETE FROM exams WHERE id = ? AND teacher_id = ?', [examId, teacherId]);
    saveDb();
    res.json({ success: true });
  } catch (err) {
    const mapped = toErrorResponse(err);
    if (mapped.statusCode >= 500) console.error(err);
    res.status(mapped.statusCode).json(mapped.body);
  }
});

router.get('/exams/:id/pool-rules', async (req: AuthRequest, res: Response) => {
  try {
    const teacherId = req.teacherId!;
    const examId = parseInt(String(req.params.id), 10);
    const db = await getDb();
    await teacherExamService.ensureOwnership(examId, teacherId);
    const stmt = db.prepare(
      'SELECT id, tag, difficulty, question_count FROM exam_pool_rules WHERE exam_id = ? ORDER BY id'
    );
    stmt.bind([examId]);
    const rules: any[] = [];
    while (stmt.step()) rules.push(stmt.getAsObject());
    stmt.free();
    res.json(rules);
  } catch (err) {
    const mapped = toErrorResponse(err);
    if (mapped.statusCode >= 500) console.error(err);
    res.status(mapped.statusCode).json(mapped.body);
  }
});

router.post('/exams/:id/pool-rules', async (req: AuthRequest, res: Response) => {
  try {
    const teacherId = req.teacherId!;
    const examId = parseInt(String(req.params.id), 10);
    const { rules } = req.body;
    const db = await getDb();
    await teacherExamService.ensureOwnership(examId, teacherId);
    db.run('DELETE FROM exam_pool_rules WHERE exam_id = ?', [examId]);
    const insertStmt = db.prepare(
      'INSERT INTO exam_pool_rules (exam_id, tag, difficulty, question_count) VALUES (?, ?, ?, ?)'
    );
    for (const rule of Array.isArray(rules) ? rules : []) {
      insertStmt.bind([
        examId,
        rule.tag || null,
        rule.difficulty || null,
        Number(rule.question_count || 0)
      ]);
      insertStmt.step();
      insertStmt.reset();
    }
    insertStmt.free();
    saveDb();
    res.status(201).json({ success: true });
  } catch (err) {
    const mapped = toErrorResponse(err);
    if (mapped.statusCode >= 500) console.error(err);
    res.status(mapped.statusCode).json(mapped.body);
  }
});

router.get('/exams/:id/notifications', async (req: AuthRequest, res: Response) => {
  try {
    const teacherId = req.teacherId!;
    const examId = parseInt(String(req.params.id), 10);
    const db = await getDb();
    await teacherExamService.ensureOwnership(examId, teacherId);
    const stmt = db.prepare(
      'SELECT id, job_type, target_student_id, scheduled_for, status FROM notification_jobs WHERE exam_id = ? ORDER BY scheduled_for'
    );
    stmt.bind([examId]);
    const jobs: any[] = [];
    while (stmt.step()) jobs.push(stmt.getAsObject());
    stmt.free();
    res.json(jobs);
  } catch (err) {
    const mapped = toErrorResponse(err);
    if (mapped.statusCode >= 500) console.error(err);
    res.status(mapped.statusCode).json(mapped.body);
  }
});

router.post('/exams/:id/notifications', async (req: AuthRequest, res: Response) => {
  try {
    const teacherId = req.teacherId!;
    const examId = parseInt(String(req.params.id), 10);
    const { jobs } = req.body;
    const db = await getDb();
    await teacherExamService.ensureOwnership(examId, teacherId);
    const stmt = db.prepare(
      `INSERT INTO notification_jobs (exam_id, job_type, target_student_id, scheduled_for, payload_json)
       VALUES (?, ?, ?, ?, ?)`
    );
    for (const job of Array.isArray(jobs) ? jobs : []) {
      stmt.bind([
        examId,
        job.job_type,
        job.target_student_id || null,
        job.scheduled_for,
        job.payload ? JSON.stringify(job.payload) : null
      ]);
      stmt.step();
      stmt.reset();
    }
    stmt.free();
    saveDb();
    res.status(201).json({ success: true });
  } catch (err) {
    const mapped = toErrorResponse(err);
    if (mapped.statusCode >= 500) console.error(err);
    res.status(mapped.statusCode).json(mapped.body);
  }
});

export default router;