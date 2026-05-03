// src/routes/auth.ts
import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getDb, saveDb } from '../database';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';

// POST /api/auth/register
router.post('/auth/register', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const db = await getDb();

    // Check if username exists
    const checkStmt = db.prepare('SELECT id FROM teachers WHERE username = ?');
    checkStmt.bind([username]);
    if (checkStmt.step()) {
      checkStmt.free();
      return res.status(409).json({ error: 'Username already taken' });
    }
    checkStmt.free();

    // Hash password
    const hash = await bcrypt.hash(password, 10);

    // Insert teacher
    db.run('INSERT INTO teachers (username, password_hash) VALUES (?, ?)', [username, hash]);
    saveDb();

    res.status(201).json({ message: 'Registration successful' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/login
router.post('/auth/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const db = await getDb();
    const stmt = db.prepare('SELECT id, password_hash FROM teachers WHERE username = ?');
    stmt.bind([username]);
    if (!stmt.step()) {
      stmt.free();
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const teacher = stmt.getAsObject() as { id: number; password_hash: string };
    stmt.free();

    const valid = await bcrypt.compare(password, teacher.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: teacher.id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;