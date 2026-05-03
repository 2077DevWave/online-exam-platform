// src/utils/tokens.ts
import jwt from 'jsonwebtoken';

const EXAM_TOKEN_SECRET = process.env.EXAM_TOKEN_SECRET || 'exam-secret-change-me';

export interface ExamTokenPayload {
  exam_id: number;
  type: 'password' | 'student' | 'public';
  student_id?: string;
}

export function generateExamToken(payload: ExamTokenPayload): string {
  return jwt.sign(payload, EXAM_TOKEN_SECRET, { expiresIn: '24h' });
}

export function verifyExamToken(token: string): ExamTokenPayload {
  return jwt.verify(token, EXAM_TOKEN_SECRET) as ExamTokenPayload;
}