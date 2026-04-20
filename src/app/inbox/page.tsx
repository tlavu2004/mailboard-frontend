'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Layout, Menu, List, Card, Button, Badge, Typography, Space, Avatar, Spin, message, Empty, Modal, Pagination, Dropdown, Drawer } from 'antd';
import EmailDetail from '@/app/components/EmailDetail';
import ComposeModal from '@/components/ComposeModal';
import {
  InboxOutlined,
  StarOutlined,
  StarFilled,
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
  CloudOutlined,
  LinkOutlined,
} from '@ant-design/icons';
import KanbanBoard from '@/app/components/Kanban/KanbanBoard';
import SearchResults from '@/app/components/SearchResults';
import SearchInput from '@/app/components/SearchInput';
import FilterBar, { FilterState, SortMode } from '@/app/components/FilterBar';
import { useAuth } from '@/contexts/AuthContext';
import { emailService } from '@/services/email';
import { searchService } from '@/services/searchService';
import { kanbanService } from '@/services/kanbanService';
import apiClient from '@/services/api';
import { Mailbox, Email, ApiResponse } from '@/types/email';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useEmailNotifications } from '@/hooks/useEmailNotifications';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import KeyboardHelpModal from '@/app/components/KeyboardHelpModal';
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
  const [accountId, setAccountId] = useState<number | null>(null);
  const [kanbanSettingsOpen, setKanbanSettingsOpen] = useState(false);
  const [editingColumnId, setEditingColumnId] = useState<string | undefined>(undefined);
  const [autoAddColumn, setAutoAddColumn] = useState(false);
  const [triggerAddColumn, setTriggerAddColumn] = useState(false);
  const [listWidth, setListWidth] = useState(400);
  const [sidebarWidth, setSidebarWidth] = useState(260);
  const [isResizing, setIsResizing] = useState(false);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalEmails, setTotalEmails] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const totalPages = pageSize > 0 ? Math.max(1, Math.ceil(totalEmails / pageSize)) : 1;

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

  // Filter & Sort state
  const [filters, setFilters] = useState<FilterState>({
    unread: false,
    hasAttachment: false,
  });
  const [sortMode, setSortMode] = useState<SortMode>('date-desc');
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const [isKeyboardHelpVisible, setIsKeyboardHelpVisible] = useState(false);

  // Refs
  const searchInputRef = useRef<any>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const scrollToEmailInList = useCallback((emailId: string | number) => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const tryScroll = (attempts = 0) => {
      const el = container.querySelector(`#email-item-${emailId}`) as HTMLElement | null;
      if (el) {
        const top = el.offsetTop;
        container.scrollTo({ top: Math.max(0, top - 8), behavior: 'smooth' });
        return;
      }
      if (attempts < 6) {
        setTimeout(() => tryScroll(attempts + 1), 100);
      }
    };

    tryScroll();
  }, []);

  // Reset active index when emails or view mode change
  useEffect(() => {
    setActiveIndex(-1);
  }, [emails, viewMode, selectedMailbox]);

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

  const loadMailboxes = useCallback(async (): Promise<string | null> => {
    try {
      console.log('[InboxPage] loadMailboxes: starting...');
      const data = await emailService.getMailboxes();
      console.log('[InboxPage] loadMailboxes: got', data.mailboxes?.length, 'mailboxes, accountId:', data.accountId);
      setMailboxes(data.mailboxes || []);
      if (data.accountId) {
        setAccountId(data.accountId);
      }
      if (data.mailboxes && data.mailboxes.length > 0) {
        const inbox = data.mailboxes.find(m => m.id === 'INBOX');
        const targetMailbox = inbox ? 'INBOX' : data.mailboxes[0].id;
        setSelectedMailbox(prev => prev || targetMailbox);
        return targetMailbox;
      }
      return null;
    } catch (error) {
      console.error('[InboxPage] loadMailboxes: FAILED', error);
      message.error('Failed to load mailboxes');
      return null;
    }
  }, [setMailboxes, setSelectedMailbox]);

  const loadEmails = useCallback(async (
    mailboxId: string,
    page: number = 1,
    perPage: number = pageSize,
    unread?: boolean,
    hasAttachments?: boolean,
    sortByParam?: string,
    sortOrderParam?: string
  ) => {
    if (!mailboxId) {
      console.warn('[InboxPage] loadEmails: skipped, no mailboxId');
      return;
    }

    // Determine sorting
    let finalSortBy = sortByParam;
    let finalSortOrder = sortOrderParam;

    if (!finalSortBy || !finalSortOrder) {
      const parts = sortMode.split('-');
      finalSortBy = parts[0];
      finalSortOrder = parts[1] || 'desc';
    }

    console.log('[InboxPage] loadEmails: loading', mailboxId, 'page', page, 'sort', finalSortBy, finalSortOrder);
    setEmailsLoading(true);
    try {
      let data = await emailService.getEmails(
        mailboxId,
        page,
        perPage,
        unread,
        hasAttachments,
        finalSortBy,
        finalSortOrder
      );
      console.log('[InboxPage] loadEmails: raw response:', JSON.stringify(data).substring(0, 200));

      // Robust unwrapping: If data itself is an ApiResponse (success/data), unwrap it manually
      if (data && (data as any).success !== undefined && (data as any).data !== undefined) {
        console.log('[InboxPage] loadEmails: unwrapping nested ApiResponse');
        data = (data as any).data;
      }

      const emailList = data.emails || [];
      console.log('[InboxPage] loadEmails: found', emailList.length, 'emails, total:', data.total);
      setEmails(emailList);
      setTotalEmails(data.total || 0);
      setCurrentPage(page);
      setSelectedEmail(null);

      // Background enrichment: for items that claim attachments but lack metadata,
      // fetch full detail for a small number to populate attachments quickly.
      (async () => {
        try {
          const toEnrich = (emailList || []).filter(e => e.hasAttachments && (!e.attachments || e.attachments.length === 0)).slice(0, 6);
          if (toEnrich.length > 0) {
            console.log('[InboxPage] Enriching attachments for', toEnrich.length, 'emails');
            for (const partial of toEnrich) {
              try {
                const full = await emailService.getEmailDetail(partial.id);
                setEmails(prev => prev.map(p => p.id === full.id ? { ...p, ...full } : p));
                setSelectedEmail(prev => prev && prev.id === full.id ? full : prev);
              } catch (err) {
                console.warn('[InboxPage] Enrich failed for', partial.id, err);
              }
            }
          }
        } catch (e) {
          console.warn('[InboxPage] Attachment enrichment error', e);
        }
      })();
    } catch (error) {
      console.error('[InboxPage] loadEmails: FAILED', error);
      message.error('Failed to load emails');
    } finally {
      setEmailsLoading(false);
    }
  }, [pageSize, sortMode]);

  // Primary initialization: load mailboxes THEN load emails in sequence
  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      console.log('[InboxPage] init: starting mailbox + email load sequence');
      const mailboxId = await loadMailboxes();
      if (cancelled) return;
      if (mailboxId) {
        console.log('[InboxPage] init: mailboxes loaded, now loading emails for', mailboxId);
        await loadEmails(mailboxId, 1, pageSize, filters.unread, filters.hasAttachment);
      } else {
        console.warn('[InboxPage] init: no mailbox returned, emails will not load');
      }
    };
    init();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When selectedMailbox changes AFTER initial load (e.g. user clicks sidebar), reload emails
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  useEffect(() => {
    if (!initialLoadDone && selectedMailbox) {
      // Mark initial load as done after first selectedMailbox is set
      setInitialLoadDone(true);
      return;
    }
    if (initialLoadDone && selectedMailbox) {
      console.log('[InboxPage] selectedMailbox/sort/filter changed to', selectedMailbox, '- reloading emails');
      loadEmails(selectedMailbox, 1, pageSize, filters.unread, filters.hasAttachment);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMailbox, filters.unread, filters.hasAttachment, sortMode, pageSize]);

  // Auto-generate embeddings periodically (every 2 minutes)
  useEffect(() => {
    const generate = () => {
      // If navigator says offline OR user is not logged in, skip immediately
      if (!navigator.onLine || !user) return;

      searchService.generateEmbeddings(50)
        .then(result => {
          if (result.processed > 0) {
            console.log(`Auto-generated embeddings for ${result.processed} emails`);
          }
        })
        .catch(err => {
          // If it's a network error, it's expected when offline
          if (err.message === 'Network Error' || !navigator.onLine) {
            console.warn('[Embeddings] Network unavailable, skipping this attempt.');
          } else {
            console.error('[Embeddings] Auto-generation failed:', err);
          }
        });
    };

    generate();
    const interval = setInterval(generate, 2 * 60 * 1000);
    return () => {
      clearInterval(interval);
    };
  }, []);

  const handlePageChange = (page: number, size?: number) => {
    const newPageSize = size || pageSize;
    if (size && size !== pageSize) {
      setPageSize(size);
    }
    loadEmails(selectedMailbox, page, newPageSize, filters.unread, filters.hasAttachment);
  };

  const handleMailboxSelect = (mailboxId: string) => {
    setSelectedMailbox(mailboxId);
    setCurrentPage(1); // Reset to page 1 when switching mailbox
    setShowMobileDetail(false);
  };

  const handleEmailSelect = async (email: Email) => {
    setSelectedEmail(email);
    setShowMobileDetail(true);

    // If body is missing OR if we expect attachments but don't have them yet, fetch full details
    const needsDetail = !email.body || (email.hasAttachments && (!email.attachments || email.attachments.length === 0));

    if (needsDetail) {
      try {
        const fullEmail = await emailService.getEmailDetail(email.id);
        console.log('[InboxPage] Fetched full email detail for', fullEmail.id, 'attachmentsCount=', fullEmail.attachments?.length);
        setSelectedEmail(prev => (prev ? { ...prev, ...fullEmail } : fullEmail));
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
    loadEmails(selectedMailbox, 1, pageSize, filters.unread, filters.hasAttachment);
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


  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 992);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Unified Resizing Logic (Sidebar & List)
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizingSidebar) {
        const newWidth = e.clientX;
        if (newWidth > 180 && newWidth < 450) {
          setSidebarWidth(newWidth);
        }
      } else if (isResizing) {
        // Calculate relative to sidebarWidth to avoid jitter and hardcoding
        const newWidth = e.clientX - sidebarWidth;
        // Enforce a minimum width of 400px to prevent truncation of pagination text
        if (newWidth >= 400 && newWidth < 800) {
          setListWidth(newWidth);
        }
      }
    };

    const stopResizing = () => {
      setIsResizing(false);
      setIsResizingSidebar(false);
      document.body.style.cursor = 'default';
      document.body.classList.remove('resizing');
    };

    if (isResizing || isResizingSidebar) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', stopResizing);
      document.body.style.cursor = 'col-resize';
      document.body.classList.add('resizing');
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [isResizing, isResizingSidebar, sidebarWidth]);

  // Handlers
  // real-time notifications
  const handleNotification = useCallback((msg: any) => {
    console.log('[InboxPage] WebSocket notification received:', msg);
    if (msg?.type === 'NEW_EMAILS') {
      // If backend provided specific email IDs, fetch them and insert into UI immediately
      if (Array.isArray(msg.emailIds) && msg.emailIds.length > 0) {
        message.info('New emails received! Updating view...');
        (async () => {
          try {
            for (const id of msg.emailIds) {
              try {
                const full = await emailService.getEmailDetail(String(id));
                setEmails(prev => {
                  // Avoid duplicates
                  const exists = prev.some(e => e.id === full.id);
                  if (exists) {
                    // Replace existing entry with fresh data
                    return prev.map(e => e.id === full.id ? full : e);
                  }
                  // Prepend newest message
                  const next = [full, ...prev];
                  // Keep list size bounded to pageSize
                  // Update total count when a truly new email arrives
                  setTotalEmails(t => t + (exists ? 0 : 1));
                  return next.slice(0, pageSize);
                });
              } catch (err) {
                console.warn('[InboxPage] Failed to fetch new email detail for id', id, err);
              }
            }
            // No automatic navigation/scroll requested — UI updated in-place
          } catch (e) {
            console.warn('[InboxPage] Error processing NEW_EMAILS payload', e);
            // Fallback to full refresh
            setTimeout(() => {
              loadMailboxes();
              loadEmails(selectedMailbox, 1, pageSize, filters.unread, filters.hasAttachment);
            }, 500);
          }
        })();
      } else {
        // Generic fallback: refresh mailbox list and current mailbox view
        message.info('New emails received! Syncing...');
        setTimeout(() => {
          loadMailboxes();
          loadEmails(selectedMailbox, 1, pageSize, filters.unread, filters.hasAttachment);
        }, 500);
      }
    }
  }, [selectedMailbox, loadMailboxes, loadEmails, pageSize, filters]);

  useEmailNotifications(accountId, handleNotification);

  // Keyboard Shortcuts
  useKeyboardShortcuts({
    'j': () => {
      if (viewMode === 'list' && emails.length > 0) {
        setActiveIndex(prev => Math.min(prev + 1, emails.length - 1));
      }
    },
    'k': () => {
      if (viewMode === 'list' && emails.length > 0) {
        setActiveIndex(prev => Math.max(prev - 1, 0));
      }
    },
    'Enter': () => {
      if (viewMode === 'list' && activeIndex >= 0 && activeIndex < emails.length) {
        handleEmailSelect(emails[activeIndex]);
      }
    },
    'c': () => setIsComposeVisible(true),
    'r': () => {
      if (selectedEmail) handleReply(selectedEmail);
      else if (activeIndex >= 0) handleReply(emails[activeIndex]);
    },
    'f': () => {
      if (selectedEmail) handleForward(selectedEmail);
      else if (activeIndex >= 0) handleForward(emails[activeIndex]);
    },
    '#': () => {
      const emailToDelete = selectedEmail || (activeIndex >= 0 ? emails[activeIndex] : null);
      if (emailToDelete) handleDelete(new MouseEvent('click') as any, emailToDelete);
    },
    'Delete': () => {
      const emailToDelete = selectedEmail || (activeIndex >= 0 ? emails[activeIndex] : null);
      if (emailToDelete) handleDelete(new MouseEvent('click') as any, emailToDelete);
    },
    'Escape': () => {
      if (selectedEmail) {
        setSelectedEmail(null);
        setShowMobileDetail(false);
      }
      if (isComposeVisible) handleComposeClose();
      if (isSearching) handleSearch('');
      setActiveIndex(-1);
    },
    '/': (e) => {
      e.preventDefault();
      if (searchInputRef.current) searchInputRef.current.focus();
    },
    '?': () => setIsKeyboardHelpVisible(true)
  });

  const handleSnooze = async (emailId: string, until: string) => {
    try {
      message.loading({ content: 'Snoozing email...', key: 'snooze' });
      await kanbanService.snoozeCard(emailId, until);
      // Notify Kanban board (in case snooze was triggered from a modal or list)
      try {
        window.dispatchEvent(new CustomEvent('kanban:snoozed', { detail: { emailId, until } }));
      } catch (err) {
        // ignore in non-browser contexts
      }
      message.success({ content: 'Email snoozed!', key: 'snooze' });
      setSelectedEmail(null);
      setShowMobileDetail(false);
      loadEmails(selectedMailbox);
    } catch (error) {
      console.error('Snooze failed:', error);
      message.error({ content: 'Snooze failed', key: 'snooze' });
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
      if (selectedMailbox === 'STARRED' && !newStarred) {
        setSelectedEmail(null);
      } else {
        setSelectedEmail({ ...selectedEmail, isStarred: newStarred });
      }
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
      // Use the URL from the backend if available, otherwise construct the new format
      const attachment = selectedEmail?.attachments?.find(a => a.id === attachmentId || a.serverAttachmentId === attachmentId);
      const url = attachment?.url || `emails/${emailId}/attachments/${attachmentId}/download`;

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
    // Avoid calling backend if this email already has a Gemini-generated summary
    if (email.summarySource === 'GEMINI' && email.summary) {
      message.info('Already summarized by Gemini');
      return;
    }

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
        hasCloudLinks: card.hasCloudLinks,
        hasPhysicalAttachments: card.hasPhysicalAttachments,
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
        {/* TOP TOOLBAR - Minimalist & Stable */}
        <Header className="top-toolbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }} onClick={() => handleMailboxSelect('INBOX')}>
              <div className="inline-flex items-center justify-center w-8 h-8 rounded-lg shadow-sm text-white" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
                  <path d="M20 3v4" /><path d="M22 5h-4" /><path d="M4 17v2" /><path d="M5 18H3" />
                </svg>
              </div>
              <Title level={4} style={{ margin: 0, color: '#1a1a1a', letterSpacing: '-0.5px', fontWeight: 700 }}>MailBoard</Title>
            </div>
          </div>

          <div style={{ flex: 1, maxWidth: '600px', margin: '0 24px' }}>
            {/* Search Bar Refactored for Stability */}
            <SearchInput
              onSearch={handleSearch}
              defaultValue={searchQuery}
              ref={searchInputRef}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div className="flex bg-gray-100 p-1 rounded-lg mr-2">
              <button
                onClick={() => handleViewToggle('list')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium border-0 cursor-pointer transition-all ${viewMode === 'list' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500'}`}
              >
                <BarsOutlined /> <span>List</span>
              </button>
              <button
                onClick={() => handleViewToggle('kanban')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium border-0 cursor-pointer transition-all ${viewMode === 'kanban' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500'}`}
              >
                <AppstoreOutlined /> <span>Kanban</span>
              </button>
            </div>
            {/* Sync button removed as it is now in FilterBar */}
          </div>
        </Header>


        <Layout className="main-layout" style={{ flex: 1, overflow: 'hidden' }}>
          {/* GLOBAL LEFT SIDEBAR - Unified for all views */}
          <Sider
            width={sidebarWidth}
            theme="light"
            breakpoint="lg"
            collapsedWidth="0"
            className="mailbox-sider hidden-mobile"
            trigger={null}
            style={{
              transition: isResizingSidebar ? 'none' : 'width 0.2s ease',
              flex: '0 0 auto'
            }}
          >
            <div className="sidebar-container">
              {/* Branding removed: now in top header */}
              <div style={{ height: '16px' }} />

              {/* Sidebar Content: Compose & Mailboxes */}
              <div className="sidebar-content">
                <div style={{ padding: '0 8px 16px 8px' }}>
                  <Button
                    type="primary"
                    icon={<EditOutlined />}
                    block
                    size="large"
                    onClick={() => setIsComposeVisible(true)}
                    style={{ borderRadius: '12px', height: '48px', boxShadow: '0 4px 12px rgba(102, 126, 234, 0.25)' }}
                  >
                    Compose
                  </Button>
                </div>
                <Menu
                  mode="inline"
                  selectedKeys={[selectedMailbox]}
                  style={{ border: 'none' }}
                  items={mailboxes.map((mailbox) => ({
                    key: mailbox.id,
                    icon: iconMap[mailbox.icon] || <FolderOutlined />,
                    onClick: () => handleMailboxSelect(mailbox.id),
                    label: (
                      <div className="flex justify-between items-center w-full">
                        <span>{mailbox.name}</span>
                        {mailbox.unreadCount > 0 && (
                          <Badge count={mailbox.unreadCount} style={{ backgroundColor: '#667eea', boxShadow: 'none' }} />
                        )}
                      </div>
                    ),
                  }))}
                />
              </div>

              {/* Sidebar Footer: User Profile */}
              <div className="sidebar-footer">
                <div className="flex items-center justify-between p-2 rounded-xl border border-gray-100 bg-white">
                  <div className="flex items-center gap-3">
                    <Avatar style={{ backgroundColor: '#667eea' }}>
                      {user?.name?.charAt(0)?.toUpperCase()}
                    </Avatar>
                    <div className="flex flex-col">
                      <Text strong style={{ fontSize: '13px', lineHeight: 1.2 }}>{user?.name}</Text>
                      <Text type="secondary" style={{ fontSize: '11px' }}>{user?.email?.split('@')[0]}</Text>
                    </div>
                  </div>
                  <Dropdown
                    menu={{
                      items: [
                        { key: 'stats', icon: <PieChartOutlined />, label: 'Statistics', onClick: () => window.location.href = '/statistics' },
                        { type: 'divider' },
                        { key: 'logout', icon: <LogoutOutlined />, label: 'Logout', danger: true, onClick: logout }
                      ]
                    }}
                    trigger={['click']}
                  >
                    <Button type="text" icon={<ExportOutlined style={{ color: '#8c8c8c' }} />} />
                  </Dropdown>
                </div>
              </div>
            </div>
          </Sider>

          {/* Sidebar Resize Handle */}
          <div
            className={`resize-handle hidden-mobile ${isResizingSidebar ? 'active' : ''}`}
            onMouseDown={(e) => {
              e.preventDefault();
              setIsResizingSidebar(true);
            }}
          />

          <Layout style={{ flex: 1, overflow: 'hidden', background: '#f8fafc' }}>
            <div className="px-6 py-2">
              <FilterBar
                filters={filters}
                sortMode={sortMode}
                onFilterChange={setFilters}
                onSortChange={setSortMode}
                onSync={handleSync}
                onRefresh={handleRefresh}
                onSettings={viewMode === 'kanban' ? () => setKanbanSettingsOpen(true) : undefined}
                syncLoading={syncLoading}
                refreshLoading={emailsLoading}
              />
            </div>

            <Content style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {isSearching ? (
                <div className="flex-1 overflow-hidden">
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
                </div>
              ) : (
                <div className="flex h-full w-full overflow-hidden relative">
                  {/* Left Column: List or Kanban */}
                  <div
                    className={`flex flex-col bg-white border-r border-gray-100 ${showMobileDetail ? (viewMode === 'list' ? 'hidden-mobile' : 'hidden') : 'flex w-full'}`}
                    style={{
                      width: viewMode === 'list' ? (selectedEmail ? `${listWidth}px` : '100%') : '100%',
                      transition: isResizing ? 'none' : 'width 0.3s ease'
                    }}
                  >
                    {viewMode === 'list' ? (
                      <>
                        <div className="p-2 border-b border-gray-100" style={{ paddingLeft: '24px' }}>
                          <Title level={5} style={{ margin: 0 }}>
                            {mailboxes.find(m => m.id === selectedMailbox)?.name || 'Inbox'}
                          </Title>
                        </div>
                        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-2 inbox-list-scroll" style={{ paddingLeft: '24px', paddingRight: '12px' }}>
                          {emailsLoading ? <div className="p-12 text-center"><Spin /></div> : (
                            <>
                              <List
                                dataSource={emails}
                                renderItem={(email, index) => (
                                  <div id={`email-item-${email.id}`} key={email.id}>
                                    <Card
                                      hoverable
                                      className={`mail-item-card cursor-pointer transition-all ${selectedEmail?.id === email.id ? 'email-card-selected' : ''}`}
                                      styles={{ body: { padding: '12px' } }}
                                      onClick={() => {
                                        setActiveIndex(index);
                                        handleEmailSelect(email);
                                      }}
                                    >
                                      <div className="flex items-start gap-3">
                                        {/* Left: Avatar */}
                                        <Avatar
                                          className="flex-shrink-0"
                                          style={{ backgroundColor: email.isRead ? '#f1f5f9' : '#e0e7ff', color: email.isRead ? '#64748b' : '#4f46e5', fontWeight: 600 }}
                                        >
                                          {email.from.name ? email.from.name.charAt(0).toUpperCase() : '?'}
                                        </Avatar>

                                        {/* Middle: Content */}
                                        <div className="flex-1 min-w-0">
                                          <div className="flex justify-between items-start mb-0.5">
                                            <div className="flex items-center gap-2 min-w-0">
                                              {!email.isRead && <div className="unread-dot flex-shrink-0" />}
                                              <Text strong={!email.isRead} className="mail-item-sender truncate">
                                                {email.from.name}
                                              </Text>
                                              <div className="flex items-center gap-1 flex-shrink-0">
                                                {email.hasPhysicalAttachments && (
                                                  <PaperClipOutlined style={{ fontSize: '11px', color: '#94a3b8' }} />
                                                )}
                                                {email.hasCloudLinks && (
                                                  <CloudOutlined style={{ fontSize: '11px', color: '#3b82f6' }} />
                                                )}
                                              </div>
                                            </div>

                                            <div className="flex items-center gap-2 flex-shrink-0">
                                              <div
                                                onClick={(e) => handleStar(e, email)}
                                                className="cursor-pointer hover:scale-125 transition-transform duration-200"
                                              >
                                                {email.isStarred ? (
                                                  <StarFilled style={{ color: '#f59e0b', fontSize: '15px' }} />
                                                ) : (
                                                  <StarOutlined style={{ color: '#cbd5e1', fontSize: '15px' }} />
                                                )}
                                              </div>
                                              <Text type="secondary" style={{ fontSize: '11px', whiteSpace: 'nowrap' }}>
                                                {formatDate(email.receivedAt)}
                                              </Text>
                                            </div>
                                          </div>

                                          <Text strong={!email.isRead} className="mail-item-subject block truncate">
                                            {email.subject}
                                          </Text>
                                          <Text className="mail-item-preview block truncate" style={{ marginTop: '2px' }}>
                                            {email.preview}
                                          </Text>
                                        </div>
                                      </div>
                                    </Card>
                                  </div>
                                )}
                              />
                            </>
                          )}
                        </div>

                        {/* Footer pagination: placed outside the scroll area so it stays pinned to bottom of left column */}
                        <div className="inbox-pagination-footer">
                          <div className="inbox-pagination-info">
                            {totalEmails > 0 ? `${Math.min(((currentPage - 1) * pageSize) + 1, totalEmails)}-${Math.min(currentPage * pageSize, totalEmails)} of ${totalEmails} emails` : 'No emails'}
                          </div>
                          <div className="inbox-pagination-controls compact-pagination">
                            <Pagination
                              simple
                              size="small"
                              current={currentPage}
                              total={totalEmails}
                              pageSize={pageSize}
                              onChange={handlePageChange}
                              showSizeChanger
                              pageSizeOptions={["10", "20", "50", "100"]}
                            />
                          </div>
                        </div>
                      </>
                    ) : (
                      <KanbanBoard
                        onCardClick={handleKanbanCardClick}
                        filters={filters}
                        sortMode={sortMode}
                        accountId={accountId}
                        settingsOpen={kanbanSettingsOpen}
                        onSettingsClose={() => {
                          setKanbanSettingsOpen(false);
                          setTriggerAddColumn(false);
                        }}
                        onAddColumnClick={() => {
                          setTriggerAddColumn(true);
                          setKanbanSettingsOpen(true);
                        }}
                        triggerAddOnOpen={triggerAddColumn}
                      />
                    )}
                  </div>

                  {/* Resizer Handle */}
                  {viewMode === 'list' && selectedEmail && (
                    <div
                      className={`resize-handle hidden-mobile ${isResizing ? 'active' : ''}`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setIsResizing(true);
                      }}
                    />
                  )}

                  {/* Right Column: Detail (List View only) */}
                  {selectedEmail && viewMode === 'list' && (
                    <div className={`flex-1 bg-white overflow-y-auto ${!showMobileDetail ? 'hidden-mobile flex' : 'absolute inset-0 z-50 flex md:relative md:flex'}`}>
                      <EmailDetail
                        email={selectedEmail}
                        onBack={() => {
                          setShowMobileDetail(false);
                          setSelectedEmail(null);
                        }}
                        onStar={handleStar}
                        onDelete={handleDelete}
                        onReply={handleReply}
                        onForward={handleForward}
                        onSnooze={handleSnooze}
                        onSummarize={handleSummarize}
                        loadingSummary={loadingSummary}
                        onDownloadAttachment={handleDownloadAttachment}
                        showMobileDetail={showMobileDetail}
                        showBackButton={isMobile}
                      />
                    </div>
                  )}
                </div>
              )}
            </Content>
          </Layout>
        </Layout>

        {/* Mobile Drawer */}
        <Drawer
          placement="left"
          onClose={() => setMobileDrawerOpen(false)}
          open={mobileDrawerOpen}
          width={280}
          styles={{ body: { padding: 0 } }}
          closable={false}
        >
          <div className="sidebar-container">
            <div style={{ height: '16px' }} />
            <div className="sidebar-content">
              <div style={{ padding: '0 8px 16px 8px' }}>
                <Button
                  type="primary"
                  icon={<EditOutlined />}
                  block
                  size="large"
                  onClick={() => {
                    setIsComposeVisible(true);
                    setMobileDrawerOpen(false);
                  }}
                  style={{ borderRadius: '12px', height: '48px' }}
                >
                  Compose
                </Button>
              </div>
              <Menu
                mode="inline"
                selectedKeys={[selectedMailbox]}
                style={{ border: 'none' }}
                items={mailboxes.map((mailbox) => ({
                  key: mailbox.id,
                  icon: iconMap[mailbox.icon] || <FolderOutlined />,
                  onClick: () => {
                    handleMailboxSelect(mailbox.id);
                    setMobileDrawerOpen(false);
                  },
                  label: (
                    <div className="flex justify-between items-center w-full">
                      <span>{mailbox.name}</span>
                      {mailbox.unreadCount > 0 && (
                        <Badge count={mailbox.unreadCount} style={{ backgroundColor: '#667eea', boxShadow: 'none' }} />
                      )}
                    </div>
                  ),
                }))}
              />
            </div>
          </div>
        </Drawer>

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
        <KeyboardHelpModal
          visible={isKeyboardHelpVisible}
          onClose={() => setIsKeyboardHelpVisible(false)}
        />

        {/* Kanban Email Detail Modal */}
        <Modal
          open={!!selectedEmail && viewMode === 'kanban'}
          onCancel={() => {
            setSelectedEmail(null);
            setShowMobileDetail(false);
          }}
          footer={null}
          width={1000}
          centered
          styles={{
            body: {
              padding: '0 24px 24px 24px',
              maxHeight: '85vh',
              overflowY: 'auto',
              borderRadius: '12px'
            }
          }}
          className="email-detail-modal"
          destroyOnClose
        >
          {selectedEmail && (
            <EmailDetail
              email={selectedEmail}
              onBack={() => setSelectedEmail(null)}
              onStar={handleStar}
              onDelete={handleDelete}
              onReply={handleReply}
              onForward={handleForward}
              onSnooze={handleSnooze}
              onSummarize={handleSummarize}
              loadingSummary={loadingSummary}
              onDownloadAttachment={handleDownloadAttachment}
              showMobileDetail={false}
              showBackButton={false}
            />
          )}
        </Modal>
      </Layout >
    </ProtectedRoute >
  );
}
