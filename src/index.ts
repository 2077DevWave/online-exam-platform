// src/index.ts
import express from 'express';
import path from 'path';
import { getDb } from './database';
import authRoutes from './routes/auth';
import studentRoutes from './routes/student';    // student/index.ts
import teacherRoutes from './routes/teacher';    // teacher/index.ts

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Public routes
app.use('/api', authRoutes);
app.use('/api', studentRoutes);    // no auth

// Protected routes (auth applied inside teacher/index.ts)
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