export interface Mailbox {
  id: string;
  name: string;
  icon: string;
  unreadCount: number;
  type: 'system' | 'custom';
}

export interface EmailAddress {
  name: string;
  email: string;
}

export interface Attachment {
  id: string;
  filename: string;
  size: number;
  mimeType?: string;
  contentType?: string;
  url: string;
  serverAttachmentId?: string;
  contentId?: string;
  inline?: boolean;
  externalUrl?: string;
}

export interface Email {
  id: string;
  messageId?: string;
  threadId?: string;
  gmailMessageId?: string;
  gmailDraftId?: string;
  gmailLink?: string;
  accountEmail?: string;
  mailboxId: string;
  from: EmailAddress;
  sender?: string;
  to: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  subject: string;
  preview: string;
  body: string;
  isRead: boolean;
  isStarred: boolean;
  hasAttachments: boolean;
  hasCloudLinks: boolean;
  hasPhysicalAttachments: boolean;
  attachments?: Attachment[];
  receivedAt: string;
  createdAt: string;
  summary?: string;
  summarySource?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

export interface EmailListResponse {
  emails: Email[];
  total: number;
  page: number;
  perPage: number;
  hasNextPage: boolean;
}
