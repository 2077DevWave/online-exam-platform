import path from 'path';

const ROOT_DIR = path.join(__dirname, '..', '..');

export const env = {
  port: Number(process.env.PORT || 3000),
  dbPath: process.env.DB_PATH || path.join(ROOT_DIR, 'data', 'exam.db'),
  jwtSecret: process.env.JWT_SECRET || 'change-me-in-production',
  examTokenSecret: process.env.EXAM_TOKEN_SECRET || 'exam-secret-change-me',
};
