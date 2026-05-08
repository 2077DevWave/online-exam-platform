// src/routes/teacher/questions.ts
import { Router, Response } from 'express';
import { getDb, saveDb, insertRow } from '../../database';
import { AuthRequest } from '../../middleware/auth';
import { services } from '../../modules/composition';
import { toErrorResponse } from '../../modules/shared/DomainError';

const router = Router();
const { teacherExamService } = services;

function parseNonNegativeNumber(value: unknown, fallback: number) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return parsed;
}

// POST /exams/:id/questions
router.post('/exams/:id/questions', async (req: AuthRequest, res: Response) => {
  try {
    const teacherId = req.teacherId!;
    const examId = parseInt(String(req.params.id), 10);
    const { text, option_a, option_b, option_c, option_d, correct_option, weight, negative_mark } = req.body;
    const parsedWeight = parseNonNegativeNumber(weight, 1);
    const parsedNegativeMark = parseNonNegativeNumber(negative_mark, 0);
    if (parsedWeight === null || parsedNegativeMark === null) {
      return res.status(400).json({ error: 'weight and negative_mark must be non-negative numbers.' });
    }

    if (!text || !option_a || !option_b || !option_c || !option_d || !correct_option) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }
    if (!['A', 'B', 'C', 'D'].includes(correct_option)) {
      return res.status(400).json({ error: 'correct_option must be A, B, C, or D.' });
    }

    await teacherExamService.ensureOwnership(examId, teacherId);

    const questionItemId = await insertRow(
      'INSERT INTO question_items (text, correct_option) VALUES (?, ?)',
      [text, correct_option]
    );
    const db = await getDb();
    db.run(
      `INSERT INTO question_item_options (question_item_id, option_key, option_text)
       VALUES (?, 'A', ?), (?, 'B', ?), (?, 'C', ?), (?, 'D', ?)`,
      [questionItemId, option_a, questionItemId, option_b, questionItemId, option_c, questionItemId, option_d]
    );
    const questionId = await insertRow(
      'INSERT INTO exam_questions (exam_id, question_item_id, position, weight, negative_mark) VALUES (?, ?, ?, ?, ?)',
      [examId, questionItemId, Date.now(), parsedWeight, parsedNegativeMark]
    );
    saveDb();

    res.status(201).json({
      id: questionId,
      exam_id: examId,
      text,
      correct_option,
      weight: parsedWeight,
      negative_mark: parsedNegativeMark
    });
  } catch (err) {
    const mapped = toErrorResponse(err);
    if (mapped.statusCode >= 500) console.error(err);
    res.status(mapped.statusCode).json(mapped.body);
  }
});

// PUT /questions/:id
router.put('/questions/:id', async (req: AuthRequest, res: Response) => {
  try {
    const teacherId = req.teacherId!;
    const questionId = parseInt(String(req.params.id), 10);
    const { text, option_a, option_b, option_c, option_d, correct_option, weight, negative_mark } = req.body;
    const parsedWeight = parseNonNegativeNumber(weight, 1);
    const parsedNegativeMark = parseNonNegativeNumber(negative_mark, 0);
    if ((weight !== undefined && parsedWeight === null) || (negative_mark !== undefined && parsedNegativeMark === null)) {
      return res.status(400).json({ error: 'weight and negative_mark must be non-negative numbers.' });
    }

    if (Number.isNaN(questionId)) {
      return res.status(400).json({ error: 'Invalid question id.' });
    }
    if (correct_option !== undefined && !['A', 'B', 'C', 'D'].includes(correct_option)) {
      return res.status(400).json({ error: 'correct_option must be A, B, C, or D.' });
    }

    const hasUpdateField = [
      text,
      option_a,
      option_b,
      option_c,
      option_d,
      correct_option
      , weight, negative_mark
    ].some((v) => v !== undefined);
    if (!hasUpdateField) {
      return res.status(400).json({ error: 'No fields to update.' });
    }

    const db = await getDb();
    const ownershipStmt = db.prepare(`
      SELECT eq.id, eq.exam_id, eq.question_item_id
      FROM exam_questions eq
      JOIN exams e ON e.id = eq.exam_id
      WHERE eq.id = ? AND e.teacher_id = ?
    `);
    ownershipStmt.bind([questionId, teacherId]);
    if (!ownershipStmt.step()) {
      ownershipStmt.free();
      return res.status(404).json({ error: 'Question not found' });
    }
    const ownedQuestion = ownershipStmt.getAsObject() as any;
    ownershipStmt.free();

    const itemId = Number(ownedQuestion.question_item_id);

    if (weight !== undefined) {
      db.run('UPDATE exam_questions SET weight = ? WHERE id = ?', [parsedWeight, questionId]);
    }
    if (negative_mark !== undefined) {
      db.run('UPDATE exam_questions SET negative_mark = ? WHERE id = ?', [parsedNegativeMark, questionId]);
    }

    if (text !== undefined || correct_option !== undefined) {
      const itemFields: string[] = ['updated_at = datetime(\'now\')'];
      const itemParams: any[] = [];
      if (text !== undefined) {
        itemFields.push('text = ?');
        itemParams.push(text);
      }
      if (correct_option !== undefined) {
        itemFields.push('correct_option = ?');
        itemParams.push(correct_option);
      }
      itemParams.push(itemId);
      db.run(`UPDATE question_items SET ${itemFields.join(', ')} WHERE id = ?`, itemParams);
    }

    if (option_a !== undefined) {
      db.run(
        `UPDATE question_item_options SET option_text = ? WHERE question_item_id = ? AND option_key = 'A'`,
        [option_a, itemId]
      );
    }
    if (option_b !== undefined) {
      db.run(
        `UPDATE question_item_options SET option_text = ? WHERE question_item_id = ? AND option_key = 'B'`,
        [option_b, itemId]
      );
    }
    if (option_c !== undefined) {
      db.run(
        `UPDATE question_item_options SET option_text = ? WHERE question_item_id = ? AND option_key = 'C'`,
        [option_c, itemId]
      );
    }
    if (option_d !== undefined) {
      db.run(
        `UPDATE question_item_options SET option_text = ? WHERE question_item_id = ? AND option_key = 'D'`,
        [option_d, itemId]
      );
    }
    saveDb();

    const updatedStmt = db.prepare(`
      SELECT eq.id, eq.exam_id, eq.weight, eq.negative_mark, qi.text, qi.correct_option,
             MAX(CASE WHEN qio.option_key = 'A' THEN qio.option_text END) AS option_a,
             MAX(CASE WHEN qio.option_key = 'B' THEN qio.option_text END) AS option_b,
             MAX(CASE WHEN qio.option_key = 'C' THEN qio.option_text END) AS option_c,
             MAX(CASE WHEN qio.option_key = 'D' THEN qio.option_text END) AS option_d
      FROM exam_questions eq
      JOIN question_items qi ON qi.id = eq.question_item_id
      JOIN question_item_options qio ON qio.question_item_id = qi.id
      WHERE eq.id = ?
      GROUP BY eq.id, eq.exam_id, eq.weight, eq.negative_mark, qi.text, qi.correct_option
    `);
    updatedStmt.bind([questionId]);
    updatedStmt.step();
    const updatedQuestion = updatedStmt.getAsObject();
    updatedStmt.free();

    res.json(updatedQuestion);
  } catch (err) {
    const mapped = toErrorResponse(err);
    if (mapped.statusCode >= 500) console.error(err);
    res.status(mapped.statusCode).json(mapped.body);
  }
});

// DELETE /questions/:id
router.delete('/questions/:id', async (req: AuthRequest, res: Response) => {
  try {
    const teacherId = req.teacherId!;
    const qId = parseInt(String(req.params.id), 10);
    const db = await getDb();

    // Delete only if question's exam belongs to teacher
    const stmt = db.prepare(`
      DELETE FROM exam_questions
      WHERE id = ? 
      AND exam_id IN (SELECT id FROM exams WHERE teacher_id = ?)
    `);
    stmt.bind([qId, teacherId]);
    stmt.step();
    stmt.free();
    saveDb();
    res.json({ success: true });
  } catch (err) {
    const mapped = toErrorResponse(err);
    if (mapped.statusCode >= 500) console.error(err);
    res.status(mapped.statusCode).json(mapped.body);
  }
});

export default router;