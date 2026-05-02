import apiClient from './api';
import { USE_MOCK_API, mockEmailApi } from '@/mocks/api';
import { Mailbox, Email, EmailListResponse } from '@/types/email';

export const emailService = {
  // Get all mailboxes
  getMailboxes: async (): Promise<{ mailboxes: Mailbox[], accountId?: number }> => {
    if (USE_MOCK_API) {
      const mockData = await mockEmailApi.getMailboxes();
      return { mailboxes: mockData.mailboxes };
    }

    const response = await apiClient.get<{ mailboxes: Mailbox[], accountId?: number }>('mailboxes');
    return response.data;
  },

  // Get emails for a specific mailbox
  getEmails: async (
    mailboxId: string,
    page: number = 1,
    perPage: number = 20,
    unread?: boolean,
    hasAttachments?: boolean,
    sortBy?: string,
    sortOrder?: string
  ): Promise<EmailListResponse> => {
    if (USE_MOCK_API) {
      return await mockEmailApi.getEmails(mailboxId, page, perPage) as unknown as EmailListResponse;
    }

    const response = await apiClient.get<any>(`mailboxes/${mailboxId}/emails`, {
      params: {
        page,
        perPage,
        unread: unread === undefined ? undefined : unread,
        hasAttachments: hasAttachments === undefined ? undefined : hasAttachments,
        sortBy,
        sortOrder,
        _t: Date.now() // Cache busting (V10.27)
      },
    });
    const data = response.data;
    if (data && data.emails && Array.isArray(data.emails)) {
      data.emails.forEach((e: any) => {
        if (!e.mailboxId && e.status) e.mailboxId = e.status;
      });
    }
    return data;
  },

  // NEW: Multi-layer sort support
  async getEmailsByMailbox(mailboxId: string, page: number = 1, perPage: number = 20, filters: any = {}, sortLayers: { field: string, order: 'asc' | 'desc' }[] = []) {
    let url = `/mailboxes/${mailboxId}/emails?page=${page}&perPage=${perPage}`;
    if (filters.unread) url += `&unread=true`;
    if (filters.hasAttachment) url += `&hasAttachments=true`;
    
    if (sortLayers.length > 0) {
      sortLayers.forEach(layer => {
        url += `&sort=${layer.field}:${layer.order}`;
      });
    } else {
      url += `&sort=receivedDate:desc`;
    }

    const response = await apiClient.get(url, {
      params: { _t: Date.now() }
    });
    return response.data;
  },

  async getKanban(mailboxId: string, sortLayers: { field: string, order: 'asc' | 'desc' }[] = []) {
    let url = `/mailboxes/${mailboxId}/kanban`;
    if (sortLayers.length > 0) {
      sortLayers.forEach(layer => {
        url += `&sort=${layer.field}:${layer.order}`;
      });
    } else {
      url += `&sort=receivedDate:desc`;
    }
    const response = await apiClient.get(url);
    return response.data;
  },

  // Get email detail
  getEmailDetail: async (emailId: string): Promise<Email> => {
    if (USE_MOCK_API) {
      return await mockEmailApi.getEmailById(emailId) as unknown as Email;
    }

    const response = await apiClient.get<any>(`emails/${emailId}`, {
      params: { _t: Date.now() } // Cache busting (V10.27)
    });
    const data = response.data;
    if (data && !data.mailboxId && data.status) {
      data.mailboxId = data.status;
    }
    return data;
  },

  // Search emails
  searchEmails: async (query: string, pageToken?: string): Promise<{ emails: Email[], nextPageToken: string, totalEstimate: number }> => {
    if (USE_MOCK_API) {
      // Mock simple filter
      const all = await mockEmailApi.getEmails('INBOX'); // simplified
      const filtered = all.emails.filter(e => e.subject.toLowerCase().includes(query.toLowerCase()));
      return { emails: filtered as unknown as Email[], nextPageToken: '', totalEstimate: filtered.length };
    }
    const response = await apiClient.get<{ emails: Email[], nextPageToken: string, totalEstimate: number }>('emails/search', {
      params: { q: query, pageToken }
    });
    return response.data;
  },

  // Send email with optional attachments
  // Returns full email entity (mapped to DTO) so caller can perform optimistic UI updates
  sendEmail: async (
    to: string[],
    cc: string[],
    bcc: string[],
    subject: string,
    body: string,
    threadId?: string,
    attachments?: File[],
    gmailDraftId?: string,
    localEmailId?: number
  ): Promise<Email | void> => {
    if (USE_MOCK_API) {
      // Mock implementation
      return;
    }

    // If there are attachments, use FormData
    if (attachments && attachments.length > 0) {
      const formData = new FormData();
      formData.append('to', JSON.stringify(to));
      formData.append('cc', JSON.stringify(cc));
      formData.append('bcc', JSON.stringify(bcc));
      formData.append('subject', subject);
      formData.append('body', body);
      if (threadId) formData.append('threadId', threadId);
      if (gmailDraftId) formData.append('gmailDraftId', gmailDraftId);
      if (localEmailId) formData.append('localEmailId', localEmailId.toString());
      
      attachments.forEach(file => {
        formData.append('attachments', file);
      });

      const response = await apiClient.post<any>('emails/send', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      return response.data;
    }

    // Simple JSON request
    const response = await apiClient.post<any>('emails/send', {
      to,
      cc,
      bcc,
      subject,
      bodyText: body,
      inReplyTo: threadId,
      gmailDraftId,
      localEmailId
    });
    return response.data;
  },

  // Save draft
  saveDraft: async (
    to: string[],
    cc: string[],
    bcc: string[],
    subject: string,
    body: string,
    gmailDraftId?: string,
    localEmailId?: string | number
  ): Promise<Email> => {
    const response = await apiClient.post<Email>('emails/draft', {
      to,
      cc,
      bcc,
      subject,
      bodyText: body,
      gmailDraftId,
      localEmailId
    });
    return response.data;
  },

  // Reply to email
  replyEmail: async (originalEmailId: string, to: string, subject: string, body: string): Promise<void> => {
    if (USE_MOCK_API) {
      // Mock implementation
      return;
    }
    await apiClient.post(`emails/${originalEmailId}/reply`, { to, subject, body });
  },

  // Modify email labels (mark read/unread, star, delete)
  modifyEmail: async (emailId: string, addLabels: string[], removeLabels: string[]): Promise<void> => {
    if (USE_MOCK_API) {
      // Mock implementation
      return;
    }
    await apiClient.post(`emails/${emailId}/modify`, { addLabels, removeLabels });
  },

  // Get attachment URL
  getAttachmentUrl: (messageId: string, attachmentId: string): string => {
    if (USE_MOCK_API) {
      return '#';
    }
    // Construct URL directly as it's a GET request with auth token handled by browser/interceptor?
    // Actually for file download, we might need to handle auth token. 
    // If using axios interceptor, we can't easily use a simple <a> tag href.
    // But for simplicity, let's return the API URL and assume we might need a way to pass token if it was cookie based.
    // Since we use Bearer token header, we might need to fetch blob via axios and create object URL.
    return `${process.env.NEXT_PUBLIC_API_URL}/attachments/${attachmentId}?messageId=${messageId}`;
  },

  // Mark email as read (Updated to use modifyEmail)
  markAsRead: async (emailId: string): Promise<void> => {
    if (USE_MOCK_API) {
      return await mockEmailApi.markAsRead(emailId);
    }
    // Gmail API: Remove UNREAD label
    await emailService.modifyEmail(emailId, [], ['UNREAD']);
  },

  // Mark email as unread
  markAsUnread: async (emailId: string): Promise<void> => {
    if (USE_MOCK_API) {
      return;
    }
    // Gmail API: Add UNREAD label
    await emailService.modifyEmail(emailId, ['UNREAD'], []);
  },

  // Toggle star on email (Updated to use modifyEmail)
  toggleStar: async (emailId: string, isStarred: boolean): Promise<void> => {
    if (USE_MOCK_API) {
      return await mockEmailApi.toggleStar(emailId);
    }
    if (isStarred) {
      await emailService.modifyEmail(emailId, ['STARRED'], []);
    } else {
      await emailService.modifyEmail(emailId, [], ['STARRED']);
    }
  },

  // Delete email (Updated to use modifyEmail or delete endpoint)
  deleteEmail: async (emailId: string): Promise<void> => {
    if (USE_MOCK_API) {
      return await mockEmailApi.deleteEmail(emailId);
    }
    // Gmail API: Add TRASH label
    await emailService.modifyEmail(emailId, ['TRASH'], []);
  },

  // Move email to spam
  markAsSpam: async (emailId: string): Promise<void> => {
    if (USE_MOCK_API) {
      return;
    }
    await emailService.modifyEmail(emailId, ['SPAM'], ['INBOX']);
  },

  // Restore email back to inbox from Trash/Spam
  restoreToInbox: async (emailId: string, from: 'TRASH' | 'SPAM'): Promise<void> => {
    if (USE_MOCK_API) {
      return;
    }
    await emailService.modifyEmail(emailId, ['INBOX'], [from]);
  },

  // Sync emails from Gmail
  syncEmails: async (accountId?: number, folderName: string = 'INBOX', limit: number = 10, page: number = 0): Promise<void> => {
    if (USE_MOCK_API) {
      return;
    }
    await apiClient.post('emails/sync', null, {
      params: { accountId, folderName, limit, page }
    });
  },

  deleteEmailPermanently: async (emailId: string): Promise<void> => {
    if (USE_MOCK_API) {
      return;
    }
    await apiClient.delete(`emails/${emailId}`);
  },

  // Repair corrupted email bodies
  repairEmails: async (): Promise<void> => {
    if (USE_MOCK_API) {
      return;
    }
    await apiClient.post('emails/repair');
  },

  // Force refresh a single email
  refreshEmail: async (emailId: string): Promise<void> => {
    if (USE_MOCK_API) {
      return;
    }
    await apiClient.post(`emails/${emailId}/refresh`);
  },

  deleteDraft: async (draftId: string, emailId?: string | number): Promise<void> => {
    const url = `emails/draft/${draftId || 'undefined'}${emailId ? `?emailId=${emailId}` : ''}`;
    await apiClient.delete(url);
  },

  // Empty Trash folder
  emptyTrash: async (): Promise<void> => {
    if (USE_MOCK_API) {
      return;
    }
    await apiClient.delete('mailboxes/TRASH/empty');
  },

  // Get all known contacts for autocomplete
  getContacts: async (): Promise<{ name: string, email: string }[]> => {
    if (USE_MOCK_API) {
      return [
        { name: 'John Doe', email: 'john@example.com' },
        { name: 'Jane Smith', email: 'jane@example.com' }
      ];
    }
    const response = await apiClient.get<any>('emails/contacts');
    return response.data;
  },
};
