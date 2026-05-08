const API = '/api';
const pathParts = window.location.pathname.split('/');
const examId = parseInt(pathParts[pathParts.length - 1], 10);

if (!examId || Number.isNaN(examId)) {
  document.getElementById('startScreen').innerHTML = '<h2>Invalid exam link</h2>';
}

let exam = null;
let examToken = null;
let timerInterval = null;
let timeLeft = 0;
let shuffledQuestions = [];
let attemptSessionId = null;
let autosaveInterval = null;
let integrityAttached = false;

async function loadExam() {
  try {
    const res = await fetch(`${API}/public/exams/${examId}`);
    if (!res.ok) {
      if (res.status === 403) {
        const err = await res.json();
        document.getElementById('startScreen').innerHTML = `<h2>${err.error}</h2>`;
        return;
      }
      document.getElementById('startScreen').innerHTML = '<h2>Exam not found or not published</h2>';
      return;
    }
    exam = await res.json();
    document.getElementById('examTitle').textContent = exam.title;
    document.getElementById('examInfo').textContent = `${exam.questions.length} questions · ${exam.duration_minutes} minutes`;

    const authDiv = document.getElementById('authSection');
    authDiv.innerHTML = '';

    if (exam.has_password || exam.require_student_auth) {
      if (exam.has_password && !exam.require_student_auth) {
        authDiv.innerHTML = `
          <div class="info">This exam is password-protected.</div>
          <input type="password" id="examPassword" placeholder="Enter exam password">
          <button onclick="authenticatePassword()">Verify Password</button>
          <p id="passwordError" class="error"></p>
        `;
      } else if (exam.require_student_auth) {
        authDiv.innerHTML = `
          <div class="info">Please login with your student credentials.</div>
          <input type="text" id="studentIdInput" placeholder="Student ID">
          <input type="password" id="studentPasswordInput" placeholder="Password">
          <button onclick="authenticateStudent()">Login</button>
          <p id="studentLoginError" class="error"></p>
        `;
      }
    } else {
      if (exam.require_name) {
        authDiv.innerHTML += `
          <div>
            <label>Your Name</label>
            <input type="text" id="studentName" placeholder="Enter your name">
          </div>
        `;
      }
      if (exam.require_student_id) {
        authDiv.innerHTML += `
          <div>
            <label>Student ID</label>
            <input type="text" id="studentId" placeholder="Enter your student ID">
          </div>
        `;
      }
      document.getElementById('startBtn').disabled = false;
    }
  } catch (_err) {
    document.getElementById('startScreen').innerHTML = '<h2>Error loading exam</h2>';
  }
}

async function authenticatePassword() {
  const password = document.getElementById('examPassword').value;
  const errorEl = document.getElementById('passwordError');
  try {
    const res = await fetch(`${API}/public/exams/${examId}/verify-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    const data = await res.json();
    if (!res.ok) {
      errorEl.textContent = data.error || 'Wrong password';
      return;
    }
    examToken = data.token;
    const authDiv = document.getElementById('authSection');
    authDiv.innerHTML = '';
    if (exam.require_name) {
      authDiv.innerHTML += '<div><label>Your Name</label><input type="text" id="studentName" placeholder="Enter your name"></div>';
    }
    if (exam.require_student_id) {
      authDiv.innerHTML += '<div><label>Student ID</label><input type="text" id="studentId" placeholder="Enter your student ID"></div>';
    }
    document.getElementById('startBtn').disabled = false;
    errorEl.textContent = '';
  } catch (_err) {
    errorEl.textContent = 'Network error';
  }
}

async function authenticateStudent() {
  const student_id = document.getElementById('studentIdInput').value.trim();
  const password = document.getElementById('studentPasswordInput').value;
  const errorEl = document.getElementById('studentLoginError');
  if (!student_id || !password) {
    errorEl.textContent = 'Please fill both fields.';
    return;
  }
  try {
    const res = await fetch(`${API}/public/exams/${examId}/student-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_id, password })
    });
    const data = await res.json();
    if (!res.ok) {
      errorEl.textContent = data.error || 'Invalid credentials';
      return;
    }
    examToken = data.token;
    const authDiv = document.getElementById('authSection');
    authDiv.innerHTML = '';
    if (exam.require_name) {
      authDiv.innerHTML += '<div><label>Your Name</label><input type="text" id="studentName" placeholder="Enter your name"></div>';
    }
    document.getElementById('startBtn').disabled = false;
    errorEl.textContent = '';
  } catch (_err) {
    errorEl.textContent = 'Network error';
  }
}

async function checkAlreadySubmitted() {
  const name = document.getElementById('studentName')?.value.trim() || '';
  const studentId = document.getElementById('studentId')?.value || document.getElementById('studentIdInput')?.value || '';
  try {
    const res = await fetch(`${API}/public/exams/${examId}/already-submitted?name=${encodeURIComponent(name)}&student_id=${encodeURIComponent(studentId)}`);
    if (!res.ok) return false;
    const data = await res.json();
    return data.submitted === true;
  } catch (_err) {
    return false;
  }
}

async function proceedToStart() {
  if (!exam.allow_multiple_submissions) {
    const already = await checkAlreadySubmitted();
    if (already) {
      document.getElementById('startError').textContent = 'You have already submitted this exam and cannot take it again.';
      document.getElementById('startBtn').disabled = true;
      return;
    }
  }

  shuffledQuestions = [...exam.questions];
  if (exam.shuffle_questions) {
    for (let i = shuffledQuestions.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledQuestions[i], shuffledQuestions[j]] = [shuffledQuestions[j], shuffledQuestions[i]];
    }
  }

  let html = '';
  shuffledQuestions.forEach((q, idx) => {
    const options = [
      { key: 'A', text: q.option_a },
      { key: 'B', text: q.option_b },
      { key: 'C', text: q.option_c },
      { key: 'D', text: q.option_d }
    ];

    if (exam.shuffle_options) {
      for (let i = options.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [options[i], options[j]] = [options[j], options[i]];
      }
    }

    html += `<div class="question-block">
      <p><strong>${idx + 1}. ${q.text}</strong></p>
      <div class="options">
        ${options
          .map(
            (opt) => `
          <label>
            <input type="radio" name="q_${q.id}" value="${opt.key}">
            ${opt.key}) ${opt.text}
          </label>
        `
          )
          .join('')}
      </div>
    </div>`;
  });

  document.getElementById('questionsContainer').innerHTML = html;
  document.getElementById('startScreen').classList.add('hidden');
  document.getElementById('examScreen').classList.remove('hidden');

  const resumed = await loadResumeState();
  timeLeft = resumed?.remaining_seconds || exam.duration_minutes * 60;
  if (!attemptSessionId) {
    await startAttemptSession();
  }
  updateTimerDisplay();
  timerInterval = setInterval(() => {
    timeLeft -= 1;
    updateTimerDisplay();
    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      submitExam();
    }
  }, 1000);

  attachIntegrityListeners();
  if (autosaveInterval) clearInterval(autosaveInterval);
  autosaveInterval = setInterval(() => {
    autosaveAttempt();
  }, 5000);
}

function updateTimerDisplay() {
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  document.getElementById('timer').textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  if (timeLeft < 60) {
    document.getElementById('timer').style.background = '#f8d7da';
  }
}

async function submitExam() {
  if (timerInterval) clearInterval(timerInterval);
  if (autosaveInterval) clearInterval(autosaveInterval);
  const submitBtn = document.getElementById('submitBtn');
  submitBtn.disabled = true;

  const answers = shuffledQuestions.map((q) => {
    const selected = document.querySelector(`input[name="q_${q.id}"]:checked`);
    return { question_id: q.id, selected_option: selected ? selected.value : null };
  });

  const student_name = document.getElementById('studentName')?.value || null;
  const student_id = document.getElementById('studentId')?.value || document.getElementById('studentIdInput')?.value || null;
  const payload = { exam_id: examId, student_name, student_id, answers, exam_token: examToken };

  try {
    const res = await fetch(`${API}/submissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: examToken ? `Bearer ${examToken}` : undefined },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const err = await res.json();
      document.getElementById('examError').textContent = `Submission failed: ${err.error || 'Unknown error'}`;
      submitBtn.disabled = false;
      return;
    }
    const result = await res.json();
    document.getElementById('examScreen').classList.add('hidden');
    document.getElementById('resultScreen').classList.remove('hidden');
    document.getElementById('resultText').textContent = `Your weighted score: ${result.score.toFixed(1)}% (${result.total_questions} questions)`;
  } catch (_err) {
    document.getElementById('examError').textContent = 'Network error, please try again.';
    submitBtn.disabled = false;
  }
}

function collectAnswers() {
  return shuffledQuestions.map((q) => {
    const selected = document.querySelector(`input[name="q_${q.id}"]:checked`);
    return { question_id: q.id, selected_option: selected ? selected.value : null };
  });
}

async function startAttemptSession() {
  const student_name = document.getElementById('studentName')?.value || null;
  const student_id = document.getElementById('studentId')?.value || document.getElementById('studentIdInput')?.value || null;
  const res = await fetch(`${API}/attempt-sessions/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      exam_id: examId,
      student_name,
      student_id,
      exam_token: examToken,
      remaining_seconds: timeLeft
    })
  });
  if (res.ok) {
    const data = await res.json();
    attemptSessionId = data.attempt_session_id;
  }
}

async function autosaveAttempt() {
  if (!attemptSessionId) return;
  await fetch(`${API}/attempt-sessions/${attemptSessionId}/autosave`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      answers: collectAnswers(),
      remaining_seconds: timeLeft,
      question_order: shuffledQuestions.map((q) => q.id)
    })
  });
}

async function loadResumeState() {
  const student_name = document.getElementById('studentName')?.value || '';
  const student_id = document.getElementById('studentId')?.value || document.getElementById('studentIdInput')?.value || '';
  if (!student_name && !student_id) return null;
  const params = new URLSearchParams({ exam_id: String(examId), student_name, student_id });
  const res = await fetch(`${API}/attempt-sessions/resume?${params.toString()}`);
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.resumable) return null;

  attemptSessionId = data.attempt_session_id;
  if (Array.isArray(data.question_order) && data.question_order.length > 0) {
    const byId = new Map(shuffledQuestions.map((q) => [q.id, q]));
    const ordered = data.question_order.map((id) => byId.get(id)).filter(Boolean);
    if (ordered.length === shuffledQuestions.length) {
      shuffledQuestions = ordered;
    }
  }

  setTimeout(() => {
    const restored = new Map((data.answers || []).map((a) => [a.question_id, a.selected_option]));
    shuffledQuestions.forEach((question) => {
      const selected = restored.get(question.id);
      if (selected) {
        const input = document.querySelector(`input[name="q_${question.id}"][value="${selected}"]`);
        if (input) input.checked = true;
      }
    });
  }, 0);
  return data;
}

function attachIntegrityListeners() {
  if (integrityAttached) return;
  integrityAttached = true;

  const sendEvent = (event_type, payload = {}) => {
    const student_id = document.getElementById('studentId')?.value || document.getElementById('studentIdInput')?.value || null;
    const device_fingerprint = `${navigator.userAgent}|${navigator.language}|${screen.width}x${screen.height}`;
    fetch(`${API}/integrity-events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        attempt_session_id: attemptSessionId,
        exam_id: examId,
        student_id,
        event_type,
        payload,
        device_fingerprint
      })
    });
  };

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) sendEvent('tab_hidden');
  });
  window.addEventListener('blur', () => sendEvent('window_blur'));
  window.addEventListener('offline', () => sendEvent('network_offline'));
  document.addEventListener('copy', () => sendEvent('copy'));
  document.addEventListener('paste', () => sendEvent('paste'));
  window.addEventListener('beforeunload', () => {
    autosaveAttempt();
    sendEvent('page_unload', { remaining_seconds: timeLeft });
  });
}

window.proceedToStart = proceedToStart;
window.authenticatePassword = authenticatePassword;
window.authenticateStudent = authenticateStudent;
window.submitExam = submitExam;

loadExam();
