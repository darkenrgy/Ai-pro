import axios, { AxiosInstance } from 'axios';
import { clearAuthStorage } from '@/utils/storage';

const API_BASE_URL = '/api/v1';
const DEV_API_BASE_URL = '/api/v1';
const RESOLVED_API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? DEV_API_BASE_URL : API_BASE_URL);

const api: AxiosInstance = axios.create({
  baseURL: RESOLVED_API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add authorization header if token exists
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 responses
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const requestPath = error.config?.url ?? '';
    if (/\/auth\/(login|register)\/?$/i.test(requestPath)) {
      return Promise.reject(error);
    }

    if (error.response?.status === 401) {
      clearAuthStorage();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
