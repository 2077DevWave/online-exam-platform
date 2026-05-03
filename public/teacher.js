// teacher.js

const API = '/api';
let token = localStorage.getItem('token');
let authMode = 'login';
let selectedExamId = null;

document.addEventListener('DOMContentLoaded', () => {
  // Wire up static buttons
  document.getElementById('loginBtn').addEventListener('click', handleLogin);
  document.getElementById('switchModeBtn').addEventListener('click', toggleAuthMode);
  document.getElementById('logoutBtn').addEventListener('click', logout);
  document.getElementById('createExamBtn').addEventListener('click', createExam);
  document.getElementById('addQuestionBtn').addEventListener('click', addQuestion);
  document.getElementById('copyLinkBtn').addEventListener('click', () => {
    copyToClipboard(document.getElementById('examLinkText').textContent);
  });
  document.getElementById('closeModalBtn').addEventListener('click', closeDetailModal);

  // Close modal when clicking overlay
  const modal = document.getElementById('subDetailModal');
  modal.addEventListener('click', function(e) {
    if (e.target === this) closeDetailModal();
  });

  // Initial auth check
  if (token) {
    showMainPanel();
    loadExams();
  } else {
    showAuth();
  }
});

// ---------- AUTH ----------
function showAuth() {
  document.getElementById('authSection').classList.remove('hidden');
  document.getElementById('mainPanel').classList.add('hidden');
}

function showMainPanel() {
  document.getElementById('authSection').classList.add('hidden');
  document.getElementById('mainPanel').classList.remove('hidden');
  document.getElementById('displayUsername').textContent = localStorage.getItem('username') || 'Teacher';
}

function toggleAuthMode() {
  authMode = authMode === 'login' ? 'register' : 'login';
  document.getElementById('authTitle').textContent = authMode === 'login' ? 'Login' : 'Register';
  document.getElementById('switchModeBtn').textContent = authMode === 'login' ? 'Switch to Register' : 'Switch to Login';
}

async function handleLogin() {
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  const errorEl = document.getElementById('authError');

  if (!username || !password) {
    errorEl.textContent = 'Please fill all fields.';
    return;
  }

  const url = authMode === 'login' ? `${API}/auth/login` : `${API}/auth/register`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();

    if (!res.ok) {
      errorEl.textContent = data.error || 'Authentication failed';
      return;
    }

    if (authMode === 'login') {
      token = data.token;
      localStorage.setItem('token', token);
      localStorage.setItem('username', username);
      showMainPanel();
      loadExams();
      document.getElementById('username').value = '';
      document.getElementById('password').value = '';
    } else {
      // Registration succeeded, switch to login
      authMode = 'login';
      document.getElementById('authTitle').textContent = 'Login';
      document.getElementById('switchModeBtn').textContent = 'Switch to Register';
      errorEl.textContent = 'Registration successful! Please login.';
      errorEl.style.color = 'green';
      document.getElementById('password').value = '';
    }
  } catch (err) {
    errorEl.textContent = 'Network error';
  }
}

function logout() {
  localStorage.clear();
  token = null;
  showAuth();
  selectedExamId = null;
  document.getElementById('questionSection').classList.add('hidden');
}

// ---------- API HELPER ----------
async function authFetch(url, options = {}) {
  if (!token) throw new Error('Not authenticated');
  options.headers = {
    ...options.headers,
    'Authorization': `Bearer ${token}`
  };
  return fetch(url, options);
}

// ---------- EXAMS LIST ----------
async function loadExams() {
  try {
    const res = await authFetch(`${API}/exams`);
    if (res.status === 401) { logout(); return; }
    const exams = await res.json();
    const list = document.getElementById('examList');
    list.innerHTML = '';

    if (exams.length === 0) {
      document.getElementById('noExams').classList.remove('hidden');
    } else {
      document.getElementById('noExams').classList.add('hidden');
      exams.forEach(exam => {
        const li = document.createElement('li');
        li.className = 'exam-item';
        li.innerHTML = `
          <div id="exam-${exam.id}">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <div>
                <strong>${exam.title}</strong>
                <span class="badge">${exam.duration_minutes} min</span>
                ${exam.require_name ? '👤' : ''}${exam.require_student_id ? '🪪' : ''}
                ${!exam.allow_multiple_submissions ? ' 🔓single' : ''}
                ${exam.shuffle_questions ? ' 🔀Q' : ''}${exam.shuffle_options ? ' 🔀A' : ''}
                <span class="badge">${exam.status}</span>
                ${exam.password ? ' 🔑' : ''}
                <div class="link-box" style="margin-top:6px;">
                  <span>/exam/${exam.id}</span>
                  <button class="copy-btn" data-exam-id="${exam.id}">📋</button>
                </div>
              </div>
              <div class="actions">
                <button class="btn-outline btn-sm edit-btn" data-exam-id="${exam.id}">✏️ Edit</button>
                <button class="btn-outline btn-sm submissions-btn" data-exam-id="${exam.id}">📊 Submissions</button>
                <button class="btn-outline btn-sm students-btn" data-exam-id="${exam.id}">👥 Students</button>
                <button class="btn-primary btn-sm manage-questions-btn" data-exam-id="${exam.id}">Manage Questions</button>
                <button class="btn-danger btn-sm delete-exam-btn" data-exam-id="${exam.id}">Delete</button>
              </div>
            </div>
            <div id="submissions-${exam.id}" class="collapse-area hidden"></div>
            <div id="students-${exam.id}" class="collapse-area hidden" style="margin-top:12px; padding:12px; background:#f0f5ff; border-radius:8px;">
              <h4>Allowed Students</h4>
              <div style="display:flex; gap:8px; margin-bottom:12px;">
                <input type="text" id="newStudentId-${exam.id}" placeholder="Student ID" style="flex:1">
                <input type="password" id="newStudentPass-${exam.id}" placeholder="Password" style="flex:1">
                <button class="btn-success btn-sm add-student-btn" data-exam-id="${exam.id}">Add</button>
              </div>
              <ul id="studentList-${exam.id}" class="student-list"></ul>
            </div>
            <div id="edit-${exam.id}" class="collapse-area hidden" style="margin-top:12px; padding:12px; background:#f0f5ff; border-radius:8px;">
              <div class="row">
                <div><label>Title</label><input type="text" id="editTitle-${exam.id}" value="${exam.title}"></div>
                <div><label>Duration</label><input type="number" id="editDuration-${exam.id}" value="${exam.duration_minutes}"></div>
              </div>
              <div class="row">
                <div><label><input type="checkbox" id="editReqName-${exam.id}" ${exam.require_name ? 'checked' : ''}> Name required</label></div>
                <div><label><input type="checkbox" id="editReqId-${exam.id}" ${exam.require_student_id ? 'checked' : ''}> ID required</label></div>
                <div><label><input type="checkbox" id="editAllowMulti-${exam.id}" ${exam.allow_multiple_submissions ? 'checked' : ''}> Multiple</label></div>
                <div><label><input type="checkbox" id="editShuffleQ-${exam.id}" ${exam.shuffle_questions ? 'checked' : ''}> Shuffle Q</label></div>
                <div><label><input type="checkbox" id="editShuffleO-${exam.id}" ${exam.shuffle_options ? 'checked' : ''}> Shuffle Opt.</label></div>
              </div>
              <div class="row">
                <div>
                  <label>Status</label>
                  <select id="editStatus-${exam.id}">
                    <option value="published" ${exam.status === 'published' ? 'selected' : ''}>Published</option>
                    <option value="draft" ${exam.status === 'draft' ? 'selected' : ''}>Draft</option>
                  </select>
                </div>
                <div><label>Password (blank to keep)</label><input type="text" id="editPassword-${exam.id}" placeholder="New password"></div>
              </div>
              <button class="btn-success btn-sm save-edit-btn" data-exam-id="${exam.id}">Save</button>
              <button class="btn-sm cancel-edit-btn" data-exam-id="${exam.id}">Cancel</button>
            </div>
          </div>
        `;

        // Attach event listeners for this exam's buttons
        li.querySelector('.copy-btn').addEventListener('click', () => copyToClipboard(`${window.location.origin}/exam/${exam.id}`));
        li.querySelector('.edit-btn').addEventListener('click', () => toggleEdit(exam.id));
        li.querySelector('.submissions-btn').addEventListener('click', () => toggleSubmissions(exam.id));
        li.querySelector('.students-btn').addEventListener('click', () => toggleStudents(exam.id));
        li.querySelector('.manage-questions-btn').addEventListener('click', () => selectExam(exam.id));
        li.querySelector('.delete-exam-btn').addEventListener('click', () => deleteExam(exam.id));
        li.querySelector('.add-student-btn').addEventListener('click', () => addStudent(exam.id));
        li.querySelector('.save-edit-btn').addEventListener('click', () => saveEdit(exam.id));
        li.querySelector('.cancel-edit-btn').addEventListener('click', () => toggleEdit(exam.id));

        list.appendChild(li);
      });
    }
  } catch (err) {
    console.error(err);
  }
}

// ---------- EDIT EXAM ----------
function toggleEdit(id) {
  document.getElementById(`edit-${id}`).classList.toggle('hidden');
}

async function saveEdit(id) {
  const title = document.getElementById(`editTitle-${id}`).value.trim();
  const duration = parseInt(document.getElementById(`editDuration-${id}`).value);
  const require_name = document.getElementById(`editReqName-${id}`).checked;
  const require_student_id = document.getElementById(`editReqId-${id}`).checked;
  const allow_multiple_submissions = document.getElementById(`editAllowMulti-${id}`).checked;
  const shuffle_questions = document.getElementById(`editShuffleQ-${id}`).checked;
  const shuffle_options = document.getElementById(`editShuffleO-${id}`).checked;
  const status = document.getElementById(`editStatus-${id}`).value;
  const password = document.getElementById(`editPassword-${id}`).value;

  if (!title || isNaN(duration)) return alert('Title and duration are required.');
  try {
    const res = await authFetch(`${API}/exams/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        duration_minutes: duration,
        require_name,
        require_student_id,
        allow_multiple_submissions,
        shuffle_questions,
        shuffle_options,
        status,
        password: password || undefined
      })
    });
    if (res.ok) {
      loadExams();
      if (selectedExamId === id) selectExam(id);
    } else if (res.status === 401) logout();
  } catch (err) {
    alert('Network error');
  }
}

// ---------- SUBMISSIONS ----------
async function toggleSubmissions(examId) {
  const container = document.getElementById(`submissions-${examId}`);
  if (container.classList.contains('hidden')) {
    try {
      const res = await authFetch(`${API}/exams/${examId}/submissions`);
      if (!res.ok) {
        container.innerHTML = '<p class="error">Failed to load submissions</p>';
      } else {
        const subs = await res.json();
        if (subs.length === 0) {
          container.innerHTML = '<p>No submissions yet.</p>';
        } else {
          let html = '<ul class="submission-list">';
          subs.forEach(sub => {
            html += `<li class="submission-item">
              <div>
                <strong>${sub.student_name || 'Anonymous'}</strong>
                ${sub.student_id ? `(${sub.student_id})` : ''}
                <br><small>${new Date(sub.finished_at).toLocaleString()}</small>
              </div>
              <div>
                <span class="badge">${sub.score.toFixed(1)}%</span>
                <button class="btn-sm btn-outline detail-btn" data-sub-id="${sub.id}">Details</button>
              </div>
            </li>`;
          });
          html += '</ul>';
          container.innerHTML = html;
          // Attach detail buttons
          container.querySelectorAll('.detail-btn').forEach(btn => {
            btn.addEventListener('click', () => viewDetails(parseInt(btn.dataset.subId)));
          });
        }
      }
    } catch (err) {
      container.innerHTML = '<p class="error">Network error</p>';
    }
    container.classList.remove('hidden');
  } else {
    container.classList.add('hidden');
  }
}

async function viewDetails(subId) {
  try {
    const res = await authFetch(`${API}/submissions/${subId}`);
    if (!res.ok) { alert('Failed to load details'); return; }
    const sub = await res.json();
    document.getElementById('detailStudent').textContent = `${sub.student_name || 'Anonymous'} (${sub.student_id || ''})`;
    document.getElementById('detailScore').textContent = `${sub.score.toFixed(1)}% (${Math.round(sub.score * sub.total_questions / 100)}/${sub.total_questions})`;
    const tbody = document.getElementById('detailAnswers');
    tbody.innerHTML = '';
    sub.answers.forEach((ans, idx) => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${idx + 1}</td>
        <td>${ans.text}<br>
          <small>A: ${ans.option_a} | B: ${ans.option_b} | C: ${ans.option_c} | D: ${ans.option_d}</small>
        </td>
        <td class="${ans.is_correct ? 'correct-answer' : 'wrong-answer'}">${ans.selected_option || '—'}</td>
        <td>${ans.correct_option}</td>
        <td class="${ans.is_correct ? 'correct-answer' : 'wrong-answer'}">${ans.is_correct ? '✅' : '❌'}</td>
      `;
      tbody.appendChild(row);
    });
    document.getElementById('subDetailModal').classList.remove('hidden');
  } catch (err) {
    console.error(err);
  }
}

function closeDetailModal() {
  document.getElementById('subDetailModal').classList.add('hidden');
}

// ---------- STUDENTS ----------
async function toggleStudents(examId) {
  const container = document.getElementById(`students-${examId}`);
  if (container.classList.contains('hidden')) {
    await loadStudents(examId);
    container.classList.remove('hidden');
  } else {
    container.classList.add('hidden');
  }
}

async function loadStudents(examId) {
  try {
    const res = await authFetch(`${API}/exams/${examId}/students`);
    if (!res.ok) return;
    const students = await res.json();
    const list = document.getElementById(`studentList-${examId}`);
    list.innerHTML = '';
    students.forEach(s => {
      const li = document.createElement('li');
      li.className = 'student-item';
      li.innerHTML = `<span>${s.student_id}</span>
        <button class="btn-danger btn-sm remove-student-btn" data-exam-id="${examId}" data-student-id="${s.student_id}">Remove</button>`;
      li.querySelector('.remove-student-btn').addEventListener('click', () => removeStudent(examId, s.student_id));
      list.appendChild(li);
    });
  } catch (err) {
    console.error(err);
  }
}

async function addStudent(examId) {
  const student_id = document.getElementById(`newStudentId-${examId}`).value.trim();
  const password = document.getElementById(`newStudentPass-${examId}`).value;
  if (!student_id || !password) return alert('Please provide both student ID and password.');
  try {
    const res = await authFetch(`${API}/exams/${examId}/students`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_id, password })
    });
    if (res.ok) {
      document.getElementById(`newStudentId-${examId}`).value = '';
      document.getElementById(`newStudentPass-${examId}`).value = '';
      loadStudents(examId);
    } else {
      const data = await res.json();
      alert(data.error || 'Failed to add student');
    }
  } catch (err) {
    alert('Network error');
  }
}

async function removeStudent(examId, studentId) {
  if (!confirm(`Remove student ${studentId}?`)) return;
  try {
    await authFetch(`${API}/exams/${examId}/students/${encodeURIComponent(studentId)}`, { method: 'DELETE' });
    loadStudents(examId);
  } catch (err) {
    alert('Network error');
  }
}

// ---------- QUESTIONS ----------
async function selectExam(id) {
  selectedExamId = id;
  document.getElementById('questionSection').classList.remove('hidden');
  try {
    const res = await authFetch(`${API}/exams/${id}`);
    const exam = await res.json();
    document.getElementById('selectedExamTitle').textContent = exam.title;
    document.getElementById('examLinkText').textContent = `${window.location.origin}/exam/${exam.id}`;
    const qList = document.getElementById('questionList');
    qList.innerHTML = '';
    exam.questions.forEach(q => {
      const li = document.createElement('li');
      li.className = 'question-item';
      li.innerHTML = `
        <div style="display:flex; justify-content:space-between;">
          <div>
            <strong>${q.text}</strong><br>
            <small>A: ${q.option_a} | B: ${q.option_b} | C: ${q.option_c} | D: ${q.option_d}</small>
            <span class="badge">Correct: ${q.correct_option}</span>
          </div>
          <button class="btn-danger btn-sm delete-question-btn" data-q-id="${q.id}">Delete</button>
        </div>
      `;
      li.querySelector('.delete-question-btn').addEventListener('click', () => deleteQuestion(q.id));
      qList.appendChild(li);
    });
  } catch (err) {
    console.error(err);
  }
}

async function deleteExam(id) {
  if (!confirm('Delete this exam and all its questions/submissions?')) return;
  try {
    await authFetch(`${API}/exams/${id}`, { method: 'DELETE' });
    if (selectedExamId === id) {
      selectedExamId = null;
      document.getElementById('questionSection').classList.add('hidden');
    }
    loadExams();
  } catch (err) {
    console.error(err);
  }
}

async function deleteQuestion(qId) {
  if (!confirm('Delete this question?')) return;
  try {
    await authFetch(`${API}/questions/${qId}`, { method: 'DELETE' });
    if (selectedExamId) selectExam(selectedExamId);
  } catch (err) {
    console.error(err);
  }
}

async function addQuestion() {
  if (!selectedExamId) return;
  const text = document.getElementById('qText').value.trim();
  const option_a = document.getElementById('optA').value.trim();
  const option_b = document.getElementById('optB').value.trim();
  const option_c = document.getElementById('optC').value.trim();
  const option_d = document.getElementById('optD').value.trim();
  const correct = document.getElementById('correctOption').value;
  const msg = document.getElementById('qMsg');

  if (!text || !option_a || !option_b || !option_c || !option_d) {
    msg.textContent = '❌ All fields are required.';
    msg.style.color = 'red';
    return;
  }
  try {
    const res = await authFetch(`${API}/exams/${selectedExamId}/questions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, option_a, option_b, option_c, option_d, correct_option: correct })
    });
    if (res.ok) {
      msg.textContent = '✅ Question added!';
      msg.style.color = 'green';
      document.getElementById('qText').value = '';
      document.getElementById('optA').value = '';
      document.getElementById('optB').value = '';
      document.getElementById('optC').value = '';
      document.getElementById('optD').value = '';
      selectExam(selectedExamId);
    } else {
      const err = await res.json();
      msg.textContent = '❌ ' + (err.error || 'Failed');
      msg.style.color = 'red';
    }
  } catch (err) {
    msg.textContent = '❌ Network error';
    msg.style.color = 'red';
  }
}

// ---------- CREATE EXAM ----------
async function createExam() {
  const title = document.getElementById('examTitle').value.trim();
  const duration = parseInt(document.getElementById('examDuration').value);
  const require_name = document.getElementById('requireName').checked;
  const require_student_id = document.getElementById('requireId').checked;
  const allow_multiple_submissions = document.getElementById('allowMultiple').checked;
  const shuffle_questions = document.getElementById('shuffleQuestions').checked;
  const shuffle_options = document.getElementById('shuffleOptions').checked;
  const status = document.getElementById('examStatus').value;
  const password = document.getElementById('examPassword').value || undefined;
  const msg = document.getElementById('createMsg');

  if (!title || isNaN(duration)) {
    msg.textContent = '❌ Title and duration are required.';
    msg.style.color = 'red';
    return;
  }

  try {
    const res = await authFetch(`${API}/exams`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        duration_minutes: duration,
        require_name,
        require_student_id,
        allow_multiple_submissions,
        shuffle_questions,
        shuffle_options,
        status,
        password
      })
    });
    if (res.ok) {
      msg.textContent = '✅ Exam created!';
      msg.style.color = 'green';
      document.getElementById('examTitle').value = '';
      document.getElementById('examDuration').value = 30;
      loadExams();
    } else {
      const err = await res.json();
      msg.textContent = '❌ ' + (err.error || 'Failed');
      msg.style.color = 'red';
    }
  } catch (err) {
    msg.textContent = '❌ Network error';
    msg.style.color = 'red';
  }
}

// ---------- HELPER ----------
function copyToClipboard(text) {
  navigator.clipboard.writeText(text)
    .then(() => alert('Link copied!'))
    .catch(() => alert('Failed to copy'));
}