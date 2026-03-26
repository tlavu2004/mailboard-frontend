import apiClient from './api';
import { Email } from '@/types/email';

// Types
export interface SemanticSearchResult {
  email: Email;
  score: number;
}

export interface SemanticSearchResponse {
  results: SemanticSearchResult[];
  query: string;
  total: number;
}

export interface Suggestion {
  text: string;
  type: 'sender' | 'keyword' | 'subject';
}

export interface SuggestionsResponse {
  suggestions: Suggestion[];
}

// Transform backend response to frontend Email type
/* eslint-disable @typescript-eslint/no-explicit-any */
const transformEmail = (data: any): Email => ({
  id: data.id,
  mailboxId: data.mailboxId || 'INBOX',
  from: {
    name: data.fromName || data.from?.name || '',
    email: data.fromEmail || data.from?.email || '',
  },
  to: data.to || [],
  cc: data.cc,
  bcc: data.bcc,
  subject: data.subject || '',
  preview: data.preview || '',
  body: data.body || '',
  isRead: data.isRead ?? data.is_read ?? false,
  isStarred: data.isStarred ?? data.is_starred ?? false,
  hasAttachments: data.hasAttachments ?? data.has_attachments ?? false,
  attachments: data.attachments,
  receivedAt: data.receivedAt || data.received_at || '',
  createdAt: data.createdAt || data.created_at || '',
  summary: data.summary,
});

export const searchService = {
  /**
   * Perform semantic/vector-based search
   */
  semanticSearch: async (query: string, limit: number = 10): Promise<SemanticSearchResponse> => {
    const response = await apiClient.post<any>('search/semantic', { query, limit });
    
    const results = (response.data.results || []).map((r: any) => ({
      email: transformEmail(r.email),
      score: r.score,
    }));
    
    return {
      results,
      query: response.data.query,
      total: response.data.total,
    };
  },

  /**
   * Get auto-complete suggestions as user types
   */
  getSuggestions: async (query: string): Promise<Suggestion[]> => {
    if (!query || query.trim().length < 2) {
      return [];
    }
    
    const response = await apiClient.get<SuggestionsResponse>('search/suggestions', {
      params: { q: query },
    });
    
    return response.data.suggestions || [];
  },

  /**
   * Trigger embedding generation for user's emails (admin/utility)
   */
  generateEmbeddings: async (limit: number = 50): Promise<{ processed: number; failed: number }> => {
    const response = await apiClient.post<{ processed: number; failed: number }>('search/generate-embeddings', { limit });
    return response.data;
  },
};
