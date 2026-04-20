import apiClient from './api';

// For now let's define locally or assume shared types. But better to return 'any' or specific types until components are created.
// Actually, let's typesafe this.

export interface KanbanCardType {
  id: string;
  messageId?: string;
  gmailMessageId?: string;
  threadId?: string;
  accountEmail?: string;
  sender: string;
  subject: string;
  summary: string;
  preview: string;
  gmailUrl: string;
  snoozedUntil?: string;
  receivedAt: string;
  isRead: boolean;
  hasAttachments: boolean;
  hasCloudLinks: boolean;
  hasPhysicalAttachments: boolean;
  kanbanOrder?: number;
  summarySource?: string;
}

export interface ColMeta {
  key: string;
  label: string;
  color?: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const transformCard = (data: any): KanbanCardType => ({
  id: String(data.id),
  messageId: data.message_id,
  gmailMessageId: data.gmail_message_id,
  threadId: data.thread_id,
  accountEmail: data.account_email,
  sender: data.sender,
  subject: data.subject,
  summary: data.summary,
  preview: data.preview,
  gmailUrl: data.gmail_url,
  snoozedUntil: data.snoozed_until,
  receivedAt: data.received_at,
  isRead: data.is_read,
  hasAttachments: data.has_attachments,
  hasCloudLinks: data.has_cloud_links,
  hasPhysicalAttachments: data.has_physical_attachments,
  kanbanOrder: data.kanban_order,
  summarySource: data.summary_source || undefined,
});

export const DEFAULT_STATUSES = ['INBOX', 'TODO', 'IN_PROGRESS', 'DONE', 'SNOOZED'];

const transformColumn = (data: any): KanbanColumn => {
  // Use 'key' from backend if available, otherwise fallback to id.
  // The backend now sends linkedStatus or id as the 'key'.
  const key = data.key || String(data.id);
  const isDefault = !!(data.isDefault || (data.key && DEFAULT_STATUSES.includes(data.key)));

  return {
    id: String(data.id),
    userId: data.userId || '',
    key: key,
    label: data.name || data.label || '',
    order: data.position ?? data.order ?? 0,
    gmailLabel: data.gmailLabelId || data.gmailLabel || '',
    color: data.color || '#f1f5f9',
    isDefault: isDefault,
  };
};

export const kanbanService = {
  getKanban: async (opts?: { unread?: boolean; hasAttachments?: boolean; sortBy?: string; sortOrder?: string }) => {
    const params: Record<string, any> = {};
    if (opts) {
      if (opts.unread) params.unread = true;
      if (opts.hasAttachments) params.hasAttachments = true;
      if (opts.sortBy) params.sortBy = opts.sortBy;
      if (opts.sortOrder) params.sortOrder = opts.sortOrder;
      params.t = Date.now();
    } else {
      params.t = Date.now();
    }

    const response = await apiClient.get<{ columns: Record<string, any[]> }>('kanban', { params });
    const columns: Record<string, KanbanCardType[]> = {};

    Object.entries(response.data.columns || {}).forEach(([key, cards]) => {
      columns[key] = (cards || []).map(transformCard);
    });

    return { columns };
  },

  getMeta: async () => {
    const response = await apiClient.get<{ columns: any[] }>('kanban/meta');
    return {
      columns: (response.data.columns || []).map(transformColumn)
    };
  },

  moveCard: async (emailId: string, toStatus: string, kanbanOrder?: number) => {
    const payload: any = { email_id: emailId, to_status: toStatus };
    if (kanbanOrder !== undefined) payload.kanban_order = kanbanOrder;
    const response = await apiClient.post('kanban/move', payload);
    return response.data;
  },

  snoozeCard: async (emailId: string, until: string) => {
    // until should be RFC3339 string
    const response = await apiClient.post('kanban/snooze', { email_id: emailId, until });
    return response.data;
  },

  summarizeEmail: async (emailId: string) => {
    const response = await apiClient.post<{ ok: boolean; summary: string }>('kanban/summarize', { email_id: emailId });
    return response.data;
  },

  // ========== Column Configuration ==========

  getColumns: async (): Promise<KanbanColumn[]> => {
    const response = await apiClient.get<{ columns: any[] }>('kanban/columns', { params: { t: Date.now() } });
    return (response.data.columns || []).map(transformColumn);
  },

  createColumn: async (data: CreateColumnRequest): Promise<KanbanColumn[]> => {
    const response = await apiClient.post<{ columns: any[] }>('kanban/columns', data);
    return (response.data.columns || []).map(transformColumn);
  },

  updateColumn: async (id: string, data: UpdateColumnRequest): Promise<KanbanColumn[]> => {
    const response = await apiClient.put<{ columns: any[] }>(`kanban/columns/${id}`, data);
    return (response.data.columns || []).map(transformColumn);
  },

  deleteColumn: async (id: string): Promise<KanbanColumn[]> => {
    const response = await apiClient.delete<{ columns: any[] }>(`kanban/columns/${id}`);
    return (response.data.columns || []).map(transformColumn);
  },

  reorderColumns: async (columnIds: string[]): Promise<KanbanColumn[]> => {
    const response = await apiClient.post<{ columns: any[] }>('kanban/columns/reorder', { columnIds });
    return (response.data.columns || []).map(transformColumn);
  },

  // ========== Gmail Labels ==========

  getGmailLabels: async (): Promise<GmailLabel[]> => {
    const response = await apiClient.get<{ labels: GmailLabel[] }>('gmail/labels');
    return response.data.labels || [];
  },

  createGmailLabel: async (name: string): Promise<GmailLabel> => {
    const response = await apiClient.post<{ label: GmailLabel }>('gmail/labels', { name });
    return response.data.label;
  },
};

// ========== Types for Column Config ==========

export interface KanbanColumn {
  id: string;
  userId: string;
  key: string;
  label: string;
  order: number;
  gmailLabel: string;
  color?: string;
  isDefault: boolean;
}

export interface CreateColumnRequest {
  label: string;
  gmailLabel?: string;
  color?: string;
}

export interface UpdateColumnRequest {
  label?: string;
  gmailLabel?: string;
  color?: string;
  order?: number;
}

export interface GmailLabel {
  id: string;
  name: string;
  type: 'system' | 'user';
}
