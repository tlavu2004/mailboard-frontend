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
            <div style={{ 
              padding: '10px 16px', 
              background: '#f8fafc', 
              borderRadius: '10px', 
              border: '1px solid #eef2f6',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '8px',
              alignItems: 'center'
            }}>
              <Text type="secondary" style={{ fontSize: '13px' }}><PaperClipOutlined /> Attachments:</Text>
              {email.attachments.map(at => (
                <div 
                  key={at.id}
                  style={{ 
                    padding: '2px 10px', 
                    background: '#fff', 
                    border: '1px solid #edf2f7', 
                    borderRadius: '20px',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    color: '#667eea',
                    cursor: 'pointer'
                  }}
                  onClick={() => {
                    // Smooth scroll to bottom card
                    const el = document.querySelector('.attachments-divider');
                    el?.scrollIntoView({ behavior: 'smooth' });
                  }}
                >
                  <FileOutlined style={{ fontSize: '10px' }} /> {at.filename}
                </div>
              ))}
            </div>
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

          <Card style={{ borderRadius: '12px', overflow: 'hidden' }}>
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
                    height: `${iframeHeight}px`,
                    border: 'none',
                    overflowY: 'hidden',
                    overflowX: 'auto',
                  }}
                  scrolling="auto"
                  sandbox="allow-scripts"
                  referrerPolicy="no-referrer"
                />
            )}
          </Card>

          <div className="attachments-divider" style={{ margin: '16px 0' }} />

          {email.attachments && email.attachments.length > 0 && (
            <Card 
              size="small" 
              title={<Space><PaperClipOutlined /> <Text strong>Attachments ({email.attachments.length})</Text></Space>}
              className="attachments-card"
              style={{ 
                borderRadius: '12px', 
                border: '1px solid #eef2f6',
                background: '#f8fafc',
                marginTop: '16px'
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
                      <div style={{ padding: '8px', background: '#f1f5f9', borderRadius: '8px', color: '#667eea' }}>
                        <FileOutlined />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Text strong className="block truncate" style={{ fontSize: '13px' }}>{attachment.filename}</Text>
                        <Text type="secondary" style={{ fontSize: '11px' }}>
                          {formatFileSize(attachment.size)}
                        </Text>
                      </div>
                    </div>
                    <Button
                      type="default"
                      size="small"
                      block
                      icon={<DownloadOutlined />}
                      onClick={() =>
                        onDownloadAttachment(email.id, attachment.id, attachment.filename)
                      }
                      style={{ borderRadius: '6px', fontSize: '12px' }}
                    >
                      Download
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