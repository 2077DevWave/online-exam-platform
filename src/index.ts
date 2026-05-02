// src/index.ts
import express from 'express';
import path from 'path';
import { getDb } from './database';
import teacherRoutes from './routes/teacher';
import studentRoutes from './routes/student';   // <-- import

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Teacher API
app.use('/api', teacherRoutes);

// Student API
app.use('/api', studentRoutes);   // <-- mount

// Dynamic exam page: any /exam/xxx serves exam.html
app.get('/exam/:id', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'exam.html'));
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

async function start() {
  await getDb();
  console.log('Database ready.');
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

start().catch(console.error);