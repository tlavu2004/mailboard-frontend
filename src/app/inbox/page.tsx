'use client';

import { useState, useEffect, useCallback, useMemo, useRef, Suspense } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { flushSync } from 'react-dom';
import { Layout, Menu, List, Card, Button, Typography, Space, Avatar, Spin, message, Empty, Modal, Pagination, Dropdown, Drawer, notification, Alert } from 'antd';
import EmailDetail from '@/app/components/EmailDetail';
import InlineAlertContext from '@/contexts/InlineAlertContext';
import ComposeModal from '@/components/ComposeModal';
import {
  InboxOutlined,
  StarOutlined,
  StarFilled,
  ClockCircleOutlined,
  SendOutlined,
  FileTextOutlined,
  DeleteOutlined,
  FolderOutlined,
  WarningOutlined,
  MailOutlined,
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
  FileOutlined: <FileTextOutlined />,
  DeleteOutlined: <DeleteOutlined />,
  FolderOutlined: <FolderOutlined />,
};

const MAILBOX_META: Record<string, { name: string; order: number; icon: React.ReactNode }> = {
  INBOX: { name: 'Inbox', order: 10, icon: <InboxOutlined /> },
  STARRED: { name: 'Starred', order: 20, icon: <StarOutlined /> },
  SNOOZED: { name: 'Snoozed', order: 30, icon: <ClockCircleOutlined /> },
  SENT: { name: 'Sent', order: 40, icon: <SendOutlined /> },
  DRAFT: { name: 'Drafts', order: 50, icon: <FileTextOutlined /> },
  DRAFTS: { name: 'Drafts', order: 50, icon: <FileTextOutlined /> },
  IMPORTANT: { name: 'Important', order: 60, icon: <WarningOutlined /> },
  ALL_MAIL: { name: 'All Mail', order: 70, icon: <MailOutlined /> },
  TRASH: { name: 'Trash', order: 90, icon: <DeleteOutlined /> },
};

const parseAsLocalDate = (value?: string): Date => {
  if (!value) return new Date();
  const trimmed = value.trim();
  const hasTimezone = /([zZ]|[+\-]\d{2}:?\d{2})$/.test(trimmed);
  const normalized = hasTimezone ? trimmed : `${trimmed}Z`;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? new Date(trimmed) : parsed;
};

export default function InboxPage() {
  return (
    <Suspense fallback={
      <div className="flex justify-center items-center h-screen">
        <Spin size="large" tip="Loading MailBoard..." />
      </div>
    }>
      <InboxPageContent />
    </Suspense>
  );
}

function InboxPageContent() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const initialMailbox = searchParams.get('mailbox') || 'INBOX';

  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [selectedMailbox, setSelectedMailbox] = useState<string>(initialMailbox);
  const selectedMailboxRef = useRef<string>(initialMailbox);
  
  // Sync ref with state
  useEffect(() => {
    selectedMailboxRef.current = selectedMailbox;
  }, [selectedMailbox]);

  // Sync state with URL
  useEffect(() => {
    const mailboxParam = searchParams.get('mailbox');
    if (mailboxParam && mailboxParam !== selectedMailbox) {
      setSelectedMailbox(mailboxParam);
    }
  }, [searchParams]);

  const [emails, setEmails] = useState<Email[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [emailsLoading, setEmailsLoading] = useState(false);
  const [showMobileDetail, setShowMobileDetail] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [isComposeVisible, setIsComposeVisible] = useState(false);
  const isOpeningRef = useRef(false);
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');
  const [composeMode, setComposeMode] = useState<'compose' | 'reply' | 'reply-all' | 'forward'>('compose');
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

  const [inlineAlert, setInlineAlert] = useState<{ emailId: string; message: string } | null>(null);

  // Show inline no-reply banner whenever an email is opened. Avoid duplicate rendering
  // by checking the current `inlineAlert` (if it's already showing for the same
  // email we don't re-create it). We intentionally do NOT persist dismissals so
  // the banner will reappear each time the user opens the email.
  useEffect(() => {
    if (!selectedEmail) {
      setInlineAlert(null);
      return;
    }
    const senderEmail = (typeof selectedEmail.from === 'string') ? selectedEmail.from : (selectedEmail.from?.email || '');
    const localPart = String(senderEmail).split('@')[0]?.toLowerCase() || '';
    const isNoReplySender = /(?:^|[._-])(noreply|no-reply|donotreply|do-not-reply)(?:$|[._-])/.test(localPart);
    const id = selectedEmail.id ? String(selectedEmail.id) : `${senderEmail}:${selectedEmail.threadId || ''}`;
    if (isNoReplySender) {
      if (!inlineAlert || inlineAlert.emailId !== id) {
        setInlineAlert({ emailId: id, message: `${senderEmail} looks like a no-reply address. You can still try replying.` });
      }
    } else {
      setInlineAlert(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEmail]);

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

  const normalizeMailboxId = useCallback((id?: string) => String(id || '').trim().toUpperCase(), []);

  const getMailboxDisplayMeta = useCallback((mailbox: Mailbox) => {
    const normalizedId = normalizeMailboxId(mailbox.id);
    const matched = MAILBOX_META[normalizedId];

    return {
      id: mailbox.id,
      displayName: matched?.name || mailbox.name,
      order: matched?.order ?? (mailbox.type === 'custom' ? 200 : 120),
      icon: matched?.icon || iconMap[mailbox.icon] || <FolderOutlined />,
      unreadCount: mailbox.unreadCount,
      type: mailbox.type,
      rawName: mailbox.name,
    };
  }, [normalizeMailboxId]);

  const visibleMailboxes = useMemo(() => {
    return [...mailboxes]
      .filter(m => normalizeMailboxId(m.id) !== 'SPAM') // V10.40: Hide Spam folder as requested
      .map(getMailboxDisplayMeta)
      .sort((a, b) => {
        if (a.order !== b.order) return a.order - b.order;
        if (a.type !== b.type) return a.type === 'system' ? -1 : 1;
        return a.displayName.localeCompare(b.displayName);
      });
  }, [mailboxes, getMailboxDisplayMeta, normalizeMailboxId]);

  const selectedMailboxTitle = useMemo(() => {
    const selected = visibleMailboxes.find((m) => m.id === selectedMailbox);
    return selected?.displayName || 'Inbox';
  }, [visibleMailboxes, selectedMailbox]);

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

  // Persist list scroll position while user scrolls so reload can restore
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    let timeoutId: number | null = null;
    const onScroll = () => {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
      timeoutId = window.setTimeout(() => {
        try { localStorage.setItem('mb:listScrollTop', String(container.scrollTop)); } catch (e) { }
      }, 150);
    };
    container.addEventListener('scroll', onScroll);
    return () => {
      container.removeEventListener('scroll', onScroll);
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, []);

  // Restore flag/ref to avoid double-restores during init
  const isRestoringRef = useRef(false);

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

  const handleComposeSend = (sentPreview?: Email) => {
    setIsComposeVisible(false);
    setComposeMode('compose');
    setReplyToEmail(null);

    if (!sentPreview) return;

    // Optimistic UI updates
    const normalizedMailbox = selectedMailbox?.toUpperCase();
    const previewMailbox = sentPreview.mailboxId?.toUpperCase();

    // 1. If we are currently viewing the mailbox this email belongs to (SENT or DRAFTS), update the list
    if (normalizedMailbox === previewMailbox || (normalizedMailbox === 'DRAFT' && previewMailbox === 'DRAFTS')) {
      if (currentPage === 1) {
        setEmails(prev => {
          const exists = prev.some(e => e.id === sentPreview.id || (e.gmailDraftId && e.gmailDraftId === sentPreview.gmailDraftId));
          if (exists) {
            return prev.map(e => (e.id === sentPreview.id || (e.gmailDraftId && e.gmailDraftId === sentPreview.gmailDraftId)) ? sentPreview : e);
          }
          const next = [sentPreview, ...prev];
          return next.slice(0, pageSize);
        });
        setTotalEmails(prev => prev + 1);
      }
    }

    // 2. If we just sent an email and we are in DRAFTS, remove the draft if it was sent
    if ((normalizedMailbox === 'DRAFTS' || normalizedMailbox === 'DRAFT') && previewMailbox === 'SENT') {
       setEmails(prev => prev.filter(e => e.gmailDraftId !== sentPreview.gmailDraftId));
       setTotalEmails(prev => Math.max(0, prev - 1));
    }
  };

  const handleDraftUpdate = (draft: Email) => {
    const normalizedMailbox = selectedMailbox?.toUpperCase();
    
    setEmails(prev => {
      const exists = prev.some(e => e.id === draft.id || (e.gmailDraftId && e.gmailDraftId === draft.gmailDraftId));
      if (exists) {
        return prev.map(e => (e.id === draft.id || (e.gmailDraftId && e.gmailDraftId === draft.gmailDraftId)) ? draft : e);
      }
      
      // If we are currently in Drafts folder, prepend it
      if (normalizedMailbox === 'DRAFTS' || normalizedMailbox === 'DRAFT') {
        const next = [draft, ...prev];
        return next.slice(0, pageSize);
      }
      
      return prev;
    });
    
    // Update total count if it's a new draft in this view
    if (normalizedMailbox === 'DRAFTS' || normalizedMailbox === 'DRAFT') {
        setMailboxes(prev => prev.map(m => {
            if (m.id.toUpperCase() === 'DRAFTS' || m.id.toUpperCase() === 'DRAFT') {
                return { ...m, unreadCount: (m.unreadCount || 0) + 1 }; // Or just refresh mailbox list
            }
            return m;
        }));
    }
  };

  const handleReply = (email: Email) => {
    console.log('[InboxPage] handleReply invoked', email?.id, email?.from);
    if (isOpeningRef.current) return;

    const senderEmail = email.from?.email || '';
    const isNoReplySender = /no[-_]?reply/i.test(senderEmail);

    const openCompose = () => {
      console.log('[InboxPage] openCompose start', { mode: 'reply', isOpeningRef: isOpeningRef.current });
      isOpeningRef.current = true;
      try {
        flushSync(() => {
          setReplyToEmail(email);
          setComposeMode('reply');
          console.log('[InboxPage] flushSync applied reply prefill', { emailId: email?.id });
        });
        setIsComposeVisible(true);
        console.log('[InboxPage] setIsComposeVisible(true) called for reply');
      } finally {
        setTimeout(() => { isOpeningRef.current = false; console.log('[InboxPage] isOpeningRef reset after reply'); }, 50);
      }
    };

    if (isNoReplySender) {
      // Non-blocking warning: open compose immediately and show a soft notification
      openCompose();
      notification.warning({
        message: 'Reply may not be delivered',
        description: `${senderEmail} looks like a no-reply address. Your message may not be delivered.`,
        placement: 'topRight',
        duration: 6,
      });
      return;
    }

    openCompose();
  };

  const handleReplyAll = (email: Email) => {
    console.log('[InboxPage] handleReplyAll invoked', email?.id, email?.from);
    if (isOpeningRef.current) return;

    const extractAddr = (r: any) => {
      if (!r) return '';
      if (typeof r === 'string') {
        const m = r.match(/<([^>]+)>/);
        return (m ? m[1] : r).trim();
      }
      return (r.email || '').trim();
    };
    const normalizeList = (lst: any) => (Array.isArray(lst) ? lst.map(extractAddr).filter(Boolean) : []);

    const originalTo = normalizeList(email.to || []);
    const originalCc = normalizeList(email.cc || []);

    const noReplyRx = /no[-_]?reply/i;

    // Remove no-reply addresses from both to and cc
    const removedFromTo = originalTo.filter(a => noReplyRx.test(a));
    const removedFromCc = originalCc.filter(a => noReplyRx.test(a));
    const removed = Array.from(new Set([...removedFromTo, ...removedFromCc]));

    const filteredTo = originalTo.filter(a => !removed.includes(a));
    const filteredCc = originalCc.filter(a => !removed.includes(a));

    const modified: any = { ...email, to: filteredTo, cc: filteredCc, removedNoReply: removed };

    const openCompose = () => {
      console.log('[InboxPage] openCompose start', { mode: 'reply-all', isOpeningRef: isOpeningRef.current, removed });
      isOpeningRef.current = true;
      try {
        flushSync(() => {
          setReplyToEmail(modified as Email);
          setComposeMode('reply-all');
          console.log('[InboxPage] flushSync applied reply-all prefill', { emailId: modified?.id, removed });
        });
        setIsComposeVisible(true);
        console.log('[InboxPage] setIsComposeVisible(true) called for reply-all');
      } finally {
        setTimeout(() => { isOpeningRef.current = false; console.log('[InboxPage] isOpeningRef reset after reply-all'); }, 50);
      }
    };

    // Non-blocking: open compose immediately and notify about removed no-reply recipients
    openCompose();
    if (removed.length > 0) {
      notification.info({
        message: 'Reply All — removed no-reply recipients',
        description: `No-reply addresses (${removed.join(', ')}) were removed from recipients.`,
        placement: 'topRight',
        duration: 6,
      });
    }
  };

  const handleForward = (email: Email) => {
    if (isOpeningRef.current) return;
    isOpeningRef.current = true;
    try {
      flushSync(() => {
        setReplyToEmail(email);
        setComposeMode('forward');
      });
      setIsComposeVisible(true);
    } finally {
      setTimeout(() => { isOpeningRef.current = false; console.log('[InboxPage] isOpeningRef reset after forward'); }, 50);
    }
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
    if (mailboxId !== selectedMailboxRef.current) {
      console.log('[InboxPage] loadEmails ignored: mailbox mismatch', { requested: mailboxId, current: selectedMailboxRef.current });
      return;
    }
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

      if (mailboxId !== selectedMailboxRef.current) {
        console.log('[InboxPage] loadEmails aborted: user switched mailbox during fetch');
        return;
      }

      const emailList = data.emails || [];
      console.log('[InboxPage] loadEmails: found', emailList.length, 'emails, total:', data.total);
      setEmails(emailList);
      setTotalEmails(data.total || 0);
      setCurrentPage(page);
      // Preserve selected email when paginating within the same mailbox.
      setSelectedEmail(prev => (prev && prev.mailboxId === mailboxId) ? prev : null);

      // Persist current page & mailbox so reload can restore
      try { localStorage.setItem('mb:currentPage', String(page)); } catch (e) { }
      try { localStorage.setItem('mb:selectedMailbox', mailboxId); } catch (e) { }

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

      // Try to restore last-opened email or mailbox if available in localStorage
      const savedEmailId = (typeof window !== 'undefined') ? localStorage.getItem('mb:selectedEmailId') : null;
      const savedPage = (typeof window !== 'undefined') ? Number(localStorage.getItem('mb:currentPage') || '1') : 1;
      const savedMailbox = (typeof window !== 'undefined') ? localStorage.getItem('mb:selectedMailbox') : null;

      if (savedEmailId) {
        try {
          isRestoringRef.current = true;
          const fullEmail = await emailService.getEmailDetail(savedEmailId);
          if (cancelled) return;
          if (fullEmail && fullEmail.mailboxId) {
            // Ensure mailbox matches the email we restored
            setSelectedMailbox(fullEmail.mailboxId);
            await loadEmails(fullEmail.mailboxId, savedPage || 1, pageSize, filters.unread, filters.hasAttachment);
            setSelectedEmail(fullEmail);
            setShowMobileDetail(true);
            // Scroll the list to the restored email
            setTimeout(() => { try { scrollToEmailInList(fullEmail.id); } catch (e) { } }, 250);
          } else {
            // No saved email detail could be fetched; prefer saved mailbox if present
            const mailboxToLoad = savedMailbox || mailboxId;
            if (mailboxToLoad) {
              setSelectedMailbox(mailboxToLoad);
              await loadEmails(mailboxToLoad, 1, pageSize, filters.unread, filters.hasAttachment);
            } else {
              console.warn('[InboxPage] init: no mailbox available to load (restore path)');
            }
          }
        } catch (err) {
          console.warn('[InboxPage] restore selected email failed:', err);
          const mailboxToLoad = savedMailbox || mailboxId;
          if (mailboxToLoad) {
            setSelectedMailbox(mailboxToLoad);
            await loadEmails(mailboxToLoad, 1, pageSize, filters.unread, filters.hasAttachment);
          } else {
            console.warn('[InboxPage] init: no mailbox available to load (catch path)');
          }
        } finally {
          isRestoringRef.current = false;
        }
      } else {
        const mailboxToLoad = savedMailbox || mailboxId;
        if (mailboxToLoad) {
          setSelectedMailbox(mailboxToLoad);
          await loadEmails(mailboxToLoad, 1, pageSize, filters.unread, filters.hasAttachment);
        } else {
          console.warn('[InboxPage] init: no mailbox available to load (no saved email)');
        }
        // restore list scroll
        try {
          const savedScroll = Number(localStorage.getItem('mb:listScrollTop') || '0');
          setTimeout(() => { try { if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = savedScroll; } catch (e) { } }, 300);
        } catch (e) { }
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

    // Persist mailbox to URL
    const params = new URLSearchParams(searchParams.toString());
    params.set('mailbox', mailboxId);
    router.push(`${pathname}?${params.toString()}`);

    // V10.50: Automatically trigger sync for system folders when selected
    const systemFolders = ['INBOX', 'TRASH', 'SPAM', 'SENT', 'DRAFTS', 'DRAFT'];
    if (systemFolders.includes(mailboxId.toUpperCase())) {
      handleSync(mailboxId);
    }
  };

  // Persist mailbox selection to restore on reload
  useEffect(() => {
    try {
      if (selectedMailbox) localStorage.setItem('mb:selectedMailbox', selectedMailbox);
    } catch (e) { /* ignore */ }
  }, [selectedMailbox]);

  const handleEmailSelect = async (email: Email) => {
    // If it's a draft, open Compose Modal for editing instead of reading
    const isDraft = (email.mailboxId || '').toUpperCase() === 'DRAFTS' || (email.mailboxId || '').toUpperCase() === 'DRAFT';
    if (isDraft) {
      setReplyToEmail(email);
      setComposeMode('compose');
      setIsComposeVisible(true);
      return;
    }

    setSelectedEmail(email);
    setShowMobileDetail(true);
    try { localStorage.setItem('mb:selectedEmailId', String(email.id)); } catch (e) { }
    try { localStorage.setItem('mb:selectedMailbox', String(email.mailboxId || selectedMailbox)); } catch (e) { }

    // If body is missing OR if we expect attachments but don't have them yet, fetch full details
    const needsDetail = !email.body || (email.hasAttachments && (!email.attachments || email.attachments.length === 0));

    if (needsDetail) {
      try {
        const fullEmail = await emailService.getEmailDetail(email.id);
        console.log('[InboxPage] Fetched full email detail for', fullEmail.id, 'attachmentsCount=', fullEmail.attachments?.length);
        setSelectedEmail(prev => {
          if (!prev) return fullEmail;
          return {
            ...prev,
            ...fullEmail,
            to: fullEmail.to && fullEmail.to.length > 0 ? fullEmail.to : prev.to,
            cc: fullEmail.cc && fullEmail.cc.length > 0 ? fullEmail.cc : prev.cc,
            bcc: fullEmail.bcc && fullEmail.bcc.length > 0 ? fullEmail.bcc : prev.bcc,
          };
        });
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

  const handleSync = async (mailboxId?: string) => {
    setSyncLoading(true);
    try {
      const folderMap: Record<string, string> = {
        INBOX: 'INBOX',
        SPAM: '[Gmail]/Spam',
        TRASH: '[Gmail]/Trash',
        SENT: '[Gmail]/Sent Mail',
        DRAFT: '[Gmail]/Drafts',
        DRAFTS: '[Gmail]/Drafts',
        IMPORTANT: '[Gmail]/Important',
        STARRED: '[Gmail]/Starred',
      };
      const normalized = (mailboxId || selectedMailbox || 'INBOX').toUpperCase();
      const syncFolder = folderMap[normalized] || mailboxId || selectedMailbox || 'INBOX';
      await emailService.syncEmails(undefined, syncFolder);
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
    if (msg?.type === 'NEW_EMAILS' || msg?.type === 'UPDATED_EMAILS') {
      const isUpdateOnly = msg.type === 'UPDATED_EMAILS';
      const canInsertRealtimeIntoCurrentList =
        selectedMailbox === 'INBOX' &&
        currentPage === 1 &&
        !isSearching &&
        sortMode === 'date-desc' &&
        !filters.unread &&
        !filters.hasAttachment;

      // If backend provided specific email IDs, fetch them and insert into UI immediately
      if (Array.isArray(msg.emailIds) && msg.emailIds.length > 0) {
        (async () => {
          try {
            for (const id of msg.emailIds) {
              try {
                const full = await emailService.getEmailDetail(String(id));
                setEmails(prev => {
                  const belongsInView = 
                    (full.mailboxId || '').toUpperCase() === (selectedMailbox || 'INBOX').toUpperCase() ||
                    ((full.mailboxId || '').toUpperCase() === 'INBOX' && selectedMailbox === 'INBOX');
                    
                  // ALWAYS process removals/updates for existing items to keep view fresh
                  const exists = prev.some(e => String(e.id) === String(full.id));
                  if (exists) {
                    if (!belongsInView) {
                       // If the email being read is the one being removed, close the reading panel
                       setSelectedEmail(current => {
                         if (current && String(current.id) === String(full.id)) {
                           return null;
                         }
                         return current;
                       });
                       return prev.filter(e => String(e.id) !== String(full.id));
                    }
                    // Replace existing entry with fresh data
                    return prev.map(e => String(e.id) === String(full.id) ? full : e);
                  }
                  
                  // NEW EMAIL (not in current view list)
                  // We allow 'isUpdateOnly' here because a status change (e.g. Restore from Trash) 
                  // makes an old email "new" to the current Inbox view.
                  if (!belongsInView || !canInsertRealtimeIntoCurrentList) return prev;

                  // Safety: Only prepend if it's actually newer than the bottom-most email in the current view
                  // or if the list isn't full yet.
                  const bottomEmailDate = prev.length > 0 ? new Date(prev[prev.length - 1].receivedAt).getTime() : 0;
                  const newEmailDate = new Date(full.receivedAt).getTime();
                  
                  if (newEmailDate < bottomEmailDate && prev.length >= pageSize) {
                      return prev;
                  }
                  
                  // Prepend newest message (keep it sorted)
                  const next = [full, ...prev.filter(e => String(e.id) !== String(full.id))]
                    .sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime());
                  setTotalEmails(t => t + 1);
                  return next.slice(0, pageSize);
                });
              } catch (err) {
                console.warn('[InboxPage] Failed to fetch email detail for id', id, err);
              }
            }
            loadMailboxes();
          } catch (e) {
            console.warn('[InboxPage] Error processing notification payload', e);
            loadMailboxes();
            loadEmails(selectedMailbox, currentPage, pageSize, filters.unread, filters.hasAttachment);
          }
        })();
      } else {
        // Generic fallback: refresh mailbox list and current mailbox view
        message.info('New emails received! Syncing...');
        setTimeout(() => {
          loadMailboxes();
          loadEmails(selectedMailbox, currentPage, pageSize, filters.unread, filters.hasAttachment);
        }, 500);
      }
    }
  }, [selectedMailbox, loadMailboxes, loadEmails, currentPage, pageSize, filters, isSearching, sortMode]);

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
    const date = parseAsLocalDate(dateString);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 24) {
      return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    } else if (diffInHours < 48) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
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

  const handleMarkSpam = async (email: Email) => {
    const originalEmails = [...emails];
    setEmails(prev => prev.filter(e => e.id !== email.id));
    if (selectedEmail?.id === email.id) {
      setSelectedEmail(null);
      setShowMobileDetail(false);
    }

    try {
      await emailService.markAsSpam(email.id);
      message.success('Moved to Spam');
    } catch (error) {
      console.error('Spam move error:', error);
      message.error('Failed to move email to Spam, restoring...');
      setEmails(originalEmails);
    }
  };

  const handleRestoreToInbox = async (email: Email) => {
    const fromMailbox = (email.mailboxId || '').toUpperCase() === 'TRASH' ? 'TRASH' : 'SPAM';
    const originalEmails = [...emails];
    setEmails(prev => prev.filter(e => e.id !== email.id));
    if (selectedEmail?.id === email.id) {
      setSelectedEmail(null);
      setShowMobileDetail(false);
    }

    try {
      await emailService.restoreToInbox(email.id, fromMailbox as 'TRASH' | 'SPAM');
      message.success('Moved back to Inbox');
    } catch (error) {
      console.error('Restore error:', error);
      message.error('Failed to restore email, restoring local state...');
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
      <InlineAlertContext.Provider value={{
        inlineAlert, setInlineAlert, isVisibleForEmail: (emailId?: string) => {
          if (!inlineAlert) return false;
          if (!emailId) return true;
          return String(inlineAlert.emailId) === String(emailId);
        }
      }}>
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
                    items={visibleMailboxes.map((mailbox) => ({
                      key: mailbox.id,
                      icon: mailbox.icon,
                      onClick: () => handleMailboxSelect(mailbox.id),
                      label: (
                        <div className="flex justify-between items-center w-full">
                          <span>{mailbox.displayName}</span>
                          {mailbox.unreadCount > 0 && (
                            <span className="gmail-mailbox-count">{mailbox.unreadCount}</span>
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
                              {selectedMailboxTitle}
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
                          onSpam={handleMarkSpam}
                          onRestore={handleRestoreToInbox}
                          inlineAlertMessage={inlineAlert && selectedEmail && String(inlineAlert.emailId) === String(selectedEmail.id) ? inlineAlert.message : undefined}
                          onInlineAlertClose={() => {
                            setInlineAlert(null);
                          }}
                          onReply={handleReply}
                          onReplyAll={handleReplyAll}
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
                  items={visibleMailboxes.map((mailbox) => ({
                    key: mailbox.id,
                    icon: mailbox.icon,
                    onClick: () => {
                      handleMailboxSelect(mailbox.id);
                      setMobileDrawerOpen(false);
                    },
                    label: (
                      <div className="flex justify-between items-center w-full">
                        <span>{mailbox.displayName}</span>
                        {mailbox.unreadCount > 0 && (
                          <span className="gmail-mailbox-count">{mailbox.unreadCount}</span>
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
            onSaveDraft={handleDraftUpdate}
            onDiscard={() => loadEmails(selectedMailbox)}
            mode={composeMode}
            currentUserEmail={replyToEmail?.accountEmail || user?.email}
            originalEmail={replyToEmail ? {
              id: replyToEmail.id,
              threadId: replyToEmail.threadId,
              from: replyToEmail.from,
              to: replyToEmail.to,
              cc: replyToEmail.cc,
              bcc: replyToEmail.bcc,
              subject: replyToEmail.subject,
              body: replyToEmail.body,
              receivedAt: replyToEmail.receivedAt,
              removedNoReply: (replyToEmail as any).removedNoReply || [],
              mailboxId: replyToEmail.mailboxId,
              gmailDraftId: replyToEmail.gmailDraftId
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
                onSpam={handleMarkSpam}
                onRestore={handleRestoreToInbox}
                onReply={handleReply}
                onReplyAll={handleReplyAll}
                onForward={handleForward}
                onSnooze={handleSnooze}
                onSummarize={handleSummarize}
                loadingSummary={loadingSummary}
                onDownloadAttachment={handleDownloadAttachment}
                showMobileDetail={false}
                showBackButton={false}
                inlineAlertMessage={inlineAlert && selectedEmail && String(inlineAlert.emailId) === String(selectedEmail.id) ? inlineAlert.message : undefined}
                onInlineAlertClose={() => { setInlineAlert(null); }}
              />
            )}
          </Modal>
        </Layout >
      </InlineAlertContext.Provider>
    </ProtectedRoute >
  );
}
