const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

require('ts-node/register/transpile-only');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'online-exam-tests-'));
process.env.DB_PATH = path.join(tempDir, 'exam.db');
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.EXAM_TOKEN_SECRET = 'test-exam-token-secret';

const { createApp } = require('../src/app');
const { getDb, resetDbForTests } = require('../src/database');

let server;
let baseUrl;
let teacherToken;
let examId;

async function requestJson(method, route, body, headers = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  return { response, payload };
}

test.before(async () => {
  await getDb();
  const app = createApp();
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

test.after(async () => {
  if (server) {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
  resetDbForTests();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('health endpoint currently requires auth due route order', async () => {
  const res = await fetch(`${baseUrl}/api/health`);
  const body = await res.json();
  assert.equal(res.status, 401);
  assert.equal(body.error, 'Missing or invalid token');
});

test('teacher can register, login, create exam and question', async () => {
  const register = await requestJson('POST', '/api/auth/register', {
    username: 'alice',
    password: 'password123'
  });
  assert.equal(register.response.status, 201);

  const login = await requestJson('POST', '/api/auth/login', {
    username: 'alice',
    password: 'password123'
  });
  assert.equal(login.response.status, 200);
  assert.ok(login.payload.token);
  teacherToken = login.payload.token;

  const examRes = await requestJson(
    'POST',
    '/api/exams',
    {
      title: 'Math Midterm',
      duration_minutes: 30,
      require_name: true,
      require_student_id: false,
      allow_multiple_submissions: false,
      shuffle_questions: false,
      shuffle_options: false,
      status: 'published'
    },
    { Authorization: `Bearer ${teacherToken}` }
  );
  assert.equal(examRes.response.status, 201);
  examId = examRes.payload.id;
  assert.ok(examId);

  const questionRes = await requestJson(
    'POST',
    `/api/exams/${examId}/questions`,
    {
      text: '2 + 2 = ?',
      option_a: '3',
      option_b: '4',
      option_c: '5',
      option_d: '6',
      correct_option: 'B'
    },
    { Authorization: `Bearer ${teacherToken}` }
  );
  assert.equal(questionRes.response.status, 201);
});

test('public exam flow and submission scoring work', async () => {
  const examRes = await requestJson('GET', `/api/public/exams/${examId}`);
  assert.equal(examRes.response.status, 200);
  assert.equal(examRes.payload.title, 'Math Midterm');
  assert.equal(examRes.payload.questions.length, 1);

  const submitRes = await requestJson('POST', '/api/submissions', {
    exam_id: examId,
    student_name: 'Bob',
    started_at: new Date().toISOString(),
    answers: [{ question_id: examRes.payload.questions[0].id, selected_option: 'B' }]
  });

  assert.equal(submitRes.response.status, 201);
  assert.equal(Math.round(submitRes.payload.score), 100);

  const alreadyRes = await requestJson(
    'GET',
    `/api/public/exams/${examId}/already-submitted?name=${encodeURIComponent('Bob')}`
  );
  assert.equal(alreadyRes.response.status, 200);
  assert.equal(alreadyRes.payload.submitted, true);
});

test('single-submission policy blocks duplicate attempts', async () => {
  const examRes = await requestJson('GET', `/api/public/exams/${examId}`);
  const duplicateRes = await requestJson('POST', '/api/submissions', {
    exam_id: examId,
    student_name: 'Bob',
    started_at: new Date().toISOString(),
    answers: [{ question_id: examRes.payload.questions[0].id, selected_option: 'A' }]
  });
  assert.equal(duplicateRes.response.status, 409);
});
