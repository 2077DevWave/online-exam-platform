import { teacherState, setToken, setSelectedExamId } from './teacher/state.js';
import { authFetch, getApiBase } from './teacher/api.js';

const API = getApiBase();

document.addEventListener('DOMContentLoaded', () => {
  // Auth
  document.getElementById('loginBtn').addEventListener('click', handleLogin);
  document.getElementById('switchModeBtn').addEventListener('click', toggleAuthMode);
  document.getElementById('logoutBtn').addEventListener('click', logout);
  document.getElementById('createExamBtn').addEventListener('click', createExam);
  document.getElementById('addQuestionBtn').addEventListener('click', addQuestion);
  document.getElementById('copyLinkBtn').addEventListener('click', () => {
    copyToClipboard(document.getElementById('examLinkText').textContent);
  });
  document.getElementById('closeModalBtn').addEventListener('click', closeDetailModal);
  document.getElementById('subDetailModal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeDetailModal();
  });

  // Change password modal
  document.getElementById('changePasswordBtn').addEventListener('click', () => {
    document.getElementById('changePasswordModal').classList.remove('hidden');
  });
  document.getElementById('closeChangePwdBtn').addEventListener('click', () => {
    document.getElementById('changePasswordModal').classList.add('hidden');
  });
  document.getElementById('changePasswordModal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) document.getElementById('changePasswordModal').classList.add('hidden');
  });
  document.getElementById('changePwdBtn').addEventListener('click', changePassword);

  if (teacherState.token) {
    showMainPanel();
    loadExams();
    loadQuestionBank();
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
  teacherState.authMode = teacherState.authMode === 'login' ? 'register' : 'login';
  document.getElementById('authTitle').textContent = teacherState.authMode === 'login' ? 'Login' : 'Register';
  document.getElementById('switchModeBtn').textContent = teacherState.authMode === 'login' ? 'Switch to Register' : 'Switch to Login';
}

async function handleLogin() {
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  const errorEl = document.getElementById('authError');
  if (!username || !password) { errorEl.textContent = 'Please fill all fields.'; return; }
  const url = teacherState.authMode === 'login' ? `${API}/auth/login` : `${API}/auth/register`;
  try {
    const res = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) { errorEl.textContent = data.error || 'Auth failed'; return; }
    if (teacherState.authMode === 'login') {
      setToken(data.token);
      localStorage.setItem('username', username);
      showMainPanel();
      loadExams();
      loadQuestionBank();
      document.getElementById('username').value = '';
      document.getElementById('password').value = '';
    } else {
      teacherState.authMode = 'login';
      document.getElementById('authTitle').textContent = 'Login';
      document.getElementById('switchModeBtn').textContent = 'Switch to Register';
      errorEl.textContent = 'Registration successful! Please login.';
      errorEl.style.color = 'green';
      document.getElementById('password').value = '';
    }
  } catch (err) { errorEl.textContent = 'Network error'; }
}

async function changePassword() {
  const currentPassword = document.getElementById('currentPassword').value;
  const newPassword = document.getElementById('newPassword').value;
  const confirmPassword = document.getElementById('confirmPassword').value;
  const errorEl = document.getElementById('changePwdError');
  if (!currentPassword || !newPassword || !confirmPassword) {
    errorEl.textContent = 'All fields required.';
    return;
  }
  if (newPassword !== confirmPassword) {
    errorEl.textContent = 'New passwords do not match.';
    return;
  }
  try {
    const res = await authFetch(`${API}/auth/change-password`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword })
    });
    const data = await res.json();
    if (res.ok) {
      document.getElementById('changePasswordModal').classList.add('hidden');
      alert('Password changed successfully');
    } else {
      errorEl.textContent = data.error || 'Error';
    }
  } catch (err) { errorEl.textContent = 'Network error'; }
}

function logout() {
  localStorage.clear();
  setToken(null);
  showAuth();
  setSelectedExamId(null);
  document.getElementById('questionSection').classList.add('hidden');
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
                <button class="btn-primary btn-sm manage-btn" data-exam-id="${exam.id}">📝 Questions</button>
                <button class="btn-danger btn-sm delete-btn" data-exam-id="${exam.id}">Delete</button>
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
                <div><label><input type="checkbox" id="editReqName-${exam.id}" ${exam.require_name ? 'checked' : ''}> Name</label></div>
                <div><label><input type="checkbox" id="editReqId-${exam.id}" ${exam.require_student_id ? 'checked' : ''}> ID</label></div>
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
                <div><label>Password</label><input type="text" id="editPassword-${exam.id}" placeholder="Leave empty to keep"></div>
              </div>
              <div class="row">
                <div><label>Available From</label><input type="datetime-local" id="editStartTime-${exam.id}" value="${exam.start_time || ''}"></div>
                <div><label>Available Until</label><input type="datetime-local" id="editEndTime-${exam.id}" value="${exam.end_time || ''}"></div>
              </div>
              <button class="btn-success btn-sm save-edit-btn" data-exam-id="${exam.id}">Save</button>
              <button class="btn-sm cancel-edit-btn" data-exam-id="${exam.id}">Cancel</button>
            </div>
          </div>
        `;
        // Bind events
        li.querySelector('.copy-btn').addEventListener('click', () => copyToClipboard(`${window.location.origin}/exam/${exam.id}`));
        li.querySelector('.edit-btn').addEventListener('click', () => toggleEdit(exam.id));
        li.querySelector('.submissions-btn').addEventListener('click', () => toggleSubmissions(exam.id));
        li.querySelector('.students-btn').addEventListener('click', () => toggleStudents(exam.id));
        li.querySelector('.manage-btn').addEventListener('click', () => selectExam(exam.id));
        li.querySelector('.delete-btn').addEventListener('click', () => deleteExam(exam.id));
        li.querySelector('.add-student-btn').addEventListener('click', () => addStudent(exam.id));
        li.querySelector('.save-edit-btn').addEventListener('click', () => saveEdit(exam.id));
        li.querySelector('.cancel-edit-btn').addEventListener('click', () => toggleEdit(exam.id));
        list.appendChild(li);
      });
    }
  } catch (err) { console.error(err); }
}

function toggleEdit(id) { document.getElementById(`edit-${id}`).classList.toggle('hidden'); }

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
  const start_time = document.getElementById(`editStartTime-${id}`).value;
  const end_time = document.getElementById(`editEndTime-${id}`).value;
  if (!title || isNaN(duration)) return alert('Title and duration required.');
  try {
    const res = await authFetch(`${API}/exams/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title, duration_minutes: duration,
        require_name, require_student_id,
        allow_multiple_submissions,
        shuffle_questions, shuffle_options,
        status,
        password: password || undefined,
        start_time: start_time || undefined,
        end_time: end_time || undefined
      })
    });
    if (res.ok) {
      loadExams();
      if (teacherState.selectedExamId === id) selectExam(id);
    } else if (res.status === 401) logout();
  } catch (err) { alert('Network error'); }
}

// ---------- SUBMISSIONS & EXPORT ----------
async function toggleSubmissions(examId) {
  const container = document.getElementById(`submissions-${examId}`);
  if (container.classList.contains('hidden')) {
    try {
      const res = await authFetch(`${API}/exams/${examId}/submissions`);
      if (!res.ok) { container.innerHTML = '<p class="error">Failed to load</p>'; }
      else {
        const subs = await res.json();
        if (subs.length === 0) {
          container.innerHTML = `
            <div style="display:flex; gap:8px; align-items:center; margin-bottom:8px;">
              <button class="btn-sm btn-outline" id="rescore-${examId}">🔁 Rescore Submissions</button>
              <small>Use after editing question answers.</small>
            </div>
            <p>No submissions yet.</p>
          `;
          document.getElementById(`rescore-${examId}`).addEventListener('click', () => rescoreSubmissions(examId));
        } else {
          let html = `
            <div style="display:flex; gap:8px; align-items:center; margin-bottom:8px;">
              <button class="btn-sm btn-primary" id="exportCSV-${examId}">📥 Export CSV</button>
              <button class="btn-sm btn-outline" id="rescore-${examId}">🔁 Rescore Submissions</button>
            </div>
            <ul class="submission-list">
          `;
          subs.forEach(sub => {
            html += `<li class="submission-item">
              <div>
                <strong>${sub.student_name || 'Anonymous'}</strong> ${sub.student_id || ''}
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
          document.getElementById(`exportCSV-${examId}`).addEventListener('click', () => exportCSV(examId));
          document.getElementById(`rescore-${examId}`).addEventListener('click', () => rescoreSubmissions(examId));
          container.querySelectorAll('.detail-btn').forEach(btn => {
            btn.addEventListener('click', () => viewDetails(parseInt(btn.dataset.subId)));
          });
        }
      }
    } catch (err) { container.innerHTML = '<p class="error">Network error</p>'; }
    container.classList.remove('hidden');
  } else {
    container.classList.add('hidden');
  }
}

function exportCSV(examId) {
  window.open(`${API}/exams/${examId}/submissions/export?token=${encodeURIComponent(teacherState.token)}`, '_blank');
}

async function rescoreSubmissions(examId) {
  if (!confirm('Re-score all submissions for this exam using current correct answers?')) return;
  try {
    const res = await authFetch(`${API}/exams/${examId}/submissions/rescore`, {
      method: 'POST'
    });
    if (!res.ok) {
      const err = await res.json();
      alert(err.error || 'Failed to rescore submissions.');
      return;
    }
    const data = await res.json();
    alert(`Re-scored ${data.submissions_updated} submission(s).`);
    await toggleSubmissions(examId);
    await toggleSubmissions(examId);
  } catch (_err) {
    alert('Network error');
  }
}

async function viewDetails(subId) {
  try {
    const res = await authFetch(`${API}/submissions/${subId}`);
    if (!res.ok) { alert('Failed'); return; }
    const sub = await res.json();
    document.getElementById('detailStudent').textContent = `${sub.student_name || 'Anonymous'} (${sub.student_id || ''})`;
    document.getElementById('detailScore').textContent = `${sub.score.toFixed(1)}% (${Math.round(sub.score * sub.total_questions / 100)}/${sub.total_questions})`;
    const tbody = document.getElementById('detailAnswers');
    tbody.innerHTML = '';
    sub.answers.forEach((ans, idx) => {
      const row = document.createElement('tr');
      row.innerHTML = `<td>${idx+1}</td><td>${ans.text}<br><small>A:${ans.option_a} | B:${ans.option_b} | C:${ans.option_c} | D:${ans.option_d}</small></td><td class="${ans.is_correct?'correct-answer':'wrong-answer'}">${ans.selected_option||'—'}</td><td>${ans.correct_option}</td><td class="${ans.is_correct?'correct-answer':'wrong-answer'}">${ans.is_correct?'✅':'❌'}</td>`;
      tbody.appendChild(row);
    });
    document.getElementById('subDetailModal').classList.remove('hidden');
  } catch (err) { console.error(err); }
}

function closeDetailModal() { document.getElementById('subDetailModal').classList.add('hidden'); }

// ---------- STUDENTS ----------
async function toggleStudents(examId) {
  const container = document.getElementById(`students-${examId}`);
  if (container.classList.contains('hidden')) {
    await loadStudents(examId);
    container.classList.remove('hidden');
    return;
  }
  container.classList.add('hidden');
}

async function loadStudents(examId) {
  const list = document.getElementById(`studentList-${examId}`);
  if (!list) return;
  try {
    const res = await authFetch(`${API}/exams/${examId}/students`);
    if (!res.ok) {
      list.innerHTML = '<li class="error">Failed to load students.</li>';
      return;
    }
    const students = await res.json();
    if (students.length === 0) {
      list.innerHTML = '<li>No students added yet.</li>';
      return;
    }
    list.innerHTML = '';
    students.forEach((student) => {
      const item = document.createElement('li');
      item.className = 'student-item';
      item.innerHTML = `
        <span>${student.student_id}</span>
        <button class="btn-danger btn-sm">Remove</button>
      `;
      item.querySelector('button').addEventListener('click', () => removeStudent(examId, student.student_id));
      list.appendChild(item);
    });
  } catch (_err) {
    list.innerHTML = '<li class="error">Network error.</li>';
  }
}

async function addStudent(examId) {
  const studentIdInput = document.getElementById(`newStudentId-${examId}`);
  const passwordInput = document.getElementById(`newStudentPass-${examId}`);
  const student_id = studentIdInput.value.trim();
  const password = passwordInput.value;
  if (!student_id || !password) {
    alert('Student ID and password are required.');
    return;
  }
  try {
    const res = await authFetch(`${API}/exams/${examId}/students`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_id, password })
    });
    if (!res.ok) {
      const err = await res.json();
      alert(err.error || 'Failed to add student.');
      return;
    }
    studentIdInput.value = '';
    passwordInput.value = '';
    await loadStudents(examId);
  } catch (_err) {
    alert('Network error');
  }
}

async function removeStudent(examId, studentId) {
  try {
    const res = await authFetch(`${API}/exams/${examId}/students/${encodeURIComponent(studentId)}`, {
      method: 'DELETE'
    });
    if (!res.ok) {
      alert('Failed to remove student.');
      return;
    }
    await loadStudents(examId);
  } catch (_err) {
    alert('Network error');
  }
}

// ---------- QUESTIONS ----------
async function selectExam(id) {
  setSelectedExamId(id);
  document.getElementById('questionSection').classList.remove('hidden');
  document.getElementById('bankTargetExam').textContent = 'Exam ' + id;
  try {
    const res = await authFetch(`${API}/exams/${id}`);
    if (res.status === 401) { logout(); return; }
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
          <div class="actions">
            <button class="btn-outline btn-sm edit-question-btn" data-q-id="${q.id}">✏️ Edit</button>
            <button class="btn-danger btn-sm delete-question-btn" data-q-id="${q.id}">Delete</button>
          </div>
        </div>
        <div id="edit-question-${q.id}" class="hidden" style="margin-top:10px; padding:10px; border:1px solid #dce1e8; border-radius:6px; background:#fff;">
          <input type="text" id="eqText-${q.id}" value="${q.text}" placeholder="Question text">
          <div class="row">
            <input type="text" id="eqA-${q.id}" value="${q.option_a}" placeholder="Option A">
            <input type="text" id="eqB-${q.id}" value="${q.option_b}" placeholder="Option B">
          </div>
          <div class="row">
            <input type="text" id="eqC-${q.id}" value="${q.option_c}" placeholder="Option C">
            <input type="text" id="eqD-${q.id}" value="${q.option_d}" placeholder="Option D">
          </div>
          <div style="display:flex; gap:8px; align-items:center; margin-bottom:8px;">
            <label style="margin:0;">Correct:</label>
            <select id="eqCorrect-${q.id}" style="width:auto; margin-bottom:0;">
              <option value="A" ${q.correct_option === 'A' ? 'selected' : ''}>A</option>
              <option value="B" ${q.correct_option === 'B' ? 'selected' : ''}>B</option>
              <option value="C" ${q.correct_option === 'C' ? 'selected' : ''}>C</option>
              <option value="D" ${q.correct_option === 'D' ? 'selected' : ''}>D</option>
            </select>
            <label style="margin:0;">
              <input type="checkbox" id="eqRescore-${q.id}" checked>
              Rescore submissions after save
            </label>
          </div>
          <div class="actions">
            <button class="btn-success btn-sm save-question-btn" data-q-id="${q.id}">Save</button>
            <button class="btn-sm cancel-question-btn" data-q-id="${q.id}">Cancel</button>
          </div>
        </div>
      `;
      li.querySelector('.edit-question-btn').addEventListener('click', () => toggleQuestionEdit(q.id));
      li.querySelector('.delete-question-btn').addEventListener('click', () => deleteQuestion(q.id));
      li.querySelector('.save-question-btn').addEventListener('click', () => saveQuestionEdit(q.id, id));
      li.querySelector('.cancel-question-btn').addEventListener('click', () => toggleQuestionEdit(q.id));
      qList.appendChild(li);
    });
  } catch (err) { console.error(err); }
}

function toggleQuestionEdit(questionId) {
  const panel = document.getElementById(`edit-question-${questionId}`);
  if (panel) panel.classList.toggle('hidden');
}

async function saveQuestionEdit(questionId, examId) {
  const text = document.getElementById(`eqText-${questionId}`).value.trim();
  const option_a = document.getElementById(`eqA-${questionId}`).value.trim();
  const option_b = document.getElementById(`eqB-${questionId}`).value.trim();
  const option_c = document.getElementById(`eqC-${questionId}`).value.trim();
  const option_d = document.getElementById(`eqD-${questionId}`).value.trim();
  const correct_option = document.getElementById(`eqCorrect-${questionId}`).value;
  const shouldRescore = document.getElementById(`eqRescore-${questionId}`).checked;

  if (!text || !option_a || !option_b || !option_c || !option_d) {
    alert('All question fields are required.');
    return;
  }

  try {
    const res = await authFetch(`${API}/questions/${questionId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, option_a, option_b, option_c, option_d, correct_option })
    });
    if (!res.ok) {
      const err = await res.json();
      alert(err.error || 'Failed to update question.');
      return;
    }

    if (shouldRescore) {
      const rescoreRes = await authFetch(`${API}/exams/${examId}/submissions/rescore`, { method: 'POST' });
      if (!rescoreRes.ok) {
        const err = await rescoreRes.json();
        alert(`Question saved, but rescore failed: ${err.error || 'unknown error'}`);
      }
    }

    await selectExam(examId);
  } catch (_err) {
    alert('Network error');
  }
}

async function addQuestion() {
  if (!teacherState.selectedExamId) return;
  const text = document.getElementById('qText').value.trim();
  const option_a = document.getElementById('optA').value.trim();
  const option_b = document.getElementById('optB').value.trim();
  const option_c = document.getElementById('optC').value.trim();
  const option_d = document.getElementById('optD').value.trim();
  const correct = document.getElementById('correctOption').value;
  const saveToBank = document.getElementById('saveToBank').checked;
  const msg = document.getElementById('qMsg');
  if (!text || !option_a || !option_b || !option_c || !option_d) {
    msg.textContent = '❌ All fields required.'; msg.style.color = 'red'; return;
  }
  try {
    // Add to exam
    const res = await authFetch(`${API}/exams/${teacherState.selectedExamId}/questions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, option_a, option_b, option_c, option_d, correct_option: correct })
    });
    if (!res.ok) {
      const err = await res.json();
      msg.textContent = '❌ ' + (err.error || 'Failed'); msg.style.color = 'red';
      return;
    }
    // If save to bank is checked, save to question bank
    if (saveToBank) {
      await authFetch(`${API}/question-bank`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, option_a, option_b, option_c, option_d, correct_option: correct })
      });
    }
    msg.textContent = '✅ Question added!'; msg.style.color = 'green';
    document.getElementById('qText').value = '';
    document.getElementById('optA').value = '';
    document.getElementById('optB').value = '';
    document.getElementById('optC').value = '';
    document.getElementById('optD').value = '';
    document.getElementById('saveToBank').checked = false;
    selectExam(teacherState.selectedExamId);
    if (saveToBank) loadQuestionBank();
  } catch (err) {
    msg.textContent = '❌ Network error'; msg.style.color = 'red';
  }
}

async function deleteExam(id) {
  if (!confirm('Delete exam?')) return;
  await authFetch(`${API}/exams/${id}`, { method: 'DELETE' });
  if (teacherState.selectedExamId === id) { setSelectedExamId(null); document.getElementById('questionSection').classList.add('hidden'); }
  loadExams();
}

async function deleteQuestion(qId) {
  if (!confirm('Delete question?')) return;
  await authFetch(`${API}/questions/${qId}`, { method: 'DELETE' });
  if (teacherState.selectedExamId) selectExam(teacherState.selectedExamId);
}

// ---------- QUESTION BANK ----------
async function loadQuestionBank() {
  try {
    const res = await authFetch(`${API}/question-bank`);
    if (res.status === 401) { logout(); return; }
    const questions = await res.json();
    const list = document.getElementById('bankQuestionList');
    const noBank = document.getElementById('noBankQuestions');
    list.innerHTML = '';
    if (questions.length === 0) {
      noBank.classList.remove('hidden');
    } else {
      noBank.classList.add('hidden');
      questions.forEach(q => {
        const li = document.createElement('li');
        li.className = 'question-item';
        li.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <strong>${q.text}</strong><br>
              <small>A: ${q.option_a} | B: ${q.option_b} | C: ${q.option_c} | D: ${q.option_d}</small>
              <span class="badge">Correct: ${q.correct_option}</span>
            </div>
            <div class="actions">
              <button class="btn-outline btn-sm copy-to-exam-btn" data-bank-id="${q.id}">➕ Copy to Exam</button>
              <button class="btn-danger btn-sm delete-bank-btn" data-bank-id="${q.id}">Delete</button>
            </div>
          </div>
        `;
        li.querySelector('.delete-bank-btn').addEventListener('click', () => deleteBankQuestion(q.id));
        li.querySelector('.copy-to-exam-btn').addEventListener('click', () => copyBankToExam(q.id));
        list.appendChild(li);
      });
    }
  } catch (err) { console.error(err); }
}

async function deleteBankQuestion(id) {
  if (!confirm('Delete from bank?')) return;
  try {
    await authFetch(`${API}/question-bank/${id}`, { method: 'DELETE' });
    loadQuestionBank();
  } catch (err) { alert('Network error'); }
}

async function copyBankToExam(bankId) {
  if (!teacherState.selectedExamId) {
    alert('Please select an exam first (Manage Questions)');
    return;
  }
  try {
    const res = await authFetch(`${API}/question-bank/${bankId}/copy-to-exam/${teacherState.selectedExamId}`, { method: 'POST' });
    if (res.ok) {
      selectExam(teacherState.selectedExamId); // refresh questions list
    } else {
      const err = await res.json();
      alert(err.error || 'Failed to copy');
    }
  } catch (err) { alert('Network error'); }
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
  const start_time = document.getElementById('examStartTime').value;
  const end_time = document.getElementById('examEndTime').value;
  const msg = document.getElementById('createMsg');
  if (!title || isNaN(duration)) {
    msg.textContent = '❌ Title and duration required.'; msg.style.color = 'red'; return;
  }
  try {
    const res = await authFetch(`${API}/exams`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title, duration_minutes: duration,
        require_name, require_student_id,
        allow_multiple_submissions,
        shuffle_questions, shuffle_options,
        status, password,
        start_time: start_time || undefined,
        end_time: end_time || undefined
      })
    });
    if (res.ok) {
      msg.textContent = '✅ Exam created!'; msg.style.color = 'green';
      document.getElementById('examTitle').value = '';
      document.getElementById('examDuration').value = 30;
      document.getElementById('examStartTime').value = '';
      document.getElementById('examEndTime').value = '';
      loadExams();
    } else {
      const err = await res.json();
      msg.textContent = '❌ ' + (err.error || 'Failed'); msg.style.color = 'red';
    }
  } catch (err) { msg.textContent = '❌ Network error'; msg.style.color = 'red'; }
}

// ---------- HELPERS ----------
function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => alert('Link copied!')).catch(() => alert('Failed'));
}