import React, { useState, useRef, useEffect } from 'react';
import { Modal, Form, Input, Button, message, Upload, Space, Tag, Typography, Image } from 'antd';
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
  mode?: 'compose' | 'reply' | 'reply-all' | 'forward';
  currentUserEmail?: string;
  originalEmail?: {
    id: string;
    threadId?: string;
    from: { name: string; email: string };
    to: Array<{ name: string; email: string } | string>;
    cc?: Array<{ name: string; email: string } | string>;
    subject: string;
    body: string;
    receivedAt: string;
  };
}
const ComposeModal: React.FC<ComposeModalProps> = ({
  visible,
  onCancel,
  onSend,
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
  const [bccEmails, setBccEmails] = useState<string[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [ccInputValue, setCcInputValue] = useState('');
  const [bccInputValue, setBccInputValue] = useState('');
  const [showQuotedContent, setShowQuotedContent] = useState(false);
  const [quotedContent, setQuotedContent] = useState('');

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

    if (typeof window !== 'undefined') {
      const parser = new DOMParser();
      const doc = parser.parseFromString(cleaned, 'text/html');
      doc.querySelectorAll('script, style, noscript, template').forEach((node) => node.remove());
      return stripTagLikeText(doc.body.textContent || '');
    }

    const plainText = cleaned
      .replace(/<br\s*\/?\s*>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
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
    if (visible && originalEmail) {
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
      }

      setToEmails(toRecipients);
      setCcEmails(ccRecipients);
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
    } else if (visible) {
      // Reset for new compose
      form.resetFields();
      setToEmails([]);
      setCcEmails([]);
      setBccEmails([]);
      setFileList([]);
      setShowCc(false);
      setShowBcc(false);
      setQuotedContent('');
      setShowQuotedContent(false);
    }
  }, [visible, mode, originalEmail, form, currentUserEmail]);

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

      const messageId = await emailService.sendEmail(
        finalTo,
        finalCc,
        finalBcc,
        values.subject,
        finalBody,
        originalEmail?.threadId,
        attachments.length > 0 ? attachments : undefined
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
      // Build an optimistic Sent preview to insert into Sent view without forcing a full reload.
      try {
        const nowIso = new Date().toISOString();
        const tempId = messageId || `temp-${Date.now()}`;
        const mapAddr = (addr: string) => ({ name: '', email: addr });
        const sentPreview: Email = {
          id: String(tempId),
          messageId: messageId || undefined,
          threadId: originalEmail?.threadId,
          gmailMessageId: undefined,
          gmailLink: undefined,
          accountEmail: currentUserEmail || undefined,
          mailboxId: 'SENT',
          from: { name: '', email: currentUserEmail || '' },
          to: finalTo.map(mapAddr),
          cc: finalCc.map(mapAddr),
          bcc: finalBcc.map(mapAddr),
          subject: values.subject,
          preview: (finalBody || '').slice(0, 160),
          body: finalBody,
          isRead: true,
          isStarred: false,
          hasAttachments: attachments.length > 0,
          hasCloudLinks: false,
          hasPhysicalAttachments: false,
          attachments: attachments.map((f, i) => ({ id: `temp-${i}-${f.name}`, filename: f.name, size: f.size, mimeType: f.type, url: '' } as Attachment)),
          receivedAt: nowIso,
          createdAt: nowIso,
        };

        onSend?.(sentPreview);
      } catch (err) {
        // If anything goes wrong building preview, still call onSend without preview so parent can fallback
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
      onCancel={onCancel}
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
            backgroundColor: mode === 'reply-all' ? '#fafafa' : 'transparent'
          }}>
            <div style={{
              width: mode === 'reply-all' ? '110px' : '60px',
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
                {mode === 'reply-all' ? 'Cc (locked)' : 'Cc'}
              </Text>
              {mode !== 'reply-all' && (
                <Button
                  type="text"
                  size="small"
                  icon={<DeleteOutlined style={{ fontSize: '12px', color: '#ff4d4f' }} />}
                  onClick={() => setShowCc(false)}
                  style={{ padding: 0 }}
                  title="Hide Cc"
                />
              )}
            </div>
            <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' }}>
              {mode === 'reply-all' ? (
                ccEmails.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                    {ccEmails.map(email => (
                      <Tag key={email} color="blue" style={{ margin: 0, cursor: 'default' }}>
                        {email}
                      </Tag>
                    ))}
                  </div>
                ) : (
                  <Text style={{ fontSize: '14px', color: '#8c8c8c' }}>
                    No additional recipients
                  </Text>
                )
              ) : (
                // Editable mode: show as tags
                <>
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
                </>
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
          <Space>
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
          </Space>
          <Button onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </Form>
    </Modal>
  );
};

export default ComposeModal;
