'use client';

import { useState, useEffect, useCallback } from 'react';
import { Layout, Menu, List, Card, Button, Badge, Typography, Space, Avatar, Spin, message, Empty, Modal, Pagination, Dropdown, Drawer } from 'antd';
import EmailDetail from '@/app/components/EmailDetail';
import ComposeModal from '@/components/ComposeModal';
import {
  InboxOutlined,
  StarOutlined,
  SendOutlined,
  FileOutlined,
  DeleteOutlined,
  FolderOutlined,
  ReloadOutlined,
  LogoutOutlined,
  PaperClipOutlined,
  ArrowLeftOutlined,
  EditOutlined,
  AppstoreOutlined,
  BarsOutlined,
  ExportOutlined,
  MenuOutlined,
  PieChartOutlined,
  CloudSyncOutlined,
} from '@ant-design/icons';
import KanbanBoard from '@/app/components/Kanban/KanbanBoard';
import SearchResults from '@/app/components/SearchResults';
import SearchInput from '@/app/components/SearchInput';
import { useAuth } from '@/contexts/AuthContext';
import { emailService } from '@/services/email';
import { searchService } from '@/services/searchService';
import apiClient from '@/services/api';
import { Mailbox, Email, ApiResponse } from '@/types/email';
import ProtectedRoute from '@/components/ProtectedRoute';
import './inbox.css';

const { Header, Sider, Content } = Layout;
const { Title, Text } = Typography;

const iconMap: Record<string, React.ReactNode> = {
  InboxOutlined: <InboxOutlined />,
  StarOutlined: <StarOutlined />,
  SendOutlined: <SendOutlined />,
  FileOutlined: <FileOutlined />,
  DeleteOutlined: <DeleteOutlined />,
  FolderOutlined: <FolderOutlined />,
};

export default function InboxPage() {
  const { user, logout } = useAuth();
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [selectedMailbox, setSelectedMailbox] = useState<string>('');
  const [emails, setEmails] = useState<Email[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [emailsLoading, setEmailsLoading] = useState(false);
  const [showMobileDetail, setShowMobileDetail] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [isComposeVisible, setIsComposeVisible] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');
  const [composeMode, setComposeMode] = useState<'compose' | 'reply' | 'forward'>('compose');
  const [replyToEmail, setReplyToEmail] = useState<Email | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalEmails, setTotalEmails] = useState(0);
  const [pageSize, setPageSize] = useState(20);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Email[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [nextPageToken, setNextPageToken] = useState<string>('');
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalEstimate, setTotalEstimate] = useState<number>(0);
  const [searchScores, setSearchScores] = useState<Record<string, number>>({});
  const [searchMode, setSearchMode] = useState<'semantic' | 'text'>('semantic');
  const [syncLoading, setSyncLoading] = useState(false);

  useEffect(() => {
    const savedView = localStorage.getItem('viewMode');
    if (savedView === 'list' || savedView === 'kanban') {
      setViewMode(savedView);
    }
  }, []);

  const handleViewToggle = (mode: 'list' | 'kanban') => {
    setViewMode(mode);
    localStorage.setItem('viewMode', mode);
    // Clear selected email when switching views to prevent popup in kanban
    setSelectedEmail(null);
    setShowMobileDetail(false);
  };

  const handleComposeClose = () => {
    setIsComposeVisible(false);
    setComposeMode('compose');
    setReplyToEmail(null);
  };

  const handleComposeSend = () => {
    setIsComposeVisible(false);
    setComposeMode('compose');
    setReplyToEmail(null);
    if (selectedMailbox === 'SENT') {
      loadEmails('SENT');
    }
  };

  const handleReply = (email: Email) => {
    setReplyToEmail(email);
    setComposeMode('reply');
    setIsComposeVisible(true);
  };

  const handleForward = (email: Email) => {
    setReplyToEmail(email);
    setComposeMode('forward');
    setIsComposeVisible(true);
  };

  const loadMailboxes = useCallback(async () => {
    try {
      const data = await emailService.getMailboxes();
      setMailboxes(data || []);
      if (data && data.length > 0) {
        const inbox = data.find(m => m.id === 'INBOX');
        setSelectedMailbox(prev => prev || (inbox ? 'INBOX' : data[0].id));
      }
    } catch (error) {
      message.error('Failed to load mailboxes');
      console.error(error);
    }
  }, [setMailboxes, setSelectedMailbox]);

  const loadEmails = useCallback(async (mailboxId: string, page: number = 1, perPage: number = pageSize) => {
    setEmailsLoading(true);
    try {
      const data = await emailService.getEmails(mailboxId, page, perPage);
      setEmails(data.emails || []);
      setTotalEmails(data.total || 0);
      setCurrentPage(page);
      setSelectedEmail(null);
    } catch (error) {
      message.error('Failed to load emails');
      console.error(error);
    } finally {
      setEmailsLoading(false);
    }
  }, [pageSize]);

  useEffect(() => {
    loadMailboxes();
  }, [loadMailboxes]);

  // Auto-generate embeddings on first visit (once per session)
  // Auto-generate embeddings periodically (every 2 minutes)
  useEffect(() => {
    const generate = () => {
      searchService.generateEmbeddings(50) // Process small batches frequentyl
        .then(result => {
          if (result.processed > 0) {
            console.log(`Auto-generated embeddings for ${result.processed} emails`);
          }
        })
        .catch(err => console.error('Auto-embedding failed:', err));
    };

    // Initial call
    generate();

    // Loop
    const interval = setInterval(generate, 2 * 60 * 1000); // 2 minutes
    return () => clearInterval(interval);
  }, []);



  useEffect(() => {
    if (selectedMailbox) {
      loadEmails(selectedMailbox);
    }
  }, [selectedMailbox, loadEmails]);

  const handlePageChange = (page: number, size?: number) => {
    const newPageSize = size || pageSize;
    if (size && size !== pageSize) {
      setPageSize(size);
    }
    loadEmails(selectedMailbox, page, newPageSize);
  };

  const handleMailboxSelect = (mailboxId: string) => {
    setSelectedMailbox(mailboxId);
    setCurrentPage(1); // Reset to page 1 when switching mailbox
    setShowMobileDetail(false);
  };

  const handleEmailSelect = async (email: Email) => {
    setSelectedEmail(email);
    setShowMobileDetail(true);

    // If body is missing (e.g. from metadata-only search), fetch full details
    if (!email.body) {
      try {
        const fullEmail = await emailService.getEmailDetail(email.id);
        setSelectedEmail(fullEmail);
      } catch (error) {
        console.error('Failed to load full email body', error);
        message.error('Failed to load email content');
      }
    }

    if (!email.isRead) {
      // Optimistic update
      setEmails(prev => prev.map(e => e.id === email.id ? { ...e, isRead: true } : e));

      // Mark as read in backend
      emailService.markAsRead(email.id).catch(err => {
        console.error('Failed to mark as read', err);
      });
    }
  };

  const handleRefresh = () => {
    loadEmails(selectedMailbox);
    message.success('Refreshed');
  };

  const handleSync = async () => {
    setSyncLoading(true);
    try {
      await emailService.syncEmails();
      message.success('Sync completed. Refreshing emails...');
      await loadEmails(selectedMailbox);
    } catch (error) {
      console.error('Sync failed:', error);
      message.error('Failed to sync emails from Gmail');
    } finally {
      setSyncLoading(false);
    }
  };

  const handleRepair = async () => {
    try {
      message.loading({ content: 'Repairing email bodies...', key: 'repairing' });
      await emailService.repairEmails();
      message.success({ content: 'Repair completed. Refreshing...', key: 'repairing' });
      loadEmails(selectedMailbox);
    } catch (error) {
      console.error('Repair failed:', error);
      message.error({ content: 'Repair failed', key: 'repairing' });
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 24) {
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    } else if (diffInHours < 48) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const handleStar = async (e: React.MouseEvent, email: Email) => {
    e.stopPropagation();

    // Store original state for rollback
    const originalStarred = email.isStarred;
    const newStarred = !email.isStarred;

    // Optimistic update FIRST (instant UI feedback)
    const updateEmails = (list: Email[]) => {
      if (selectedMailbox === 'STARRED' && !newStarred) {
        return list.filter(e => e.id !== email.id);
      }
      return list.map(e =>
        e.id === email.id ? { ...e, isStarred: newStarred } : e
      );
    };
    setEmails(updateEmails(emails));
    if (selectedEmail?.id === email.id) {
      setSelectedEmail({ ...selectedEmail, isStarred: newStarred });
    }
    message.success(originalStarred ? 'Unstarred' : 'Starred');

    // Then sync with backend (in background)
    try {
      await emailService.toggleStar(email.id, newStarred);
    } catch (error) {
      console.error('Star error:', error);
      message.error('Failed to update star, reverting...');

      // Rollback on failure
      setEmails(prev => prev.map(e =>
        e.id === email.id ? { ...e, isStarred: originalStarred } : e
      ));
      if (selectedEmail?.id === email.id) {
        setSelectedEmail(prev => prev ? { ...prev, isStarred: originalStarred } : null);
      }
    }
  };

  const handleDelete = async (e: React.MouseEvent, email: Email) => {
    e.stopPropagation();

    // Store original emails for rollback
    const originalEmails = [...emails];
    const emailIndex = emails.findIndex(em => em.id === email.id);

    // Optimistic update FIRST (instant UI feedback)
    setEmails(emails.filter(e => e.id !== email.id));
    if (selectedEmail?.id === email.id) {
      setSelectedEmail(null);
      setShowMobileDetail(false);
    }
    message.success('Email deleted');

    // Then sync with backend (in background)
    try {
      await emailService.deleteEmail(email.id);
    } catch (error) {
      console.error('Delete error:', error);
      message.error('Failed to delete email, restoring...');

      // Rollback on failure - restore the email
      const restoredEmails = [...originalEmails];
      if (emailIndex >= 0) {
        restoredEmails.splice(emailIndex, 0, email);
      }
      setEmails(originalEmails);
    }
  };

  const handleDownloadAttachment = async (emailId: string, attachmentId: string, filename: string) => {
    try {
      // Use apiClient to leverage automatic auth header and token refresh mechanisms
      // The URL returned by service includes the full path, but apiClient uses baseURL.
      // We need to parse relative path or check if apiClient handles absolute URLs (it usually does if valid).
      // However, emailService.getAttachmentUrl returns full URL from env. 
      // Let's rely on apiClient handling absolute URL override or extract path.
      // Easiest is to reconstruct relative path manually or just pass full URL if axios supports it (it does).

      const url = emailService.getAttachmentUrl(emailId, attachmentId);

      // Axios request with blob response type
      const response = await apiClient.get(url, {
        responseType: 'blob'
      });

      const blob = new Blob([response.data]);
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(downloadUrl);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Download error:', error);
      message.error('Failed to download attachment');
    }
  };

  const handleSummarize = async (email: Email) => {
    setLoadingSummary(true);
    try {
      const response = await apiClient.post<string>(`emails/${email.id}/summarize`);
      const newSummary = response.data;
      
      if (!newSummary) {
        throw new Error('Empty summary returned');
      }
      
      // Update selected email
      if (selectedEmail?.id === email.id) {
        setSelectedEmail({ 
          ...selectedEmail, 
          summary: newSummary,
          summarySource: newSummary.startsWith('[Gemini]') ? 'GEMINI' : 
                         newSummary.startsWith('[Local Algo]') ? 'LOCAL_ALGO' : 
                         newSummary.startsWith('[Local Model]') ? 'LOCAL_MODEL' : undefined
        });
      }

      // Update emails list
      setEmails(prev => prev.map(e => e.id === email.id ? { 
        ...e, 
        summary: newSummary,
        summarySource: newSummary.startsWith('[Gemini]') ? 'GEMINI' : 
                       newSummary.startsWith('[Local Algo]') ? 'LOCAL_ALGO' : 
                       newSummary.startsWith('[Local Model]') ? 'LOCAL_MODEL' : undefined
      } : e));

      message.success('Summary generated successfully');
    } catch (error) {
      console.error('Summarization failed:', error);
      message.error('Failed to generate AI summary');
    } finally {
      setLoadingSummary(false);
    }
  };

  const handleKanbanModalClose = () => {
    setSelectedEmail(null);
  };

  const handleKanbanCardClick = async (card: import('@/services/kanbanService').KanbanCardType) => {
    try {
      // Optimistic UI: Open modal immediately with available data
      const partialEmail: Email = {
        id: card.id,
        messageId: card.messageId || '', // Ensure messageId is present
        gmailMessageId: card.gmailMessageId,
        threadId: card.threadId,
        accountEmail: card.accountEmail,
        mailboxId: selectedMailbox || 'INBOX', 
        from: { name: card.sender, email: card.accountEmail || '' }, 
        to: [],
        subject: card.subject,
        preview: card.preview,
        body: '', 
        isRead: card.isRead,
        isStarred: false, 
        hasAttachments: card.hasAttachments,
        receivedAt: card.receivedAt,
        createdAt: card.receivedAt,
        summary: card.summary,
        summarySource: undefined
      };

      setSelectedEmail(partialEmail);

      // Mark as read in backend
      emailService.markAsRead(card.id);

      // Fetch full email details
      const fullEmail = await emailService.getEmailDetail(card.id);

      // Update selected email only if it's still the same one (user hasn't closed/switched)
      setSelectedEmail(prev => (prev && prev.id === card.id ? fullEmail : prev));

      // Also update the item in the list if in list mode or just cache it
      setEmails(prev => prev.map(e => e.id === card.id ? { ...e, isRead: true } : e));

    } catch (error) {
      message.error('Failed to load email details');
      console.error(error);
    }
  };

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) {
      setIsSearching(false);
      setSearchResults([]);
      setNextPageToken('');
      setTotalEstimate(0);
      setSearchScores({});
      return;
    }

    setIsSearching(true);
    setSearchLoading(true);
    setSearchResults([]);
    setNextPageToken('');
    setTotalEstimate(0);
    setSearchScores({});
    setSearchMode('semantic');

    try {
      const result = await searchService.semanticSearch(query, 20);

      // Extract emails and scores
      const emails = result.results.map(r => r.email);
      const scores: Record<string, number> = {};
      result.results.forEach(r => {
        scores[r.email.id] = r.score;
      });

      setSearchResults(emails);
      setSearchScores(scores);
      setTotalEstimate(result.total);
      // Semantic search doesn't use pagination tokens the same way
      setNextPageToken('');
    } catch (error) {
      console.error('Search failed:', error);
      message.error('Search failed');
    } finally {
      setSearchLoading(false);
    }
  };

  const handleLoadMoreSearch = async () => {
    if (!nextPageToken || loadingMore) return;

    setLoadingMore(true);
    try {
      const result = await emailService.searchEmails(searchQuery, nextPageToken);
      setSearchResults(prev => [...prev, ...(result.emails || [])]);
      setNextPageToken(result.nextPageToken);
      // Helper: Ensure estimate is consistent or use the one from first request?
      // Usually pagination doesn't change estimate much, but good to update if backend sends it.
      setTotalEstimate(result.totalEstimate);
    } catch (error) {
      console.error('Load more failed:', error);
      message.error('Failed to load more results');
    } finally {
      setLoadingMore(false);
    }
  };

  const handleClearSearch = () => {
    setIsSearching(false);
    setSearchQuery('');
    setSearchResults([]);
    setTotalEstimate(0);
  };

  return (
    <ProtectedRoute>
      <Layout style={{ height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <Header className="inbox-header" style={{
          background: '#fff',
          padding: '2px 16px', // Increased padding for 2 rows
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          zIndex: 1,
          height: 'auto',
          minHeight: '50px',
          flexWrap: 'wrap',
          gap: '12px', // Add gap for wrapping
          flexShrink: 0
        }}>
          <div className="header-title" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              className="mobile-menu-btn"
              onClick={() => setMobileDrawerOpen(true)}
              style={{ padding: '8px', border: 'none', background: 'transparent', cursor: 'pointer', display: 'none' }}
            >
              <MenuOutlined style={{ fontSize: '20px', color: '#667eea' }} />
            </button>
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl shadow text-white" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/>
                <path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/>
              </svg>
            </div>
            <Title level={4} style={{ margin: 0, whiteSpace: 'nowrap' }}>AI Email Box</Title>
          </div>

          {/* Search Bar - will order change on mobile via CSS */}
          {/* Search Bar */}
          <SearchInput onSearch={handleSearch} defaultValue={searchQuery} />

          <div className="header-actions">
            <Space>
              <div className="flex bg-gray-100 p-1 rounded-lg mr-2">
                <button
                  onClick={() => handleViewToggle('list')}
                  className={`px-3 py-1 rounded-md text-sm font-medium border-0 cursor-pointer transition-all flex items-center ${viewMode === 'list' ? 'bg-white text-gray-800 shadow-sm' : 'bg-transparent text-gray-500 hover:text-gray-700'}`}
                >
                  <BarsOutlined className="mr-1" />
                  <span className="view-mode-text">List</span>
                </button>
                <button
                  onClick={() => handleViewToggle('kanban')}
                  className={`px-3 py-1 rounded-md text-sm font-medium border-0 cursor-pointer transition-all flex items-center ${viewMode === 'kanban' ? 'bg-white text-gray-800 shadow-sm' : 'bg-transparent text-gray-500 hover:text-gray-700'}`}
                >
                  <AppstoreOutlined className="mr-1" />
                  <span className="view-mode-text">Kanban</span>
                </button>
              </div>

              <Button
                icon={<CloudSyncOutlined spin={syncLoading} />}
                onClick={handleSync}
                loading={syncLoading}
                type="text"
                className="flex items-center text-gray-400 hover:text-blue-600 transition-colors"
                title="Sync with Gmail"
              >
                <span className="sync-btn-text">Sync</span>
              </Button>

              <Button
                icon={<ReloadOutlined />}
                onClick={handleRepair}
                type="text"
                className="flex items-center text-gray-400 hover:text-orange-600 transition-colors"
                title="Repair email content"
              >
                <span className="sync-btn-text">Repair</span>
              </Button>

              <Dropdown
                menu={{
                  items: [
                    {
                      key: 'user-info',
                      label: (
                        <div style={{ padding: '8px 0' }}>
                          <Text strong>{user?.name || 'User'}</Text>
                          <br />
                          <Text type="secondary" style={{ fontSize: '12px' }}>{user?.email}</Text>
                        </div>
                      ),
                      disabled: true,
                    },
                    { type: 'divider' },
                    {
                      key: 'statistics',
                      icon: <PieChartOutlined />,
                      label: 'Statistics',
                      onClick: () => window.location.href = '/statistics',
                    },
                    { type: 'divider' },
                    {
                      key: 'logout',
                      icon: <LogoutOutlined />,
                      label: 'Logout',
                      danger: true,
                      onClick: logout,
                    },
                  ],
                }}
                trigger={['click']}
                placement="bottomRight"
              >
                <Avatar
                  style={{ backgroundColor: '#667eea', cursor: 'pointer' }}
                  size="default"
                >
                  {user?.name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || 'U'}
                </Avatar>
              </Dropdown>
            </Space>
          </div>
        </Header>

        {isSearching ? (
          <Content style={{ flex: 1, overflow: 'hidden' }}>
            <SearchResults
              results={searchResults}
              loading={searchLoading}
              onSelect={handleEmailSelect}
              onClose={handleClearSearch}
              searchQuery={searchQuery}
              onLoadMore={handleLoadMoreSearch}
              loadingMore={loadingMore}
              hasMore={!!nextPageToken}
              totalEstimate={totalEstimate}
              scores={searchScores}
              searchMode={searchMode}
            />
            {/* Reusing the Modal for details if an item is clicked from search results */}
            <Modal
              title={null}
              footer={null}
              open={!!selectedEmail}
              onCancel={() => setSelectedEmail(null)} // Close detail only
              width={1000}
              centered
              destroyOnHidden
              styles={{ body: { padding: 0, height: '80vh', overflow: 'hidden' } }}
            >
              <div className="h-full overflow-y-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                {selectedEmail && (
                  <EmailDetail
                    email={selectedEmail}
                    onBack={() => setSelectedEmail(null)}
                    onStar={handleStar}
                    onDelete={(e, email) => {
                      handleDelete(e, email);
                      setSelectedEmail(null);
                      // Update search results? Ideally yes, but tricky without re-search
                      setSearchResults(prev => prev.filter(p => p.id !== email.id));
                    }}
                    onReply={handleReply}
                    onForward={handleForward}
                    onSummarize={handleSummarize}
                    loadingSummary={loadingSummary}
                    onDownloadAttachment={handleDownloadAttachment}
                    showMobileDetail={false}
                  />
                )}
              </div>
            </Modal>
          </Content>
        ) : viewMode === 'kanban' ? (
          <Content style={{ flex: 1, overflow: 'hidden', background: '#fff' }}>
            <KanbanBoard onCardClick={handleKanbanCardClick} />

            {/* Modal for Kanban Detail View */}
            <Modal
              title={null}
              footer={null}
              open={!!selectedEmail}
              onCancel={handleKanbanModalClose}
              width={1000} // Wide modal to mimic list view detail
              centered
              destroyOnHidden
              styles={{ body: { padding: 0, height: '80vh', overflow: 'hidden' } }}
            >
              <div className="h-full overflow-y-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                {selectedEmail && (
                  <EmailDetail
                    email={selectedEmail}
                    onBack={handleKanbanModalClose} // "Back" button also acts as close
                    onStar={handleStar}
                    onDelete={(e, email) => {
                      handleDelete(e, email);
                      handleKanbanModalClose(); // Close modal on delete
                    }}
                    onReply={handleReply}
                    onForward={handleForward}
                    onSummarize={handleSummarize}
                    loadingSummary={loadingSummary}
                    onDownloadAttachment={handleDownloadAttachment}
                    showMobileDetail={false}
                  />
                )}
              </div>
            </Modal>
          </Content>
        ) : (
          <Layout className="main-layout" style={{ flex: 1, overflow: 'hidden' }}>
            {/* Left Sidebar - Mailboxes */}
            <Sider
              width={250}
              theme="light"
              style={{
                borderRight: '1px solid #f0f0f0',
                overflowY: 'auto', // Enable vertical scrolling
                height: '100%',
                // On mobile: hide if detail is shown OR if email list is shown (technically list is always shown on mobile unless detail is open)
                // But we want Sider to be hidden on mobile generally unless toggled? 
                // For simplicity: Mobile view = Stack. 
                // If showMobileDetail is true, hide Sider.
                // If showMobileDetail is false, show Sider? No, usually Sider is hidden behind a menu or takes full width.
                // Let's make Sider hidden on small screens and use a Drawer or just stack it.
                // For this assignment: 3-column on desktop, 1-column on mobile.
                // Mobile: Mailbox List -> Email List -> Email Detail.
                // So we need another state for "Show Mailbox List".
                // Let's assume: Desktop = All 3 visible. Mobile = One active view.
              }}
              breakpoint="lg"
              collapsedWidth="0"
              className={`mailbox-sider ${showMobileDetail ? 'hidden-mobile' : ''}`}
            >
              <div style={{ padding: '16px' }}>
                <Button
                  type="primary"
                  icon={<EditOutlined />}
                  block
                  size="large"
                  onClick={() => setIsComposeVisible(true)}
                  style={{ borderRadius: '24px', height: '48px' }}
                >
                  Compose
                </Button>
              </div>
              <Menu
                mode="inline"
                selectedKeys={[selectedMailbox]}
                style={{ height: '100%', borderRight: 0 }}
                items={mailboxes.map((mailbox) => ({
                  key: mailbox.id,
                  icon: iconMap[mailbox.icon] || <FolderOutlined />,
                  onClick: () => handleMailboxSelect(mailbox.id),
                  label: (
                    <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                      <span>{mailbox.name}</span>
                      {mailbox.unreadCount > 0 && (
                        <Badge count={mailbox.unreadCount} style={{ backgroundColor: '#667eea' }} />
                      )}
                    </span>
                  ),
                }))}
              />
            </Sider>

            {/* Mobile Drawer for Sidebar */}
            <Drawer
              title="Mailboxes"
              placement="left"
              onClose={() => setMobileDrawerOpen(false)}
              open={mobileDrawerOpen}
              width={280}
              styles={{ body: { padding: 0 } }}
            >
              <div style={{ padding: '16px' }}>
                <Button
                  type="primary"
                  icon={<EditOutlined />}
                  block
                  size="large"
                  onClick={() => {
                    setIsComposeVisible(true);
                    setMobileDrawerOpen(false);
                  }}
                  style={{ marginBottom: '16px', borderRadius: '24px', height: '48px' }}
                >
                  Compose
                </Button>
              </div>
              <Menu
                mode="inline"
                selectedKeys={[selectedMailbox]}
                style={{ borderRight: 0 }}
                items={mailboxes.map((mailbox) => ({
                  key: mailbox.id,
                  icon: iconMap[mailbox.icon] || <FolderOutlined />,
                  onClick: () => {
                    handleMailboxSelect(mailbox.id);
                    setMobileDrawerOpen(false);
                  },
                  label: (
                    <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                      <span>{mailbox.name}</span>
                      {mailbox.unreadCount > 0 && (
                        <Badge count={mailbox.unreadCount} style={{ backgroundColor: '#667eea' }} />
                      )}
                    </span>
                  ),
                }))}
              />
            </Drawer>

            {/* Middle - Email List */}
            <Layout
              style={{
                display: showMobileDetail ? 'none' : 'flex',
                borderRight: '1px solid #f0f0f0',
                flexDirection: 'column',
                height: '100%',
                overflow: 'hidden'
              }}
              className="email-list-layout"
            >
              <div style={{
                padding: '16px',
                background: '#fff',
                borderBottom: '1px solid #f0f0f0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexShrink: 0
              }}>
                <Title level={5} style={{ margin: 0 }}>
                  {mailboxes.find(m => m.id === selectedMailbox)?.name || 'Emails'}
                </Title>
                <Button icon={<ReloadOutlined />} onClick={handleRefresh} loading={emailsLoading}>
                  Refresh
                </Button>
              </div>

              <Content style={{ padding: '8px', overflowY: 'auto', flex: 1 }}>
                {emailsLoading ? (
                  <div style={{ textAlign: 'center', padding: '48px' }}>
                    <Spin size="large" />
                  </div>
                ) : emails.length === 0 ? (
                  <Empty description="No emails" style={{ marginTop: '48px' }} />
                ) : (
                  <List
                    dataSource={emails}
                    renderItem={(email) => (
                      <Card
                        hoverable
                        style={{
                          marginBottom: '8px',
                          cursor: 'pointer',
                          backgroundColor: email.isRead ? '#fff' : '#f6f8fa',
                          borderLeft: selectedEmail?.id === email.id ? '3px solid #667eea' : '3px solid transparent'
                        }}
                        styles={{ body: { padding: '12px 16px' } }}
                        onClick={() => handleEmailSelect(email)}
                      >
                        <Space direction="vertical" style={{ width: '100%' }} size={4}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Space>
                              {!email.isRead && (
                                <div className="w-2 h-2 rounded-full bg-blue-600" style={{ marginRight: -4 }} />
                              )}
                              <Text strong={!email.isRead} style={{ fontSize: '14px', color: !email.isRead ? '#262626' : '#595959' }}>
                                {email?.from?.name || email?.from?.email || 'Unknown Sender'}
                              </Text>
                              <div onClick={(e) => handleStar(e, email)}>
                                {email.isStarred ? <StarOutlined style={{ color: '#faad14' }} /> : <StarOutlined style={{ color: '#d9d9d9' }} />}
                              </div>
                              {email.hasAttachments && <PaperClipOutlined />}
                            </Space>
                            <Text type="secondary" style={{ fontSize: '12px' }}>
                              {formatDate(email.receivedAt)}
                            </Text>
                          </div>
                          <Text strong={!email.isRead} style={{ fontSize: '13px' }}>
                            {email.subject}
                          </Text>
                          <Text type="secondary" ellipsis style={{ fontSize: '12px' }}>
                            {email.preview}
                          </Text>
                        </Space>
                      </Card>
                    )}
                  />
                )}

                {/* Pagination */}
                {!emailsLoading && emails.length > 0 && (
                  <div style={{
                    padding: '16px',
                    textAlign: 'center',
                    borderTop: '1px solid #f0f0f0',
                    background: '#fff'
                  }}>
                    <Pagination
                      current={currentPage}
                      total={totalEmails}
                      pageSize={pageSize}
                      onChange={handlePageChange}
                      showSizeChanger
                      showQuickJumper
                      showTotal={(total, range) => `${range[0]}-${range[1]} of ${total} emails`}
                      pageSizeOptions={['10', '20', '50', '100']}
                    />
                  </div>
                )}
              </Content>
            </Layout>

            {/* Right - Email Detail */}
            <Content
              style={{
                background: '#fff',
                padding: showMobileDetail ? '0' : '24px',
                overflowY: 'auto',
                height: '100%',
                display: showMobileDetail ? 'block' : undefined,
                scrollbarWidth: 'none',
                msOverflowStyle: 'none',
                flex: 1
              }}
              className={`email-detail-content ${!showMobileDetail ? 'hidden-mobile' : ''} [&::-webkit-scrollbar]:hidden`}
            >
              <EmailDetail
                email={selectedEmail}
                onBack={() => setShowMobileDetail(false)}
                onStar={handleStar}
                onDelete={handleDelete}
                onReply={handleReply}
                onForward={handleForward}
                onSummarize={handleSummarize}
                loadingSummary={loadingSummary}
                onRefresh={async (email) => {
                  try {
                    message.loading({ content: 'Refreshing email content...', key: 'refreshing-email' });
                    await emailService.refreshEmail(email.id);
                    const updated = await emailService.getEmailDetail(email.id);
                    setSelectedEmail(updated);
                    // Update the email in the list as well
                    setEmails(prev => prev.map(e => e.id === email.id ? updated : e));
                    message.success({ content: 'Email content refreshed!', key: 'refreshing-email' });
                  } catch (error) {
                    message.error({ content: 'Refresh failed', key: 'refreshing-email' });
                  }
                }}
                onDownloadAttachment={handleDownloadAttachment}
                showMobileDetail={showMobileDetail}
              />
            </Content>
          </Layout>
        )}

        <ComposeModal
          visible={isComposeVisible}
          onCancel={handleComposeClose}
          onSend={handleComposeSend}
          mode={composeMode}
          originalEmail={replyToEmail ? {
            id: replyToEmail.id,
            threadId: replyToEmail.threadId,
            from: replyToEmail.from,
            to: replyToEmail.to,
            subject: replyToEmail.subject,
            body: replyToEmail.body,
            receivedAt: replyToEmail.receivedAt
          } : undefined}
        />
      </Layout>
    </ProtectedRoute>
  );
}
