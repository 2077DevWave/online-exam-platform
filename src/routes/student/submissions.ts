// src/routes/student/submissions.ts
import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { getDb, saveDb } from '../../database';
import { services } from '../../modules/composition';
import { toErrorResponse } from '../../modules/shared/DomainError';
import { validateRequest, createSubmissionSchema } from '../../middleware/validation';

const router = Router();
const { submissionService } = services;

router.post('/submissions', validateRequest(createSubmissionSchema), async (req: Request, res: Response) => {
  try {
    const result = await submissionService.createSubmission(req.body, req.headers.authorization);
    res.status(201).json(result);
  } catch (err) {
    const mapped = toErrorResponse(err);
    if (mapped.statusCode >= 500) console.error(err);
    res.status(mapped.statusCode).json(mapped.body);
  }
});

router.post('/attempt-sessions/start', async (req: Request, res: Response) => {
  try {
    const { exam_id, student_name, student_id, exam_token, remaining_seconds } = req.body;
    const db = await getDb();
    const sessionKey = crypto.randomUUID();
    db.run(
      `INSERT INTO attempt_sessions
       (exam_id, student_name, student_id, exam_token, session_key, remaining_seconds, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
      [exam_id, student_name || null, student_id || null, exam_token || null, sessionKey, remaining_seconds ?? null]
    );
    const idResult = db.exec('SELECT last_insert_rowid() as id');
    const attempt_session_id = Number(idResult[0].values[0][0]);
    saveDb();
    res.status(201).json({ attempt_session_id, session_key: sessionKey });
  } catch (err) {
    const mapped = toErrorResponse(err);
    if (mapped.statusCode >= 500) console.error(err);
    res.status(mapped.statusCode).json(mapped.body);
  }
});

router.post('/attempt-sessions/:id/autosave', async (req: Request, res: Response) => {
  try {
    const attemptSessionId = parseInt(String(req.params.id), 10);
    const { answers = [], remaining_seconds, question_order } = req.body;
    const db = await getDb();
    const upsert = db.prepare(
      `INSERT INTO attempt_answers (attempt_session_id, exam_question_id, selected_option, updated_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(attempt_session_id, exam_question_id)
       DO UPDATE SET selected_option = excluded.selected_option, updated_at = datetime('now')`
    );
    for (const answer of answers) {
      upsert.bind([attemptSessionId, answer.question_id, answer.selected_option || null]);
      upsert.step();
      upsert.reset();
    }
    upsert.free();

    if (Array.isArray(question_order)) {
      db.run('DELETE FROM exam_attempt_questions WHERE attempt_session_id = ?', [attemptSessionId]);
      const insertOrder = db.prepare(
        'INSERT INTO exam_attempt_questions (attempt_session_id, exam_question_id, position) VALUES (?, ?, ?)'
      );
      question_order.forEach((questionId: number, position: number) => {
        insertOrder.bind([attemptSessionId, questionId, position]);
        insertOrder.step();
        insertOrder.reset();
      });
      insertOrder.free();
    }

    db.run(
      'UPDATE attempt_sessions SET updated_at = datetime(\'now\'), remaining_seconds = COALESCE(?, remaining_seconds) WHERE id = ?',
      [remaining_seconds ?? null, attemptSessionId]
    );
    saveDb();
    res.json({ success: true });
  } catch (err) {
    const mapped = toErrorResponse(err);
    if (mapped.statusCode >= 500) console.error(err);
    res.status(mapped.statusCode).json(mapped.body);
  }
});

router.get('/attempt-sessions/resume', async (req: Request, res: Response) => {
  try {
    const examId = Number(req.query.exam_id);
    const studentId = (req.query.student_id as string) || '';
    const studentName = (req.query.student_name as string) || '';
    const db = await getDb();
    const stmt = db.prepare(
      `SELECT id, remaining_seconds, updated_at
       FROM attempt_sessions
       WHERE exam_id = ?
         AND submitted_at IS NULL
         AND ((? <> '' AND student_id = ?) OR (? <> '' AND student_name = ?))
       ORDER BY updated_at DESC
       LIMIT 1`
    );
    stmt.bind([examId, studentId, studentId, studentName, studentName]);
    if (!stmt.step()) {
      stmt.free();
      return res.json({ resumable: false });
    }
    const session = stmt.getAsObject() as any;
    stmt.free();

    const answersStmt = db.prepare(
      `SELECT exam_question_id as question_id, selected_option
       FROM attempt_answers
       WHERE attempt_session_id = ?`
    );
    answersStmt.bind([session.id]);
    const answers: any[] = [];
    while (answersStmt.step()) answers.push(answersStmt.getAsObject());
    answersStmt.free();

    const orderStmt = db.prepare(
      `SELECT exam_question_id
       FROM exam_attempt_questions
       WHERE attempt_session_id = ?
       ORDER BY position`
    );
    orderStmt.bind([session.id]);
    const question_order: number[] = [];
    while (orderStmt.step()) {
      question_order.push(Number((orderStmt.getAsObject() as any).exam_question_id));
    }
    orderStmt.free();

    res.json({
      resumable: true,
      attempt_session_id: session.id,
      remaining_seconds: session.remaining_seconds,
      answers,
      question_order
    });
  } catch (err) {
    const mapped = toErrorResponse(err);
    if (mapped.statusCode >= 500) console.error(err);
    res.status(mapped.statusCode).json(mapped.body);
  }
});

router.post('/integrity-events', async (req: Request, res: Response) => {
  try {
    const { attempt_session_id, exam_id, student_id, event_type, payload, device_fingerprint } = req.body;
    const db = await getDb();
    const ip = req.ip || req.socket.remoteAddress || null;
    db.run(
      `INSERT INTO integrity_events
       (attempt_session_id, exam_id, student_id, event_type, event_payload_json, ip_address, device_fingerprint)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        attempt_session_id || null,
        exam_id,
        student_id || null,
        event_type,
        payload ? JSON.stringify(payload) : null,
        ip,
        device_fingerprint || null
      ]
    );
    saveDb();
    res.status(201).json({ success: true });
  } catch (err) {
    const mapped = toErrorResponse(err);
    if (mapped.statusCode >= 500) console.error(err);
    res.status(mapped.statusCode).json(mapped.body);
  }
});

export default router;