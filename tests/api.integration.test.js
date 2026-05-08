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
let weightedExamId;

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

  const weightedExamRes = await requestJson(
    'POST',
    '/api/exams',
    {
      title: 'Weighted Quiz',
      duration_minutes: 30,
      require_name: true,
      allow_multiple_submissions: true,
      shuffle_questions: false,
      shuffle_options: false,
      status: 'published'
    },
    { Authorization: `Bearer ${teacherToken}` }
  );
  assert.equal(weightedExamRes.response.status, 201);
  weightedExamId = weightedExamRes.payload.id;

  const q1 = await requestJson(
    'POST',
    `/api/exams/${weightedExamId}/questions`,
    {
      text: 'Capital of France?',
      option_a: 'Paris',
      option_b: 'Rome',
      option_c: 'Berlin',
      option_d: 'Madrid',
      correct_option: 'A',
      weight: 2,
      negative_mark: 0.5
    },
    { Authorization: `Bearer ${teacherToken}` }
  );
  assert.equal(q1.response.status, 201);

  const q2 = await requestJson(
    'POST',
    `/api/exams/${weightedExamId}/questions`,
    {
      text: '5 * 5 = ?',
      option_a: '10',
      option_b: '20',
      option_c: '25',
      option_d: '30',
      correct_option: 'C',
      weight: 1,
      negative_mark: 0
    },
    { Authorization: `Bearer ${teacherToken}` }
  );
  assert.equal(q2.response.status, 201);
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

test('weighted + negative marking scoring works and rescore updates', async () => {
  const examRes = await requestJson('GET', `/api/public/exams/${weightedExamId}`);
  assert.equal(examRes.response.status, 200);
  assert.equal(examRes.payload.questions.length, 2);

  const firstQuestionId = examRes.payload.questions[0].id;
  const secondQuestionId = examRes.payload.questions[1].id;

  const submitRes = await requestJson('POST', '/api/submissions', {
    exam_id: weightedExamId,
    student_name: 'Charlie',
    answers: [
      { question_id: firstQuestionId, selected_option: 'A' },
      { question_id: secondQuestionId, selected_option: 'A' }
    ]
  });
  assert.equal(submitRes.response.status, 201);
  assert.equal(submitRes.payload.score.toFixed(1), '66.7');

  const updateQuestion = await requestJson(
    'PUT',
    `/api/questions/${secondQuestionId}`,
    { correct_option: 'A' },
    { Authorization: `Bearer ${teacherToken}` }
  );
  assert.equal(updateQuestion.response.status, 200);

  const rescore = await requestJson(
    'POST',
    `/api/exams/${weightedExamId}/submissions/rescore`,
    {},
    { Authorization: `Bearer ${teacherToken}` }
  );
  assert.equal(rescore.response.status, 200);

  const submissions = await requestJson(
    'GET',
    `/api/exams/${weightedExamId}/submissions`,
    null,
    { Authorization: `Bearer ${teacherToken}` }
  );
  assert.equal(submissions.response.status, 200);
  assert.equal(submissions.payload[0].score.toFixed(1), '100.0');
});

test('attempt autosave and resume endpoints persist progress', async () => {
  const examRes = await requestJson('GET', `/api/public/exams/${weightedExamId}`);
  const questionId = examRes.payload.questions[0].id;

  const start = await requestJson('POST', '/api/attempt-sessions/start', {
    exam_id: weightedExamId,
    student_name: 'Dana',
    student_id: 'S-1',
    remaining_seconds: 1700
  });
  assert.equal(start.response.status, 201);
  const attemptId = start.payload.attempt_session_id;

  const autosave = await requestJson('POST', `/api/attempt-sessions/${attemptId}/autosave`, {
    remaining_seconds: 1600,
    question_order: [questionId],
    answers: [{ question_id: questionId, selected_option: 'B' }]
  });
  assert.equal(autosave.response.status, 200);

  const resume = await requestJson(
    'GET',
    `/api/attempt-sessions/resume?exam_id=${weightedExamId}&student_id=${encodeURIComponent('S-1')}`
  );
  assert.equal(resume.response.status, 200);
  assert.equal(resume.payload.resumable, true);
  assert.equal(resume.payload.answers[0].selected_option, 'B');
});
