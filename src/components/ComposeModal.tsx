import React, { useState, useRef, useEffect } from 'react';
import { Modal, Form, Input, Button, message, Upload, Space, Tag, Typography, Image, Alert } from 'antd';
import {
  PaperClipOutlined,
  SendOutlined,
  DeleteOutlined,
  FileImageOutlined,
  FileTextOutlined,
  FilePdfOutlined,
  FileOutlined,
  EllipsisOutlined,
} from '@ant-design/icons';
import { emailService } from '@/services/email';
import type { Email, Attachment } from '@/types/email';
import type { UploadFile } from 'antd/es/upload/interface';
import type { InputRef } from 'antd';

const { TextArea } = Input;
const { Text } = Typography;

interface ComposeModalProps {
  visible: boolean;
  onCancel: () => void;
  onSend?: (sentPreview?: Email) => void;
  onSaveDraft?: (draft: Email) => void;
  onDiscard?: () => void;
  mode?: 'compose' | 'reply' | 'reply-all' | 'forward';
  currentUserEmail?: string;
  originalEmail?: {
    id: string;
    threadId?: string;
    from: { name: string; email: string };
    to: Array<{ name: string; email: string } | string>;
    cc?: Array<{ name: string; email: string } | string>;
    bcc?: Array<{ name: string; email: string } | string>;
    removedNoReply?: string[];
    subject: string;
    body: string;
    receivedAt: string;
    mailboxId?: string;
    gmailDraftId?: string;
  };
}
const ComposeModal: React.FC<ComposeModalProps> = ({
  visible,
  onCancel,
  onSend,
  onSaveDraft,
  onDiscard,
  mode = 'compose',
  currentUserEmail,
  originalEmail
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [toEmails, setToEmails] = useState<string[]>([]);
  const [ccEmails, setCcEmails] = useState<string[]>([]);
  const [removedNoReply, setRemovedNoReply] = useState<string[]>([]);
  const [bccEmails, setBccEmails] = useState<string[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [ccInputValue, setCcInputValue] = useState('');
  const [bccInputValue, setBccInputValue] = useState('');
  const [showQuotedContent, setShowQuotedContent] = useState(false);
  const [quotedContent, setQuotedContent] = useState('');
  const [gmailDraftId, setGmailDraftId] = useState<string | undefined>();
  const gmailDraftIdRef = useRef<string | undefined>(undefined);
  
  useEffect(() => {
    gmailDraftIdRef.current = gmailDraftId;
  }, [gmailDraftId]);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const lastSaveContentRef = useRef<string>('');
  const isSavingRef = useRef<boolean>(false);
  const discardedRef = useRef<boolean>(false);
  const hasInitializedRef = useRef<boolean>(false);

  const toInputRef = useRef<InputRef>(null);
  const ccInputRef = useRef<InputRef>(null);
  const bccInputRef = useRef<InputRef>(null);

  const parseAsLocalDate = (value?: string): Date => {
    if (!value) return new Date();
    const trimmed = value.trim();
    const hasTimezone = /([zZ]|[+\-]\d{2}:?\d{2})$/.test(trimmed);
    const normalized = hasTimezone ? trimmed : `${trimmed}Z`;
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? new Date(trimmed) : parsed;
  };

  const stripTagLikeText = (text: string): string => {
    return text
      .replace(/<\/?[a-z][^>\n]*>/gi, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  };

  const htmlToPlainText = (html: string): string => {
    if (!html) return '';

    // Strip script and style tags + content first (aggressive)
    let cleaned = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, '')
      .replace(/<template\b[^<]*(?:(?!<\/template>)<[^<]*)*<\/template>/gi, '');

    // Preserve visual line breaks from common block-level HTML structures.
    cleaned = cleaned
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|section|article|header|footer|blockquote|pre|li|tr|h[1-6])>/gi, '\n')
      .replace(/<li\b[^>]*>/gi, '- ')
      .replace(/<\/(td|th)>/gi, '\t')
      .replace(/<\/(table)>/gi, '\n')
      .replace(/&nbsp;/gi, ' ');

    if (typeof window !== 'undefined') {
      const parser = new DOMParser();
      const doc = parser.parseFromString(cleaned, 'text/html');
      doc.querySelectorAll('script, style, noscript, template').forEach((node) => node.remove());
      const text = doc.body.textContent || '';
      return stripTagLikeText(text);
    }

    const plainText = cleaned
      .replace(/<[^>]+>/g, '')
      .replace(/\n{3,}/g, '\n\n');

    return stripTagLikeText(plainText);
  };

  const mergePendingRecipient = (existing: string[], pendingRaw: string): string[] => {
    const pending = pendingRaw.trim();
    if (!pending) return existing;

    if (!validateEmail(pending)) {
      throw new Error(`Invalid email address: ${pending}`);
    }

    if (existing.some((email) => email.toLowerCase() === pending.toLowerCase())) {
      return existing;
    }

    return [...existing, pending];
  };

  // Initialize form when modal opens
  useEffect(() => {
    if (visible && originalEmail && !hasInitializedRef.current) {
      hasInitializedRef.current = true;
      let subject = originalEmail.subject;
      let toRecipients: string[] = [];
      let ccRecipients: string[] = [];
      let quoted = '';
      const normalizedCurrentUser = (currentUserEmail || '').trim().toLowerCase();

      const unique = (emails: string[]) => {
        const seen = new Set<string>();
        return emails.filter((email) => {
          const normalized = email.toLowerCase();
          if (seen.has(normalized)) {
            return false;
          }
          seen.add(normalized);
          return true;
        });
      };

      const sanitize = (email: string | undefined) => (email || '').trim();
      const extractAddress = (recipient?: { name?: string; email?: string } | string) => {
        if (!recipient) return '';
        const raw = typeof recipient === 'string' ? sanitize(recipient) : sanitize(recipient.email);
        if (!raw) return '';
        const bracketMatch = raw.match(/<([^>]+)>/);
        return sanitize(bracketMatch ? bracketMatch[1] : raw);
      };

      const normalizeRecipients = (value: unknown): string[] => {
        if (!value) return [];

        const list: Array<{ name?: string; email?: string } | string> = Array.isArray(value)
          ? (value as Array<{ name?: string; email?: string } | string>)
          : [String(value)];

        return list
          .flatMap((item) => {
            if (typeof item === 'string') {
              return item
                .split(/[;,]/)
                .map((part) => extractAddress(part))
                .filter(Boolean);
            }
            const extracted = extractAddress(item);
            return extracted ? [extracted] : [];
          })
          .filter(Boolean);
      };

      if (mode === 'reply') {
        // Reply: Send to original sender
        toRecipients = [originalEmail.from.email];
        if (!subject.toLowerCase().startsWith('re:')) {
          subject = 'Re: ' + subject;
        }
        const originalBodyText = htmlToPlainText(originalEmail.body);
        quoted = `On ${parseAsLocalDate(originalEmail.receivedAt).toLocaleString()}, ${originalEmail.from.name || originalEmail.from.email} wrote:\n${originalBodyText}`;
      } else if (mode === 'reply-all') {
        const originalTo = normalizeRecipients(originalEmail.to || []);
        const originalCc = normalizeRecipients(originalEmail.cc || []);
        const senderEmail = sanitize(originalEmail.from.email);

        const toCandidates = [senderEmail, ...originalTo]
          .filter(Boolean)
          .filter((email) => email.toLowerCase() !== normalizedCurrentUser);

        toRecipients = unique(toCandidates);

        const toSet = new Set(toRecipients.map((email) => email.toLowerCase()));

        // Keep original CC list intact for Reply All as much as possible.
        ccRecipients = unique(
          originalCc.filter((email) => !toSet.has(email.toLowerCase()) && email.toLowerCase() !== senderEmail.toLowerCase())
        );

        // Fallback: if CC was serialized oddly, still show non-sender recipients.
        if (ccRecipients.length === 0 && originalCc.length > 0) {
          ccRecipients = unique(originalCc.filter((email) => email.toLowerCase() !== senderEmail.toLowerCase()));
        }

        if (!subject.toLowerCase().startsWith('re:')) {
          subject = 'Re: ' + subject;
        }
        const originalBodyText = htmlToPlainText(originalEmail.body);
        quoted = `On ${parseAsLocalDate(originalEmail.receivedAt).toLocaleString()}, ${originalEmail.from.name || originalEmail.from.email} wrote:\n${originalBodyText}`;
      } else if (mode === 'forward') {
        // Forward: Empty recipients
        if (!subject.toLowerCase().startsWith('fwd:')) {
          subject = 'Fwd: ' + subject;
        }
        const originalBodyText = htmlToPlainText(originalEmail.body);
        quoted = `---------- Forwarded message ---------\nFrom: ${originalEmail.from.name || originalEmail.from.email}\nDate: ${parseAsLocalDate(originalEmail.receivedAt).toLocaleString()}\nSubject: ${originalEmail.subject}\n\n${originalBodyText}`;
      } else if (mode === 'compose' && (originalEmail.mailboxId?.toUpperCase() === 'DRAFTS' || originalEmail.mailboxId?.toUpperCase() === 'DRAFT')) {
        // Editing an existing draft
        toRecipients = normalizeRecipients(originalEmail.to || []);
        ccRecipients = normalizeRecipients(originalEmail.cc || []);
        const bccRecipients = normalizeRecipients(originalEmail.bcc || []);
        setBccEmails(bccRecipients);
        setShowBcc(bccRecipients.length > 0);
        setGmailDraftId(originalEmail.gmailDraftId);
        
        const cleanBody = htmlToPlainText(originalEmail.body || '');
        form.setFieldsValue({
            subject: originalEmail.subject,
            body: cleanBody,
        });
        lastSaveContentRef.current = cleanBody;
        
        setToEmails(toRecipients);
        setCcEmails(ccRecipients);
        setShowCc(ccRecipients.length > 0);
        discardedRef.current = false;
        isSavingRef.current = false;
        return; // Skip the default sets below
      }

      setToEmails(toRecipients);
      setCcEmails(ccRecipients);
      setRemovedNoReply((originalEmail as any).removedNoReply || []);
      setBccEmails([]);
      // Always show CC for Reply All mode, or if there are CC recipients
      setShowCc(mode === 'reply-all' || ccRecipients.length > 0);
      setShowBcc(false);
      setQuotedContent(quoted);
      setShowQuotedContent(false); // Always collapsed by default (Gmail style)
      form.setFieldsValue({
        subject,
        body: '', // User starts with empty body
      });
      discardedRef.current = false;
      isSavingRef.current = false;
      lastSaveContentRef.current = '';
    } else if (visible && !originalEmail && !hasInitializedRef.current) {
        // New compose
        hasInitializedRef.current = true;
        form.resetFields();
        setToEmails([]);
        setCcEmails([]);
        setBccEmails([]);
        setFileList([]);
        setShowCc(false);
        setShowBcc(false);
        setQuotedContent('');
        setShowQuotedContent(false);
        setGmailDraftId(undefined);
        setLastSavedAt(null);
        lastSaveContentRef.current = '';
        discardedRef.current = false;
        isSavingRef.current = false;
    } else if (!visible) {
      // Reset initialization flag when modal closes
      hasInitializedRef.current = false;
    }
  }, [visible, originalEmail, form, currentUserEmail, mode]);

  // Auto-save draft effect
  useEffect(() => {
    if (!visible || loading) return;

    const timer = setInterval(() => {
      handleAutoSave();
    }, 10000); // Auto-save every 10 seconds

    return () => clearInterval(timer);
  }, [visible, loading, toEmails, ccEmails, bccEmails, gmailDraftId]);

  const handleAutoSave = async () => {
    if (isSavingRef.current || discardedRef.current) return;
    
    const values = form.getFieldsValue();
    const currentContent = `${toEmails.join(',')}|${ccEmails.join(',')}|${bccEmails.join(',')}|${values.subject}|${values.body}`;
    
    // Don't save if nothing changed or if basic fields are empty
    if (currentContent === lastSaveContentRef.current) return;
    if (!values.subject && !values.body && toEmails.length === 0) return;

    setIsSaving(true);
    isSavingRef.current = true;
    try {
      const draft = await emailService.saveDraft(
        toEmails,
        ccEmails,
        bccEmails,
        values.subject || '',
        values.body || '',
        gmailDraftIdRef.current,
        originalEmail?.id
      );
      
      if (draft.gmailDraftId) {
        setGmailDraftId(draft.gmailDraftId);
      }
      if (onSaveDraft) {
        onSaveDraft(draft);
      }
      setLastSavedAt(new Date());
      lastSaveContentRef.current = currentContent;
    } catch (error) {
      console.error('Failed to auto-save draft:', error);
    } finally {
      setIsSaving(false);
      isSavingRef.current = false;
    }
  };



  useEffect(() => {
    console.log('[ComposeModal] visible change', { visible, mode, originalEmailId: (originalEmail as any)?.id });
  }, [visible, mode, (originalEmail as any)?.id]);

  const isNoReplySender = (() => {
    try {
      if (!originalEmail || !originalEmail.from) return false;
      const addr = typeof originalEmail.from === 'string' ? originalEmail.from : (originalEmail.from.email || '');
      return /no[-_]?reply/i.test(addr);
    } catch (e) {
      return false;
    }
  })();

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleAddEmail = (email: string, type: 'to' | 'cc' | 'bcc') => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) return;

    if (!validateEmail(trimmedEmail)) {
      message.error('Please enter a valid email address');
      return;
    }

    if (type === 'to') {
      if (!toEmails.includes(trimmedEmail)) {
        setToEmails([...toEmails, trimmedEmail]);
      }
      setInputValue('');
    } else if (type === 'cc') {
      if (!ccEmails.includes(trimmedEmail)) {
        setCcEmails([...ccEmails, trimmedEmail]);
      }
      setCcInputValue('');
    } else if (type === 'bcc') {
      if (!bccEmails.includes(trimmedEmail)) {
        setBccEmails([...bccEmails, trimmedEmail]);
      }
      setBccInputValue('');
    }
  };

  const handleRemoveEmail = (email: string, type: 'to' | 'cc' | 'bcc') => {
    if (type === 'to') {
      setToEmails(toEmails.filter(e => e !== email));
    } else if (type === 'cc') {
      setCcEmails(ccEmails.filter(e => e !== email));
    } else if (type === 'bcc') {
      setBccEmails(bccEmails.filter(e => e !== email));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, type: 'to' | 'cc' | 'bcc') => {
    if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
      e.preventDefault();
      const value = type === 'to' ? inputValue : type === 'cc' ? ccInputValue : bccInputValue;
      handleAddEmail(value, type);
    }
  };

  const handleSend = async (values: { subject: string; body: string }) => {
    let finalTo = toEmails;
    let finalCc = ccEmails;
    let finalBcc = bccEmails;

    try {
      finalTo = mergePendingRecipient(toEmails, inputValue);
      finalCc = mergePendingRecipient(ccEmails, ccInputValue);
      finalBcc = mergePendingRecipient(bccEmails, bccInputValue);
    } catch (error) {
      message.error((error as Error).message);
      return;
    }

    if (finalTo.length === 0) {
      message.error('Please add at least one recipient');
      return;
    }

    setLoading(true);
    discardedRef.current = true; // Stop auto-save while sending
    try {
      // Combine user body with quoted content for final email
      let finalBody = values.body || '';
      if (quotedContent && (mode === 'reply' || mode === 'reply-all' || mode === 'forward')) {
        finalBody += `${finalBody ? '\n\n' : ''}${quotedContent}`;
      }

      // Get attachment files
      const attachments = fileList
        .filter(f => f.originFileObj)
        .map(f => f.originFileObj as File);

      // Message-ID of the email being replied to (for threading)
      const inReplyTo = (originalEmail as any)?.messageId || originalEmail?.threadId;
      const sentEmail = await emailService.sendEmail(
        finalTo,
        finalCc,
        finalBcc,
        values.subject,
        finalBody,
        inReplyTo,
        attachments.length > 0 ? attachments : undefined,
        gmailDraftIdRef.current,
        originalEmail?.id ? Number(originalEmail.id) : undefined
      );
      message.success('Email sent successfully');
      form.resetFields();
      setToEmails([]);
      setCcEmails([]);
      setBccEmails([]);
      setFileList([]);
      setShowCc(false);
      setShowBcc(false);
      setQuotedContent('');
      setShowQuotedContent(false);
      setGmailDraftId(undefined);
      setLastSavedAt(null);
      
      // Pass the actual sent email entity back to parent for UI update
      if (sentEmail && typeof sentEmail === 'object') {
         onSend?.(sentEmail);
      } else {
         onSend?.();
      }
    } catch (error) {
      message.error('Failed to send email');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const getFileIcon = (fileName: string) => {
    const extension = fileName.split('.').pop()?.toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(extension || '')) {
      return <FileImageOutlined style={{ fontSize: 24, color: '#52c41a' }} />;
    } else if (extension === 'pdf') {
      return <FilePdfOutlined style={{ fontSize: 24, color: '#f5222d' }} />;
    } else if (['doc', 'docx', 'txt'].includes(extension || '')) {
      return <FileTextOutlined style={{ fontSize: 24, color: '#1890ff' }} />;
    }
    return <FileOutlined style={{ fontSize: 24, color: '#8c8c8c' }} />;
  };

  const isImageFile = (fileName: string) => {
    const extension = fileName.split('.').pop()?.toLowerCase();
    return ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(extension || '');
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const beforeUpload = (file: any) => {
    const uploadFile: UploadFile = {
      uid: file.uid || Math.random().toString(36).substring(7),
      name: file.name,
      size: file.size,
      type: file.type,
      originFileObj: file,
      status: 'done',
    };

    setFileList((prev) => {
      // Ngăn chặn trùng lặp khi chọn 1 tệp nhiều lần
      if (prev.some((f) => f.name === file.name && f.size === file.size)) {
        return prev;
      }
      const newFiles = [...prev, uploadFile];
      return newFiles.slice(-10); // Giới hạn 10 tệp
    });
    return false; // Ngăn chặn tiến trình upload tự động của Antd để tránh đè trạng thái
  };

  const getModalTitle = () => {
    switch (mode) {
      case 'reply':
        return 'Reply';
      case 'reply-all':
        return 'Reply All';
      case 'forward':
        return 'Forward';
      default:
        return 'New Message';
    }
  };

  return (
    <Modal
      title={getModalTitle()}
      open={visible}
      onCancel={async () => {
        // Auto-save before closing via 'X' button
        if (!discardedRef.current) {
          await handleAutoSave();
        }
        onCancel();
      }}
      footer={null}
      destroyOnHidden
      width={700}
      styles={{
        body: { padding: '0' }
      }}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSend}
        style={{ margin: 0 }}
      >
        {/* Top banners: show persistent warning for reply to no-reply sender, and info when reply-all removed recipients */}
        {mode === 'reply' && isNoReplySender && (
          <div style={{ padding: '12px 24px' }}>
            <Alert
              message="This address usually doesn't accept replies. Your message may not be delivered."
              type="warning"
              showIcon
              style={{ marginBottom: 8 }}
            />
          </div>
        )}

        {mode === 'reply-all' && removedNoReply && removedNoReply.length > 0 && (
          <div style={{ padding: '12px 24px' }}>
            <Alert
              message={`No-reply addresses were removed: ${removedNoReply.join(', ')}`}
              type="info"
              showIcon
              style={{ marginBottom: 8 }}
            />
          </div>
        )}
        {/* To Field */}
        <div style={{
          padding: '12px 24px',
          borderBottom: '1px solid #f0f0f0',
          display: 'flex',
          alignItems: 'flex-start',
          minHeight: '48px'
        }}>
          <Text style={{
            width: '60px',
            lineHeight: '32px',
            color: '#8c8c8c',
            fontSize: '14px'
          }}>
            To
          </Text>
          <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' }}>
            {toEmails.map(email => (
              <Tag
                key={email}
                closable
                onClose={() => handleRemoveEmail(email, 'to')}
                style={{ margin: 0 }}
              >
                {email}
              </Tag>
            ))}
            <Input
              ref={toInputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, 'to')}
              onBlur={() => inputValue && handleAddEmail(inputValue, 'to')}
              placeholder={toEmails.length === 0 ? "Recipients" : ""}
              variant="borderless"
              style={{
                flex: 1,
                minWidth: '200px',
                padding: '4px 0'
              }}
            />
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
              <Button
                type="link"
                size="small"
                onClick={() => setShowCc(!showCc)}
                style={{
                  color: showCc ? '#1890ff' : '#8c8c8c',
                  fontWeight: showCc ? '600' : 'normal'
                }}
              >
                Cc
              </Button>
              <Button
                type="link"
                size="small"
                onClick={() => setShowBcc(!showBcc)}
                style={{
                  color: showBcc ? '#1890ff' : '#8c8c8c',
                  fontWeight: showBcc ? '600' : 'normal'
                }}
              >
                Bcc
              </Button>
            </div>
          </div>
        </div>

        {/* Cc Field */}
        {showCc && (
          <div style={{
            padding: '12px 24px',
            borderBottom: '1px solid #f0f0f0',
            display: 'flex',
            alignItems: 'flex-start',
            minHeight: '48px',
            backgroundColor: 'transparent'
          }}>
            <div style={{
              width: '60px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginRight: '8px'
            }}>
              <Text style={{
                color: '#8c8c8c',
                fontSize: '14px',
                whiteSpace: 'nowrap'
              }}>
                Cc
              </Text>
              <Button
                type="text"
                size="small"
                icon={<DeleteOutlined style={{ fontSize: '12px', color: '#ff4d4f' }} />}
                onClick={() => setShowCc(false)}
                style={{ padding: 0 }}
                title="Hide Cc"
              />
            </div>
            <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' }}>
              {/* Editable CC: show tags + input, plus removedNoReply pills with Include */}
              {ccEmails.map(email => (
                <Tag
                  key={email}
                  closable
                  onClose={() => handleRemoveEmail(email, 'cc')}
                  style={{ margin: 0 }}
                >
                  {email}
                </Tag>
              ))}
              <Input
                ref={ccInputRef}
                value={ccInputValue}
                onChange={(e) => setCcInputValue(e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, 'cc')}
                onBlur={() => ccInputValue && handleAddEmail(ccInputValue, 'cc')}
                placeholder="Cc recipients"
                variant="borderless"
                style={{
                  flex: 1,
                  minWidth: '200px',
                  padding: '4px 0'
                }}
              />
              {removedNoReply && removedNoReply.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 8 }}>
                  {removedNoReply.map(addr => (
                    <div key={addr} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Tag color="orange" style={{ margin: 0 }}>{addr}</Tag>
                      <Button type="link" size="small" onClick={() => {
                        if (!ccEmails.includes(addr)) setCcEmails(prev => [...prev, addr]);
                        setRemovedNoReply(prev => prev.filter(a => a !== addr));
                      }}>Include</Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Bcc Field */}
        {showBcc && (
          <div style={{
            padding: '12px 24px',
            borderBottom: '1px solid #f0f0f0',
            display: 'flex',
            alignItems: 'flex-start',
            minHeight: '48px'
          }}>
            <div style={{
              width: '60px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginRight: '8px'
            }}>
              <Text style={{
                color: '#8c8c8c',
                fontSize: '14px'
              }}>
                Bcc
              </Text>
              <Button
                type="text"
                size="small"
                icon={<DeleteOutlined style={{ fontSize: '12px', color: '#ff4d4f' }} />}
                onClick={() => setShowBcc(false)}
                style={{ padding: 0 }}
                title="Hide Bcc"
              />
            </div>
            <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' }}>
              {bccEmails.map(email => (
                <Tag
                  key={email}
                  closable
                  onClose={() => handleRemoveEmail(email, 'bcc')}
                  style={{ margin: 0 }}
                >
                  {email}
                </Tag>
              ))}
              <Input
                ref={bccInputRef}
                value={bccInputValue}
                onChange={(e) => setBccInputValue(e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, 'bcc')}
                onBlur={() => bccInputValue && handleAddEmail(bccInputValue, 'bcc')}
                placeholder="Bcc recipients"
                variant="borderless"
                style={{
                  flex: 1,
                  minWidth: '200px',
                  padding: '4px 0'
                }}
              />
            </div>
          </div>
        )}

        {/* Subject */}
        <div style={{
          padding: '12px 24px',
          borderBottom: '1px solid #f0f0f0',
        }}>
          <Form.Item
            name="subject"
            rules={[{ required: true, message: 'Please enter a subject' }]}
            style={{ margin: 0 }}
          >
            <Input
              placeholder="Subject"
              variant="borderless"
              style={{ padding: '4px 0' }}
            />
          </Form.Item>
        </div>

        {/* Body */}
        <div style={{ padding: '16px 24px' }}>
          <Form.Item
            name="body"
            style={{ margin: 0 }}
          >
            <TextArea
              rows={8}
              placeholder="Write your message here..."
              variant="borderless"
              style={{
                padding: 0,
                resize: 'none'
              }}
            />
          </Form.Item>

          {/* Quoted Content Toggle (Gmail-style "...") */}
          {quotedContent && (mode === 'reply' || mode === 'reply-all' || mode === 'forward') && (
            <div style={{ marginTop: '12px' }}>
              <Button
                type="text"
                size="small"
                icon={<EllipsisOutlined />}
                onClick={() => setShowQuotedContent(!showQuotedContent)}
                style={{
                  background: '#f0f0f0',
                  borderRadius: '4px',
                  width: '36px',
                  height: '24px',
                  padding: 0,
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
                title={showQuotedContent ? 'Hide quoted content' : 'Show quoted content'}
              />

              {showQuotedContent && (
                <div style={{ marginTop: '12px', border: '1px solid #e8e8e8', borderRadius: '4px', padding: '12px', background: '#fafafa' }}>
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'inherit', fontSize: '13px' }}>
                    {quotedContent}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Attachments */}
        {fileList.length > 0 && (
          <div style={{
            padding: '16px 24px',
            borderTop: '1px solid #f0f0f0',
            maxHeight: '200px',
            overflowY: 'auto'
          }}>
            <Text strong style={{ display: 'block', marginBottom: '12px' }}>
              Attachments ({fileList.length})
            </Text>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {fileList.map((file, index) => (
                <div
                  key={index}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '8px 12px',
                    background: '#fafafa',
                    borderRadius: '6px',
                    gap: '12px'
                  }}
                >
                  {isImageFile(file.name) && file.originFileObj ? (
                    <Image
                      src={URL.createObjectURL(file.originFileObj)}
                      alt={file.name}
                      width={40}
                      height={40}
                      style={{ objectFit: 'cover', borderRadius: '4px' }}
                      preview={{
                        mask: <div style={{ fontSize: '12px' }}>Preview</div>
                      }}
                    />
                  ) : (
                    getFileIcon(file.name)
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Text strong style={{ fontSize: '13px', display: 'block' }} ellipsis>
                      {file.name}
                    </Text>
                    <Text type="secondary" style={{ fontSize: '12px' }}>
                      {file.size ? formatFileSize(file.size) : 'Unknown size'}
                    </Text>
                  </div>
                  <Button
                    type="text"
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => {
                      setFileList(fileList.filter((_, i) => i !== index));
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{
          padding: '12px 24px',
          borderTop: '1px solid #f0f0f0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: '#fafafa'
        }}>
          <Space size="middle">
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              icon={<SendOutlined />}
            >
              Send
            </Button>
            <Upload
              fileList={fileList}
              beforeUpload={beforeUpload}
              showUploadList={false}
              multiple
            >
              <Button icon={<PaperClipOutlined />}>
                Attach
              </Button>
            </Upload>
            {(isSaving || lastSavedAt) && (
              <Text type="secondary" style={{ fontSize: '12px', marginLeft: '8px' }}>
                {isSaving ? 'Đang lưu...' : `Bản nháp đã lưu lúc ${lastSavedAt?.toLocaleTimeString()}`}
              </Text>
            )}
          </Space>
          <Space>
            { (gmailDraftId || originalEmail?.id) && (
              <Button 
                  danger 
                  onClick={async () => {
                      // Discard means we delete the draft from Gmail if it was saved, and always from local DB
                      discardedRef.current = true; // Stop auto-save immediately
                      const draftId = gmailDraftIdRef.current;
                      const emailId = originalEmail?.id;
                      
                      if (draftId || emailId) {
                          try {
                              setLoading(true);
                              await emailService.deleteDraft(draftId || 'undefined', emailId);
                              message.success('Draft discarded');
                              onDiscard?.();
                          } catch (err) {
                              console.error('Failed to discard draft:', err);
                          } finally {
                              setLoading(false);
                          }
                      }
                      onCancel();
                  }} 
                  disabled={loading}
              >
                Discard
              </Button>
            )}
          </Space>
        </div>
      </Form>
    </Modal>
  );
};

export default ComposeModal;
