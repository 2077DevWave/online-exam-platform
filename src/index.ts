// src/index.ts
import express from 'express';
import path from 'path';
import { getDb } from './database';
import authRoutes from './routes/auth';
import teacherRoutes from './routes/teacher';
import studentRoutes from './routes/student';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Auth routes (public)
app.use('/api', authRoutes);

// Teacher routes (protected)
app.use('/api', teacherRoutes);

// Student routes (public)
app.use('/api', studentRoutes);

// Dynamic exam page
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