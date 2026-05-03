// src/index.ts
import express from 'express';
import path from 'path';
import { getDb } from './database';
import authRoutes from './routes/auth';
import studentRoutes from './routes/student';    // public
import teacherRoutes from './routes/teacher';    // protected

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// 1. Auth routes (public)
app.use('/api', authRoutes);

// 2. Student routes (public) – MUST come before teacher routes
app.use('/api', studentRoutes);

// 3. Teacher routes (protected – authMiddleware applied inside)
app.use('/api', teacherRoutes);

app.get('/exam/:id', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'exam.html'));
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

async function start() {
  await getDb();
  console.log('Database ready.');
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

start().catch(console.error);