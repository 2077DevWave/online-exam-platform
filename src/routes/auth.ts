// src/routes/auth.ts
import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getDb, saveDb } from '../database';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { env } from '../config/env';

const router = Router();

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

    const orgStmt = db.prepare(
      `SELECT organization_id, role
       FROM organization_members
       WHERE teacher_id = ?
       ORDER BY id
       LIMIT 1`
    );
    orgStmt.bind([teacher.id]);
    let orgMember: any = null;
    if (orgStmt.step()) orgMember = orgStmt.getAsObject();
    orgStmt.free();

    const token = jwt.sign(
      {
        id: teacher.id,
        role: orgMember?.role || 'teacher',
        organization_id: orgMember?.organization_id ?? null
      },
      env.jwtSecret,
      { expiresIn: '7d' }
    );
    res.json({ token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/auth/change-password (protected)
router.put('/auth/change-password', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const teacherId = req.teacherId!;
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password are required' });
    }
    const db = await getDb();
    const stmt = db.prepare('SELECT password_hash FROM teachers WHERE id = ?');
    stmt.bind([teacherId]);
    if (!stmt.step()) { stmt.free(); return res.status(404).json({ error: 'Teacher not found' }); }
    const { password_hash } = stmt.getAsObject() as any;
    stmt.free();

    const valid = await bcrypt.compare(currentPassword, password_hash);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

    const newHash = await bcrypt.hash(newPassword, 10);
    db.run('UPDATE teachers SET password_hash = ? WHERE id = ?', [newHash, teacherId]);
    saveDb();
    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/auth/organizations', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const teacherId = req.teacherId!;
    const { name } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'Organization name is required' });
    }
    const db = await getDb();
    db.run('INSERT INTO organizations (name) VALUES (?)', [String(name).trim()]);
    const orgResult = db.exec('SELECT last_insert_rowid() as id');
    const organizationId = Number(orgResult[0].values[0][0]);
    db.run(
      'INSERT INTO organization_members (organization_id, teacher_id, role) VALUES (?, ?, ?)',
      [organizationId, teacherId, 'admin']
    );
    saveDb();
    res.status(201).json({ organization_id: organizationId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/auth/organizations/:id/members', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const teacherId = req.teacherId!;
    const organizationId = parseInt(String(req.params.id), 10);
    const { member_teacher_id, role = 'teacher' } = req.body;
    const db = await getDb();
    const adminStmt = db.prepare(
      'SELECT 1 AS ok FROM organization_members WHERE organization_id = ? AND teacher_id = ? AND role = \'admin\''
    );
    adminStmt.bind([organizationId, teacherId]);
    if (!adminStmt.step()) {
      adminStmt.free();
      return res.status(403).json({ error: 'Only organization admins can manage members' });
    }
    adminStmt.free();

    db.run(
      'INSERT OR REPLACE INTO organization_members (organization_id, teacher_id, role) VALUES (?, ?, ?)',
      [organizationId, Number(member_teacher_id), role]
    );
    saveDb();
    res.status(201).json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;