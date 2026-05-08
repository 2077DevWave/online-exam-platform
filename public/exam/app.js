const API = '/api';
const pathParts = window.location.pathname.split('/');
const examId = parseInt(pathParts[pathParts.length - 1], 10);

if (!examId || Number.isNaN(examId)) {
  const el = document.getElementById('startScreen');
  if (el) el.innerHTML = '<h2>Invalid exam link</h2>';
}

let exam = null;
let examToken = null;
let timerInterval = null;
let timeLeft = 0;
let shuffledQuestions = [];
let attemptSessionId = null;
let autosaveInterval = null;
let integrityAttached = false;
let currentQuestionIndex = 0;

// ---------- LOAD EXAM ----------
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
    document.getElementById('examMeta').textContent = `${exam.questions.length} questions · ${exam.duration_minutes} min`;

    const authDiv = document.getElementById('authSection');
    authDiv.innerHTML = '';

    if (exam.has_password || exam.require_student_auth) {
      if (exam.has_password && !exam.require_student_auth) {
        authDiv.innerHTML = `
          <div class="info">This exam is password-protected.</div>
          <div class="form-group">
            <label for="examPassword">Exam Password</label>
            <input type="password" id="examPassword" placeholder="Enter exam password" aria-label="Exam password">
          </div>
          <button class="btn btn-primary btn-block" onclick="authenticatePassword()">Verify Password</button>
          <p id="passwordError" class="error"></p>
        `;
      } else if (exam.require_student_auth) {
        authDiv.innerHTML = `
          <div class="info">Please login with your student credentials.</div>
          <div class="form-group">
            <label for="studentIdInput">Student ID</label>
            <input type="text" id="studentIdInput" placeholder="Student ID" aria-label="Student ID">
          </div>
          <div class="form-group">
            <label for="studentPasswordInput">Password</label>
            <input type="password" id="studentPasswordInput" placeholder="Password" aria-label="Student password">
          </div>
          <button class="btn btn-primary btn-block" onclick="authenticateStudent()">Login</button>
          <p id="studentLoginError" class="error"></p>
        `;
      }
    } else {
      if (exam.require_name) {
        authDiv.innerHTML += `
          <div class="form-group">
            <label for="studentName">Your Name</label>
            <input type="text" id="studentName" placeholder="Enter your name" aria-label="Your name">
          </div>
        `;
      }
      if (exam.require_student_id) {
        authDiv.innerHTML += `
          <div class="form-group">
            <label for="studentId">Student ID</label>
            <input type="text" id="studentId" placeholder="Enter your student ID" aria-label="Student ID">
          </div>
        `;
      }
      document.getElementById('startBtn').disabled = false;
    }
  } catch (_err) {
    document.getElementById('startScreen').innerHTML = '<h2>Error loading exam</h2>';
  }
}

// ---------- AUTH ----------
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
      authDiv.innerHTML += '<div class="form-group"><label for="studentName">Your Name</label><input type="text" id="studentName" placeholder="Enter your name" aria-label="Your name"></div>';
    }
    if (exam.require_student_id) {
      authDiv.innerHTML += '<div class="form-group"><label for="studentId">Student ID</label><input type="text" id="studentId" placeholder="Enter your student ID" aria-label="Student ID"></div>';
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
      authDiv.innerHTML += '<div class="form-group"><label for="studentName">Your Name</label><input type="text" id="studentName" placeholder="Enter your name" aria-label="Your name"></div>';
    }
    document.getElementById('startBtn').disabled = false;
    errorEl.textContent = '';
  } catch (_err) {
    errorEl.textContent = 'Network error';
  }
}

// ---------- CHECK ALREADY SUBMITTED ----------
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

// ---------- PROCEED TO START ----------
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

  currentQuestionIndex = 0;
  renderQuestionNav();
  renderAllQuestions();
  showQuestion(0);

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

  updateProgress();
}

// ---------- RENDER QUESTION NAVIGATION ----------
function renderQuestionNav() {
  const nav = document.getElementById('questionNav');
  nav.innerHTML = '';
  shuffledQuestions.forEach((q, idx) => {
    const btn = document.createElement('button');
    btn.className = 'q-nav-btn';
    btn.textContent = idx + 1;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-label', `Question ${idx + 1}`);
    btn.setAttribute('aria-selected', 'false');
    btn.onclick = () => showQuestion(idx);
    btn.id = `navBtn${idx}`;
    nav.appendChild(btn);
  });
}

// ---------- RENDER ALL QUESTIONS ----------
function renderAllQuestions() {
  const container = document.getElementById('questionsContainer');
  let html = '';
  shuffledQuestions.forEach((q, idx) => {
    let options = [
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

    html += `<div class="question-block hidden" id="questionBlock${idx}" role="tabpanel" aria-labelledby="navBtn${idx}">
      <span class="question-number">Question ${idx + 1} of ${shuffledQuestions.length}</span>
      <p class="question-text">${q.text}</p>
      <div class="options">
        ${options
          .map(
            (opt) => `
          <label class="option-item" id="optLabel_${q.id}_${opt.key}" data-question="${q.id}" data-option="${opt.key}">
            <input type="radio" name="q_${q.id}" value="${opt.key}" aria-label="Option ${opt.key}: ${opt.text}" onchange="onOptionChange(${q.id})">
            <span class="option-radio"></span>
            <span class="option-key">${opt.key}</span>
            <span class="option-text">${opt.text}</span>
          </label>
        `
          )
          .join('')}
      </div>
    </div>`;
  });
  container.innerHTML = html;

  // Add click handlers for option items (the styled label)
  container.querySelectorAll('.option-item').forEach((item) => {
    item.addEventListener('click', function(e) {
      const radio = this.querySelector('input[type="radio"]');
      if (radio) {
        radio.checked = true;
        // Remove selected from siblings
        const parent = this.parentElement;
        parent.querySelectorAll('.option-item').forEach((sib) => sib.classList.remove('selected'));
        this.classList.add('selected');
        const qId = parseInt(this.dataset.question, 10);
        onOptionChange(qId);
      }
    });
  });
}

// ---------- SHOW QUESTION ----------
function showQuestion(index) {
  if (index < 0 || index >= shuffledQuestions.length) return;

  // Hide current
  const oldBlock = document.getElementById(`questionBlock${currentQuestionIndex}`);
  if (oldBlock) oldBlock.classList.add('hidden');

  // Update nav buttons
  const oldNavBtn = document.getElementById(`navBtn${currentQuestionIndex}`);
  if (oldNavBtn) {
    oldNavBtn.classList.remove('current');
    oldNavBtn.setAttribute('aria-selected', 'false');
  }

  currentQuestionIndex = index;

  const newBlock = document.getElementById(`questionBlock${currentQuestionIndex}`);
  if (newBlock) {
    newBlock.classList.remove('hidden');
    newBlock.classList.add('active-question');
  }

  const newNavBtn = document.getElementById(`navBtn${currentQuestionIndex}`);
  if (newNavBtn) {
    newNavBtn.classList.add('current');
    newNavBtn.setAttribute('aria-selected', 'true');
    newNavBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  updateNavButtons();
  updateFooterNav();
}

// ---------- OPTION CHANGE ----------
function onOptionChange(questionId) {
  updateNavButtons();
  updateProgress();
  updateFooterNav();
}

// ---------- UPDATE NAV BUTTON STATES ----------
function updateNavButtons() {
  shuffledQuestions.forEach((q, idx) => {
    const btn = document.getElementById(`navBtn${idx}`);
    if (!btn) return;
    const selected = document.querySelector(`input[name="q_${q.id}"]:checked`);
    if (selected) {
      btn.classList.add('answered');
    } else {
      btn.classList.remove('answered');
    }
  });
}

// ---------- UPDATE PROGRESS ----------
function updateProgress() {
  const total = shuffledQuestions.length;
  let answered = 0;
  shuffledQuestions.forEach((q) => {
    const selected = document.querySelector(`input[name="q_${q.id}"]:checked`);
    if (selected) answered += 1;
  });
  const percent = total > 0 ? Math.round((answered / total) * 100) : 0;

  document.getElementById('progressLabel').textContent = `Questions Answered: ${answered} / ${total}`;
  document.getElementById('progressPercent').textContent = `${percent}%`;
  document.getElementById('progressFill').style.width = `${percent}%`;
}

// ---------- UPDATE FOOTER NAV ----------
function updateFooterNav() {
  document.getElementById('prevBtn').disabled = currentQuestionIndex === 0;
  document.getElementById('nextBtn').disabled = currentQuestionIndex === shuffledQuestions.length - 1;
  document.getElementById('questionCounter').textContent = `${currentQuestionIndex + 1} / ${shuffledQuestions.length}`;
}

// ---------- NAVIGATE QUESTION ----------
function navigateQuestion(delta) {
  const newIdx = currentQuestionIndex + delta;
  if (newIdx >= 0 && newIdx < shuffledQuestions.length) {
    showQuestion(newIdx);
  }
}

// ---------- KEYBOARD SHORTCUTS ----------
document.addEventListener('keydown', (e) => {
  // Only active during exam
  const examScreen = document.getElementById('examScreen');
  if (!examScreen || examScreen.classList.contains('hidden')) return;
  // Don't intercept when typing in inputs
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

  switch (e.key) {
    case 'ArrowLeft':
      e.preventDefault();
      navigateQuestion(-1);
      break;
    case 'ArrowRight':
      e.preventDefault();
      navigateQuestion(1);
      break;
    case '1': case '2': case '3': case '4':
      e.preventDefault();
      selectOptionByKey(currentQuestionIndex, e.key.toUpperCase());
      break;
    case 'a': case 'b': case 'c': case 'd':
      e.preventDefault();
      selectOptionByKey(currentQuestionIndex, e.key.toUpperCase());
      break;
    default:
      break;
  }
});

function selectOptionByKey(questionIdx, optionKey) {
  if (questionIdx < 0 || questionIdx >= shuffledQuestions.length) return;
  const q = shuffledQuestions[questionIdx];
  const radio = document.querySelector(`input[name="q_${q.id}"][value="${optionKey}"]`);
  if (radio) {
    radio.checked = true;
    const parent = radio.closest('.options');
    if (parent) {
      parent.querySelectorAll('.option-item').forEach((sib) => sib.classList.remove('selected'));
    }
    const label = document.getElementById(`optLabel_${q.id}_${optionKey}`);
    if (label) label.classList.add('selected');
    onOptionChange(q.id);
  }
}

// ---------- TIMER DISPLAY ----------
function updateTimerDisplay() {
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const display = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  document.getElementById('timerValue').textContent = display;

  const timerEl = document.getElementById('timer');
  timerEl.classList.remove('timer-normal', 'timer-warning', 'timer-danger');

  if (timeLeft <= 60) {
    timerEl.classList.add('timer-danger');
  } else if (timeLeft <= 300) {
    timerEl.classList.add('timer-warning');
  } else {
    timerEl.classList.add('timer-normal');
  }
}

// ---------- SUBMIT CONFIRMATION MODAL ----------
function showSubmitConfirm() {
  const total = shuffledQuestions.length;
  let answered = 0;
  shuffledQuestions.forEach((q) => {
    const selected = document.querySelector(`input[name="q_${q.id}"]:checked`);
    if (selected) answered += 1;
  });
  const unanswered = total - answered;

  const badge = document.getElementById('unansweredBadge');
  if (unanswered > 0) {
    badge.classList.remove('hidden');
    badge.textContent = `⚠️ ${unanswered} question${unanswered !== 1 ? 's' : ''} unanswered`;
  } else {
    badge.classList.add('hidden');
  }

  document.getElementById('submitModal').classList.remove('hidden');
}

function hideSubmitConfirm() {
  document.getElementById('submitModal').classList.add('hidden');
}

// ---------- SUBMIT EXAM ----------
async function submitExam() {
  if (timerInterval) clearInterval(timerInterval);
  if (autosaveInterval) clearInterval(autosaveInterval);
  hideSubmitConfirm();

  const submitBtn = document.getElementById('submitBtn');
  const confirmSubmitBtn = document.getElementById('confirmSubmitBtn');
  submitBtn.disabled = true;
  if (confirmSubmitBtn) confirmSubmitBtn.disabled = true;

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
      headers: {
        'Content-Type': 'application/json',
        ...(examToken ? { Authorization: `Bearer ${examToken}` } : {})
      },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const err = await res.json();
      document.getElementById('examError').textContent = `Submission failed: ${err.error || 'Unknown error'}`;
      submitBtn.disabled = false;
      if (confirmSubmitBtn) confirmSubmitBtn.disabled = false;
      return;
    }
    const result = await res.json();

    document.getElementById('examScreen').classList.add('hidden');
    document.getElementById('resultScreen').classList.remove('hidden');

    const score = result.score.toFixed(1);
    document.getElementById('scoreValue').textContent = `${score}%`;
    document.getElementById('resultText').textContent = `${result.total_questions} questions · Weighted score`;
  } catch (_err) {
    document.getElementById('examError').textContent = 'Network error, please try again.';
    submitBtn.disabled = false;
    if (confirmSubmitBtn) confirmSubmitBtn.disabled = false;
  }
}

// ---------- HELPERS ----------
function collectAnswers() {
  return shuffledQuestions.map((q) => {
    const selected = document.querySelector(`input[name="q_${q.id}"]:checked`);
    return { question_id: q.id, selected_option: selected ? selected.value : null };
  });
}

// ---------- ATTEMPT SESSION ----------
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
  const params = new URLParams({ exam_id: String(examId), student_name, student_id });
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
      renderQuestionNav();
      renderAllQuestions();
      showQuestion(0);
    }
  }

  setTimeout(() => {
    const restored = new Map((data.answers || []).map((a) => [a.question_id, a.selected_option]));
    shuffledQuestions.forEach((question) => {
      const selected = restored.get(question.id);
      if (selected) {
        const radio = document.querySelector(`input[name="q_${question.id}"][value="${selected}"]`);
        if (radio) {
          radio.checked = true;
          const label = document.getElementById(`optLabel_${question.id}_${selected}`);
          if (label) label.classList.add('selected');
        }
      }
    });
    updateNavButtons();
    updateProgress();
  }, 100);
  return data;
}

// ---------- INTEGRITY ----------
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

// ---------- EXPOSE TO GLOBAL SCOPE ----------
window.proceedToStart = proceedToStart;
window.authenticatePassword = authenticatePassword;
window.authenticateStudent = authenticateStudent;
window.submitExam = submitExam;
window.showSubmitConfirm = showSubmitConfirm;
window.hideSubmitConfirm = hideSubmitConfirm;
window.navigateQuestion = navigateQuestion;
window.onOptionChange = onOptionChange;

loadExam();