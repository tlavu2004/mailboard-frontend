import React from 'react';
import { Button, Typography, Space, Avatar, Card, Empty, Spin, Popover } from 'antd';
import {
  ArrowLeftOutlined,
  StarOutlined,
  StarFilled,
  DeleteOutlined,
  PaperClipOutlined,
  ExportOutlined,
  ReloadOutlined,
  RobotOutlined,
  ClockCircleOutlined,
  DownloadOutlined,
  FileOutlined,
  CloudDownloadOutlined,
  LinkOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Email } from '@/types/email';
import SnoozePopover from './SnoozePopover';

const { Title, Text } = Typography;

interface EmailDetailProps {
  email: Email | null;
  onBack: () => void;
  onStar: (e: React.MouseEvent, email: Email) => void;
  onDelete: (e: React.MouseEvent, email: Email) => void;
  onReply?: (email: Email) => void;
  onForward?: (email: Email) => void;
  onRefresh?: (email: Email) => void;
  onSummarize?: (email: Email) => void;
  loadingSummary?: boolean;
  onSnooze?: (emailId: string, until: string) => void;
  onDownloadAttachment: (emailId: string, attachmentId: string, filename: string) => void;
  showMobileDetail: boolean;
  showBackButton?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

const EmailDetail: React.FC<EmailDetailProps> = ({
  email,
  onBack,
  onStar,
  onDelete,
  onReply,
  onForward,
  onRefresh,
  onSummarize,
  loadingSummary,
  onSnooze,
  onDownloadAttachment,
  showMobileDetail,
  showBackButton,
  className,
  style,
}) => {
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  // Generate Gmail URL for opening email in Gmail
  const getGmailUrl = (email: Email) => {
    // If we have a direct gmailLink from backend, use it
    // But replace /u/0/ with /u/accountEmail/ if available to handle multi-account login
    let url = email.gmailLink;
    
    if (!url) {
      const msgId: string = email.messageId || email.id || '';
      url = `https://mail.google.com/mail/u/0/#search/rfc822msgid:${encodeURIComponent(msgId)}`;
    }

    if (email.accountEmail && url.includes('/u/0/')) {
      return url.replace('/u/0/', `/u/${encodeURIComponent(email.accountEmail)}/`);
    }
    
    return url;
  };

  const handleOpenInGmail = () => {
    if (email) {
      window.open(getGmailUrl(email), '_blank', 'noopener,noreferrer');
    }
  };

  const [iframeHeight, setIframeHeight] = React.useState<number>(400);
  
  React.useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'MB_RESIZE' && typeof event.data.height === 'number') {
        // Sanity check: prevent runaway height if the bridge reports massive values (V10.20)
        const cappedHeight = Math.min(event.data.height + 20, 10000);
        setIframeHeight(Math.max(cappedHeight, 400));
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // V20: Force reset iframe height to baseline when switching emails to prevent "height memory" (Leaking tall layouts)
  React.useEffect(() => {
    if (email?.id) {
      console.log('[EmailDetail] Resetting iframe height for new email ID:', email.id);
      setIframeHeight(400);
    }
  }, [email?.id]);

  if (!email) {
    return (
      <Empty
        description="Select an email to view details"
        style={{ marginTop: '20%' }}
        image={Empty.PRESENTED_IMAGE_SIMPLE}
      />
    );
  }

  console.log('[EmailDetail] Rendering with email:', {
    id: email.id,
    subject: email.subject,
    hasAttachments: email.hasAttachments,
    attachmentsCount: email.attachments?.length,
    summarySource: email.summarySource
  });

  // Alias sender and date for compatibility between list-view and detail-view DTOs (V10.27)
  const getSenderInfo = () => {
    // If it's an object {name, email}
    if (typeof email.from === 'object' && email.from !== null) {
      return {
        name: email.from.name || (email as any).fromName,
        email: email.from.email
      };
    }
    // If it's a string, use fromName as name
    return {
      name: (email as any).fromName || (typeof email.from === 'string' ? email.from : 'Unknown Sender'),
      email: typeof email.from === 'string' ? email.from : ''
    };
  };

  const sender = getSenderInfo();
  const toList = email.to || [];
  const ccList = email.cc || [];
  const displayDate = email.receivedAt || email.createdAt || (email as any).sentAt;

  // Helper to render recipient strings regardless of DTO format (V10.28)
  const renderRecipientList = (list: any[]) => {
    return list.map((item: any) => {
      if (typeof item === 'string') return item;
      return item.email || item.name || '';
    }).filter(Boolean).join(', ');
  };

  return (
    <div className={className} style={{ ...style, height: '100%', overflowY: 'auto' }}>
      {showBackButton && (
        <Button
          icon={<ArrowLeftOutlined />}
          onClick={onBack}
          style={{ margin: '8px 16px' }}
          className="mobile-back-button"
        >
          Back
        </Button>
      )}

      <div style={{ maxWidth: '900px', margin: '0 auto', padding: showMobileDetail ? '0 16px 16px' : '0 16px' }}>
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <div style={{ marginBottom: '8px' }}>
            <Title level={3} style={{ marginTop: '12px', marginBottom: '8px' }}>{email.subject}</Title>
          </div>

          {/* V28.4: Metadata move up (Below Title, Above Buttons) */}
          <div style={{ width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Avatar 
                  icon={<UserOutlined />} 
                  style={{ backgroundColor: '#1a73e8' }}
                  size={40}
                />
                <div>
                  <div style={{ fontWeight: 600, color: '#202124', fontSize: '14px' }}>
                    {email.from?.name || email.from?.email || email.sender}
                  </div>
                  <div style={{ fontSize: '12px', color: '#5f6368' }}>
                     to {
                        ((toList.length > 0 && toList.some((t: any) => t.email === email.accountEmail)) || 
                         (toList.length === 0) ||
                         (toList.length === 1 && toList[0].email === sender.email)) 
                        ? 'me' 
                        : renderRecipientList(toList)
                     }
                     {ccList.length > 0 && (
                        <span style={{ marginLeft: '4px' }}>
                          cc: {renderRecipientList(ccList)}
                        </span>
                     )}
                  </div>
                </div>
              </div>
              <div style={{ fontSize: '12px', color: '#5f6368' }}>
                Sent: {displayDate ? new Date(displayDate).toLocaleString('en-US', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false
                }) : ''}
              </div>
            </div>
          </div>

          <Space wrap style={{ marginTop: '8px' }}>
            <Button type="primary" onClick={() => onReply && onReply(email)}>
              Reply
            </Button>
            <Button onClick={() => onReply && onReply(email)}>
              Reply All
            </Button>
            <Button onClick={() => onForward && onForward(email)}>
              Forward
            </Button>
            <Button 
              icon={email.isStarred ? <StarFilled style={{ color: '#faad14' }} /> : <StarOutlined />} 
              onClick={(e) => onStar(e, email)}
            >
              {email.isStarred ? 'Unstar' : 'Star'}
            </Button>
            
            <Popover
              content={
                <SnoozePopover 
                  onConfirm={(until) => onSnooze && onSnooze(email.id, until)} 
                />
              }
              trigger="click"
              placement="bottomRight"
            >
              <Button icon={<ClockCircleOutlined />}>
                Snooze
              </Button>
            </Popover>

            <Button icon={<DeleteOutlined />} danger onClick={(e) => onDelete(e, email)}>
              Delete
            </Button>
            <Button 
              icon={<ExportOutlined />} 
              onClick={handleOpenInGmail}
              title="Open in Gmail"
            >
              Open in Gmail
            </Button>
            <Button 
              icon={<RobotOutlined />} 
              onClick={() => onSummarize && onSummarize(email)}
              loading={loadingSummary}
              disabled={email.summarySource === 'GEMINI'}
              title={email.summarySource === 'GEMINI' ? "Already summarized by Gemini" : "Generate AI Summary"}
            >
              AI Summary
            </Button>
          </Space>

          {(email.summary || loadingSummary) && (
            <Card 
              size="small" 
              title={<Space><RobotOutlined /> <Text strong>AI Summary</Text></Space>}
              style={{ 
                borderLeft: email.summarySource === 'GEMINI' ? '4px solid #48bb78' : '4px solid #667eea',
                background: '#fcfdff'
              }}
            >
              {loadingSummary ? (
                <div style={{ textAlign: 'center', padding: '10px' }}>
                  <Spin size="small" tip="Generative AI at work..." />
                </div>
              ) : (
                <Text style={{ fontStyle: 'italic', color: '#4a5568' }}>
                  {email.summary}
                </Text>
              )}
            </Card>
          )}

          <div style={{ 
            padding: '0 8px 16px', // Outer container breathing room
            backgroundColor: '#f8fafc',
            borderRadius: '16px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            width: '100%'
          }}>
            <Card 
              size="small" 
              bodyStyle={{ padding: 0 }} 
              style={{ 
                borderRadius: '12px', 
                overflow: 'hidden', 
                border: '1px solid #eef2f6',
                width: '100%',
                maxWidth: '960px',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)',
                backgroundColor: '#ffffff'
              }}
            >
              {/* Card is now ONLY for body content */}
              {!email.body ? (
                  <div style={{ textAlign: 'center', padding: '60px 40px' }}>
                      {/* V29: Resilience Fallback - if high-fidelity body is missing, show preview/snipppet */}
                      {email.id && email.preview ? (
                        <div style={{ textAlign: 'left', maxWidth: '800px', margin: '0 auto' }}>
                           <div style={{ color: '#5f6368', marginBottom: '16px', fontSize: '14px', borderBottom: '1px solid #f1f3f4', paddingBottom: '8px' }}>
                             <RobotOutlined /> Note: High-fidelity content unavailable. Showing preview snippet.
                           </div>
                           <div style={{ whiteSpace: 'pre-wrap', color: '#202124', fontSize: '15px', lineHeight: '1.6' }}>
                             {email.preview}
                           </div>
                        </div>
                      ) : email.id ? (
                        <div style={{ color: '#5f6368' }}>
                          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No content available for this email" />
                        </div>
                      ) : (
                        <Spin size="large" tip="Processing high-fidelity content..." />
                      )}
                  </div>
              ) : (
                  <div style={{ backgroundColor: '#ffffff' }}>
                    <iframe
                      srcDoc={`<base href="${process.env.NEXT_PUBLIC_API_URL}/">` + email.body}
                      title="Email Content"
                      style={{
                        width: '100%',
                        height: `${iframeHeight}px`,
                        border: 'none',
                        display: 'block',
                        overflowY: 'hidden',
                        overflowX: 'auto',
                      }}
                      scrolling="auto"
                      sandbox="allow-scripts"
                      referrerPolicy="no-referrer"
                    />
                  </div>
              )}
            </Card>
          </div>

          {email.attachments && email.attachments.length > 0 && (
            <Card 
              size="small" 
              title={<Space><PaperClipOutlined /> <Text strong>Attachments ({email.attachments.length})</Text></Space>}
              className="attachments-card"
              style={{ 
                borderRadius: '12px', 
                border: '1px solid #eef2f6',
                background: '#f8fafc'
              }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px' }}>
                {email.attachments.map((attachment) => (
                  <div
                    key={attachment.id}
                    className="attachment-item"
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      padding: '12px',
                      background: '#fff',
                      border: '1px solid #edf2f7',
                      borderRadius: '10px',
                      transition: 'all 0.2s ease',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '12px' }}>
                      <div style={{ 
                        padding: '8px', 
                        background: attachment.externalUrl ? '#e6f7ff' : '#f1f5f9', 
                        borderRadius: '8px', 
                        color: attachment.externalUrl ? '#1890ff' : '#667eea' 
                      }}>
                        {attachment.externalUrl ? <CloudDownloadOutlined /> : <FileOutlined />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Text strong className="block truncate" style={{ fontSize: '13px' }}>{attachment.filename}</Text>
                        <Text type="secondary" style={{ fontSize: '11px' }}>
                          {attachment.externalUrl ? 'Cloud Storage' : formatFileSize(attachment.size)}
                        </Text>
                      </div>
                    </div>
                    <Button
                      type="default"
                      size="small"
                      block
                      icon={attachment.externalUrl ? <LinkOutlined /> : <DownloadOutlined />}
                      onClick={() => {
                        if (attachment.externalUrl) {
                          window.open(attachment.externalUrl, '_blank');
                        } else {
                          onDownloadAttachment(email.id, attachment.id, attachment.filename);
                        }
                      }}
                      style={{ borderRadius: '6px', fontSize: '12px' }}
                    >
                      {attachment.externalUrl ? 'Open Link' : 'Download'}
                    </Button>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </Space>
      </div>
    </div>
  );
};

export default EmailDetail;