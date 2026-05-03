export const teacherState = {
  apiBase: '/api',
  token: localStorage.getItem('token'),
  authMode: 'login',
  selectedExamId: null
};

export function setToken(token) {
  teacherState.token = token;
  if (token) {
    localStorage.setItem('token', token);
  } else {
    localStorage.removeItem('token');
  }
}

export function setSelectedExamId(examId) {
  teacherState.selectedExamId = examId;
}
