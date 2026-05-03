// src/utils/tokens.ts
import jwt from 'jsonwebtoken';
import { env } from '../config/env';


export interface ExamTokenPayload {
  exam_id: number;
  type: 'password' | 'student' | 'public';
  student_id?: string;
}

export function generateExamToken(payload: ExamTokenPayload): string {
  return jwt.sign(payload, env.examTokenSecret, { expiresIn: '24h' });
}

export function verifyExamToken(token: string): ExamTokenPayload {
  return jwt.verify(token, env.examTokenSecret) as ExamTokenPayload;
}