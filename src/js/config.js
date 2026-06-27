// URL base API backend
export const API_BASE = 'https://dogipay.renoaries.my.id';

// Helper: semua request yang butuh token JWT
export async function apiFetch(endpoint, options = {}) {
  const token = localStorage.getItem('token');
  
  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers
    }
  });
  
  return res.json();
}

// Helper: simpan data setelah login
export function saveSession(token, user) {
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
}

// Helper: ambil data user dari localStorage
export function getUser() {
  const user = localStorage.getItem('user');
  return user ? JSON.parse(user) : null;
}

// Helper: cek apakah sudah login
export function isLoggedIn() {
  return !!localStorage.getItem('token');
}

// Helper: logout
export function clearSession() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}