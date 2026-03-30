import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost/api/v1').replace(/\/?$/, '/');

// Create axios instance
const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
  },
});

// Store for access token (in-memory)
let accessToken: string | null = null;

// Flag to prevent multiple refresh attempts
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value: string) => void;
  reject: (error: unknown) => void;
}> = [];

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token!);
    }
  });
  failedQueue = [];
};

// Request interceptor to add access token
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = getAccessToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle data unwrapping and token refresh
apiClient.interceptors.response.use(
  (response) => {
    // If the response is wrapped in our ApiResponse structure, unwrap it
    // Using 'in' operator instead of hasOwnProperty for better robustness
    const data = response.data;
    if (data && typeof data === 'object' && 'success' in data && 'data' in data) {
      return {
        ...response,
        data: data.data
      };
    }
    return response;
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // If error is 401 and we haven't retried yet
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        // If already refreshing, queue this request
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then(token => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return apiClient(originalRequest);
          })
          .catch(err => {
            return Promise.reject(err);
          });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = getRefreshToken();

      if (!refreshToken) {
        // No refresh token, logout
        clearTokens();
        window.location.href = '/login';
        return Promise.reject(error);
      }

      try {
        console.log('[API] Attempting token refresh with:', refreshToken.substring(0, 10) + '...');
        const response = await axios.post(`${API_URL}auth/refresh`, {
          refreshToken,
        });

        const apiResponse = response.data;
        const { accessToken: newAccessToken, refreshToken: newRefreshToken } = apiResponse.data;

        if (!newAccessToken) {
          throw new Error('No access token in refresh response');
        }

        console.log('[API] Token refresh successful, new access token length:', newAccessToken.length);
        setAccessToken(newAccessToken);
        setRefreshToken(newRefreshToken);

        processQueue(null, newAccessToken);

        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return apiClient(originalRequest);
      } catch (refreshError) {
        console.error('[API] Token refresh failed permanently. Clearing session.', refreshError);
        processQueue(refreshError, null);
        clearTokens();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

// Helper for cookies
const setCookie = (name: string, value: string, days: number) => {
  const date = new Date();
  date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
  const expires = "; expires=" + date.toUTCString();
  if (typeof document !== 'undefined') {
    document.cookie = name + "=" + (value || "") + expires + "; path=/; SameSite=Lax";
  }
};

const getCookie = (name: string) => {
  if (typeof document === 'undefined') return null;
  const nameEQ = name + "=";
  const ca = document.cookie.split(';');
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i];
    while (c.charAt(0) === ' ') c = c.substring(1, c.length);
    if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
  }
  return null;
};

// Token management functions
export const setAccessToken = (token: string) => {
  console.log('[API] Setting access token (length):', token?.length || 0);
  accessToken = token;
  if (typeof window !== 'undefined') {
    localStorage.setItem('accessToken', token);
    setCookie('accessToken', token, 1);
  }
};

export const getAccessToken = () => {
  if (!accessToken && typeof window !== 'undefined') {
    const local = localStorage.getItem('accessToken');
    const cookie = getCookie('accessToken');
    accessToken = local || cookie;
    if (accessToken) {
      console.log(`[API] Recovered access token from ${local ? 'localStorage' : 'cookie'}. Length: ${accessToken.length}`);
    } else {
      console.warn('[API] getAccessToken: No access token found in storage.');
    }
  }
  return accessToken;
};

export const setRefreshToken = (token: string) => {
  if (typeof window !== 'undefined') {
    console.log('[API] Saving refresh token');
    localStorage.setItem('refreshToken', token);
    setCookie('refreshToken', token, 7);
  }
};

export const getRefreshToken = () => {
  if (typeof window !== 'undefined') {
    const local = localStorage.getItem('refreshToken');
    const cookie = getCookie('refreshToken');
    const token = local || cookie;
    if (token) {
      console.log(`[API] getRefreshToken: Found token in ${local ? 'localStorage' : 'cookie'}`);
    }
    return token;
  }
  return null;
};

export const clearTokens = () => {
  console.log('[API] Clearing all tokens');
  accessToken = null;
  if (typeof window !== 'undefined') {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    document.cookie = 'accessToken=; Max-Age=-99999999; path=/;';
    document.cookie = 'refreshToken=; Max-Age=-99999999; path=/;';
    // Dispatch custom logout event for multi-tab sync
    window.dispatchEvent(new Event('logout'));
  }
};

export default apiClient;
