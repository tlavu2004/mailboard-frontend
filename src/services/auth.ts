import apiClient, { setAccessToken, setRefreshToken, clearTokens as clearApiTokens } from './api';
import { 
  LoginRequest, 
  SignupRequest, 
  GoogleAuthRequest, 
  AuthResponse, 
  RefreshTokenRequest,
  RefreshTokenResponse,
  User 
} from '@/types/auth';

export const authService = {
  // Sign up with email and password
  signup: async (data: SignupRequest): Promise<AuthResponse> => {
    const response = await apiClient.post<AuthResponse>('auth/signup', data);
    
    // Store tokens
    setAccessToken(response.data.accessToken);
    setRefreshToken(response.data.refreshToken);
    
    return response.data;
  },

  // Login with email and password
  login: async (data: LoginRequest): Promise<AuthResponse> => {
    const response = await apiClient.post<AuthResponse>('auth/login', data);
    
    // Store tokens
    setAccessToken(response.data.accessToken);
    setRefreshToken(response.data.refreshToken);
    
    return response.data;
  },

  // Login with Google
  googleAuth: async (data: GoogleAuthRequest): Promise<AuthResponse> => {
    const response = await apiClient.post<AuthResponse>('auth/google', data);
    
    // Store tokens
    setAccessToken(response.data.accessToken);
    setRefreshToken(response.data.refreshToken);
    
    return response.data;
  },

  // Refresh access token
  refreshToken: async (data: RefreshTokenRequest): Promise<RefreshTokenResponse> => {
    const response = await apiClient.post<RefreshTokenResponse>('auth/refresh', data);
    
    // Update tokens
    setAccessToken(response.data.accessToken);
    setRefreshToken(response.data.refreshToken);
    
    return response.data;
  },

  // Get current user
  getMe: async (): Promise<User> => {
    const response = await apiClient.get<User>('auth/me');
    return response.data;
  },

  // Logout
  logout: async (): Promise<void> => {
    try {
      await apiClient.post('auth/logout');
    } finally {
      // Clear tokens regardless of API response
      clearApiTokens();
    }
  },

  // Clear tokens (client-side logout)
  clearTokens: () => {
    clearApiTokens();
  },
};
