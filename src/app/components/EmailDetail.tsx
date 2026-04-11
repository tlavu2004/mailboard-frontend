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

  if (!email) {
    return (
      <Empty
        description="Select an email to view details"
        style={{ marginTop: '20%' }}
        image={Empty.PRESENTED_IMAGE_SIMPLE}
      />
    );
  }

  return (
    <div className={className} style={style}>
      {showBackButton && (
        <Button
          icon={<ArrowLeftOutlined />}
          onClick={onBack}
          style={{ margin: '16px' }}
          className="mobile-back-button"
        >
          Back
        </Button>
      )}

      <div style={{ maxWidth: '900px', margin: '0 auto', padding: showMobileDetail ? '0 16px 16px' : '0' }}>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <div>
            <Title level={3} style={{ marginTop: '20px', marginBottom: '24px' }}>{email.subject}</Title>
            <Space direction="vertical" size="small" style={{ width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Avatar style={{ backgroundColor: '#667eea' }}>
                  {email.from.name?.charAt(0) || email.from.email.charAt(0).toUpperCase()}
                </Avatar>
                <div>
                  <Text strong>{email.from.name || email.from.email}</Text>
                  <br />
                  <Text type="secondary" style={{ fontSize: '12px' }}>
                    {email.from.email}
                  </Text>
                </div>
              </div>
              <div>
                <Text type="secondary">To: </Text>
                <Text>{email.to.map((t) => t.email).join(', ')}</Text>
              </div>
              {email.cc && email.cc.length > 0 && (
                <div>
                  <Text type="secondary">Cc: </Text>
                  <Text>{email.cc.map((c) => c.email).join(', ')}</Text>
                </div>
              )}
              <Text type="secondary" style={{ fontSize: '12px' }}>
                {new Date(email.receivedAt).toLocaleString()}
              </Text>
            </Space>
          </div>

          <Space wrap>
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

          {email.attachments && email.attachments.length > 0 && (
            <Card title="Attachments" size="small">
              <Space direction="vertical" style={{ width: '100%' }}>
                {email.attachments.map((attachment) => (
                  <div
                    key={attachment.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '8px',
                      background: '#f6f8fa',
                      borderRadius: '4px',
                    }}
                  >
                    <Space>
                      <PaperClipOutlined />
                      <div>
                        <Text strong>{attachment.filename}</Text>
                        <br />
                        <Text type="secondary" style={{ fontSize: '12px' }}>
                          {formatFileSize(attachment.size)}
                        </Text>
                      </div>
                    </Space>
                    <Button
                      size="small"
                      onClick={() =>
                        onDownloadAttachment(email.id, attachment.id, attachment.filename)
                      }
                    >
                      Download
                    </Button>
                  </div>
                ))}
              </Space>
            </Card>
          )}

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

          <Card>
            {!email.body ? (
                <div style={{ textAlign: 'center', padding: '20px' }}>
                    <Spin size="large" tip="Loading content..." />
                </div>
            ) : (
                <iframe
                  srcDoc={`<base href="${process.env.NEXT_PUBLIC_API_URL}/">` + email.body}
                  title="Email Content"
                  style={{
                    width: '100%',
                    minHeight: '400px',
                    border: 'none',
                    overflow: 'hidden',
                  }}
                  sandbox="allow-same-origin allow-scripts"
                  referrerPolicy="no-referrer"
                  onLoad={(e) => {
                    // Auto-resize iframe to content height
                    const iframe = e.target as HTMLIFrameElement;
                    if (iframe.contentDocument) {
                      const height = iframe.contentDocument.body.scrollHeight;
                      iframe.style.height = `${Math.max(height + 20, 400)}px`;
                    }
                  }}
                />
            )}
          </Card>
        </Space>
      </div>
    </div>
  );
};

export default EmailDetail;