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
import type { UploadFile } from 'antd/es/upload/interface';
import type { InputRef } from 'antd';

const { TextArea } = Input;
const { Text } = Typography;

interface ComposeModalProps {
  visible: boolean;
  onCancel: () => void;
  onSend: () => void;
  mode?: 'compose' | 'reply' | 'forward';
  originalEmail?: {
    id: string;
    threadId?: string;
    from: { name: string; email: string };
    to: { name: string; email: string }[];
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

  // Initialize form when modal opens
  useEffect(() => {
    if (visible && originalEmail) {
      let subject = originalEmail.subject;
      let toRecipients: string[] = [];
      let quoted = '';

      if (mode === 'reply') {
        // Reply: Send to original sender
        toRecipients = [originalEmail.from.email];
        if (!subject.toLowerCase().startsWith('re:')) {
          subject = 'Re: ' + subject;
        }
        // Store quoted content as HTML
        quoted = `<div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #ddd;"><p style="color: #666; font-size: 13px;">On ${new Date(originalEmail.receivedAt).toLocaleString()}, ${originalEmail.from.name || originalEmail.from.email} wrote:</p>${originalEmail.body}</div>`;
      } else if (mode === 'forward') {
        // Forward: Empty recipients
        if (!subject.toLowerCase().startsWith('fwd:')) {
          subject = 'Fwd: ' + subject;
        }
        // Store quoted content as HTML
        quoted = `<div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #ddd;"><p style="color: #666; font-size: 13px;">---------- Forwarded message ---------<br/>From: ${originalEmail.from.name || originalEmail.from.email}<br/>Date: ${new Date(originalEmail.receivedAt).toLocaleString()}<br/>Subject: ${originalEmail.subject}</p>${originalEmail.body}</div>`;
      }

      setToEmails(toRecipients);
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
  }, [visible, mode, originalEmail, form]);

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
    if (toEmails.length === 0) {
      message.error('Please add at least one recipient');
      return;
    }

    setLoading(true);
    try {
      // Combine user body with quoted content for final email
      let finalBody = values.body || '';
      if (quotedContent && (mode === 'reply' || mode === 'forward')) {
        // quotedContent is already HTML, just append it
        finalBody += quotedContent;
      }

      // Get attachment files
      const attachments = fileList
        .filter(f => f.originFileObj)
        .map(f => f.originFileObj as File);

      await emailService.sendEmail(
        toEmails,
        ccEmails,
        bccEmails,
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
      onSend();
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
          {quotedContent && (mode === 'reply' || mode === 'forward') && (
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
                <div style={{ marginTop: '12px', border: '1px solid #e8e8e8', borderRadius: '4px' }}>
                  <iframe
                    srcDoc={quotedContent}
                    title="Quoted Content"
                    style={{
                      width: '100%',
                      minHeight: '200px',
                      maxHeight: '400px',
                      border: 'none',
                      overflow: 'auto',
                    }}
                    sandbox="allow-same-origin"
                    onLoad={(e) => {
                      const iframe = e.target as HTMLIFrameElement;
                      if (iframe.contentDocument) {
                        const height = iframe.contentDocument.body.scrollHeight;
                        iframe.style.height = `${Math.min(Math.max(height + 20, 200), 400)}px`;
                      }
                    }}
                  />
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
