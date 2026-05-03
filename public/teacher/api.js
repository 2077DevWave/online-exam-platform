import { teacherState } from './state.js';

export async function authFetch(url, options = {}) {
  if (!teacherState.token) {
    throw new Error('Not authenticated');
  }

  options.headers = {
    ...options.headers,
    Authorization: `Bearer ${teacherState.token}`
  };
  return fetch(url, options);
}

export function getApiBase() {
  return teacherState.apiBase;
}
