'use client';

import { useState, useEffect, useCallback, useMemo, useRef, Suspense } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { flushSync } from 'react-dom';
import { Layout, Menu, List, Card, Button, Typography, Space, Avatar, Spin, message, Empty, Modal, Pagination, Dropdown, Drawer, notification, Alert, Tooltip, Input, Checkbox, Badge } from 'antd';
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
  MailFilled,
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
import FilterBar, { FilterState } from '@/app/components/FilterBar';
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

const parseAsLocalDate = (dateStr: string) => {
  if (!dateStr) return new Date();
  try {
    // V47: Robust date parsing. If backend sends ISO but lacks 'Z', it might be local time already.
    // But usually Spring Data JPA sends UTC. Let's ensure we treat it correctly.
    let normalized = dateStr;
    if (normalized.includes(' ')) normalized = normalized.replace(' ', 'T');

    // V43: Force UTC if no timezone offset is present to fix the 7-hour shift
    if (!normalized.includes('Z') && !normalized.includes('+') && !normalized.includes('-')) {
      normalized += 'Z';
    }

    const date = new Date(normalized);
    if (isNaN(date.getTime())) return new Date();
    return date;
  } catch (e) {
    return new Date();
  }
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

  useEffect(() => {
    const mailboxParam = searchParams.get('mailbox');
    if (mailboxParam && mailboxParam !== selectedMailbox) {
      // V48.5: Clear list immediately when URL changes to prevent stale data display
      setEmails([]);
      setTotalEmails(0);
      setSelectedEmail(null);
      loadCountRef.current++; // V50: Prevent race condition from previous mailbox fetch
      setSelectedMailbox(mailboxParam);
    }
  }, [searchParams, selectedMailbox]);

  const [emails, setEmails] = useState<Email[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [optimisticStatusMap, setOptimisticStatusMap] = useState<Record<string, boolean>>({});
  const [readingEmailId, setReadingEmailId] = useState<string | null>(null);
  const [emailsLoading, setEmailsLoading] = useState(false);
  const [showMobileDetail, setShowMobileDetail] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [isComposeVisible, setIsComposeVisible] = useState(false);
  const isOpeningRef = useRef(false);
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');
  const [composeMode, setComposeMode] = useState<'compose' | 'reply' | 'reply-all' | 'forward'>('compose');
  const [replyToEmail, setReplyToEmail] = useState<Email | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const loadCountRef = useRef(0);
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
  
  // V50: Track active syncs and cooldowns to prevent hammering the backend
  const activeSyncsRef = useRef<Set<string>>(new Set());
  const lastSyncTimeRef = useRef<Record<string, number>>({});
  
  // V50: Multi-selection state
  const [selectedEmailIds, setSelectedEmailIds] = useState<Set<string>>(new Set());
  const [isAllSelectedInMailbox, setIsAllSelectedInMailbox] = useState(false);
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);

  // Show inline no-reply banner whenever an email is opened. Avoid duplicate rendering
  // by checking the current `inlineAlert` (if it's already showing for the same
  // email we don't re-create it). We intentionally do NOT persist dismissals so
  // the banner will reappear each time the user opens the email.

  const handleNotificationRef = useRef<any>(null);

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
  const [isSyncing, setIsSyncing] = useState(false);
  const [isRestoring, setIsRestoring] = useState<string | null>(null); // Stores emailId being restored
  const [isStabilizing, setIsStabilizing] = useState<string | null>(null); // V43: Message for protection overlay
  const [isSearching, setIsSearching] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [nextPageToken, setNextPageToken] = useState<string>('');
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalEstimate, setTotalEstimate] = useState<number>(0);
  const [searchScores, setSearchScores] = useState<Record<string, number>>({});
  const [searchMode, setSearchMode] = useState<'semantic' | 'text'>('semantic');
  const [syncLoading, setSyncLoading] = useState(false);
  const [emailsError, setEmailsError] = useState<string | null>(null);

  // Custom Confirmation Modal State
  const [confirmModal, setConfirmModal] = useState<{
    visible: boolean;
    title: string;
    content: string;
    onConfirm: () => void;
    okText: string;
    danger: boolean;
  }>({
    visible: false,
    title: '',
    content: '',
    onConfirm: () => { },
    okText: 'Confirm',
    danger: false
  });


  // Filter & Sort state
  const [filters, setFilters] = useState<FilterState>(() => {
    if (typeof window === 'undefined') return { unread: false, hasAttachment: false };
    try {
      const saved = localStorage.getItem('mb:filters');
      return saved ? JSON.parse(saved) : { unread: false, hasAttachment: false };
    } catch (e: any) {
      return { unread: false, hasAttachment: false };
    }
  });
  const [sortLayers, setSortLayers] = useState<{ field: string, order: 'asc' | 'desc' }[]>(() => {
    const saved = localStorage.getItem('mb:sortLayers');
    return saved ? JSON.parse(saved) : [{ field: 'receivedDate', order: 'desc' }];
  });

  // Persist filters & sort state
  useEffect(() => {
    try {
      localStorage.setItem('mb:filters', JSON.stringify(filters));
      localStorage.setItem('mb:sortLayers', JSON.stringify(sortLayers));
    } catch (e: any) { }
  }, [filters, sortLayers]);
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
    // Optimistic update for mailbox counts
    setMailboxes(prev => prev.map(m => {
      // If we were editing a draft and sent it
      const wasDraft = replyToEmail && (replyToEmail.mailboxId?.toUpperCase() === 'DRAFTS' || replyToEmail.mailboxId?.toUpperCase() === 'DRAFT');

      if (m.id === 'SENT') {
        // We usually don't show SENT count, but if we do, increment it
        return { ...m, unreadCount: m.unreadCount + 1 };
      }
      if (m.id === 'DRAFTS' && wasDraft) {
        return { ...m, unreadCount: Math.max(0, m.unreadCount - 1) };
      }
      return m;
    }));

    // 2. If we just sent an email and we are in DRAFTS, we must remove the draft and refresh
    if (normalizedMailbox === 'DRAFTS' || normalizedMailbox === 'DRAFT') {
      // Filter out by either ID or gmailDraftId
      setEmails(prev => prev.filter(e => {
        const isSameId = e.id === sentPreview.id;
        const isSameDraftId = sentPreview.gmailDraftId && e.gmailDraftId === sentPreview.gmailDraftId;
        return !isSameId && !isSameDraftId;
      }));
      setTotalEmails(prev => Math.max(0, prev - 1));
    }

    loadMailboxes();
  };

  const handleDraftUpdate = (draft: Email) => {
    const normalizedMailbox = selectedMailbox?.toUpperCase();
    let wasNew = false;

    setEmails(prev => {
      const exists = prev.some(e => String(e.id) === String(draft.id) || (e.gmailDraftId && draft.gmailDraftId && e.gmailDraftId === draft.gmailDraftId));
      if (exists) {
        return prev.map(e => (String(e.id) === String(draft.id) || (e.gmailDraftId && draft.gmailDraftId && e.gmailDraftId === draft.gmailDraftId)) ? draft : e);
      }

      wasNew = true;
      // If we are currently in Drafts folder, prepend it
      if (normalizedMailbox === 'DRAFTS' || normalizedMailbox === 'DRAFT') {
        const next = [draft, ...prev];
        return next.slice(0, pageSize);
      }

      return prev;
    });

    // Update total count if it's a new draft
    if (wasNew) {
      setMailboxes(prev => prev.map(m => {
        if (m.id === 'DRAFTS') {
          return { ...m, unreadCount: m.unreadCount + 1 };
        }
        return m;
      }));
      loadMailboxes(); // Refresh accurate counts from server
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

  const handleCompose = () => {
    if (isOpeningRef.current) return;
    console.log('[InboxPage] handleCompose: creating new fresh draft');
    isOpeningRef.current = true;
    try {
      flushSync(() => {
        setReplyToEmail(null);
        setComposeMode('compose');
      });
      setIsComposeVisible(true);
    } finally {
      setTimeout(() => { isOpeningRef.current = false; }, 50);
    }
  };

  const loadMailboxes = useCallback(async (): Promise<string | null> => {
    try {
      console.log('[InboxPage] loadMailboxes: starting...');
      const data = await emailService.getMailboxes();
      console.log('[InboxPage] loadMailboxes: got', data.mailboxes?.length, 'mailboxes, accountId:', data.accountId);

      setMailboxes(data.mailboxes || []);

      if (data.accountId) {
        const newAccountId = Number(data.accountId);
        setAccountId(prev => {
          if (prev !== newAccountId) {
            console.log(`[InboxPage] accountId changing from ${prev} to ${newAccountId}`);
            return newAccountId;
          }
          return prev;
        });
      }

      if (data.mailboxes && data.mailboxes.length > 0) {
        const inbox = data.mailboxes.find(m => m.id === 'INBOX');
        const targetMailbox = inbox ? 'INBOX' : data.mailboxes[0].id;
        setSelectedMailbox(prev => prev || targetMailbox);
        return targetMailbox;
      }
      return null;
    } catch (error: any) {
      console.error('[InboxPage] loadMailboxes: FAILED', error);
      message.error('Failed to load mailboxes');
      return null;
    }
  }, [setMailboxes, setSelectedMailbox]);

  const loadEmails = useCallback(async (p: number, silent: boolean = false, overrideMailbox?: string) => {
    const targetMailbox = overrideMailbox || selectedMailbox;
    if (!targetMailbox) return;
    
    console.log(`[InboxPage] loadEmails: fetching ${targetMailbox} page ${p} (silent: ${silent})`);
    const requestId = ++loadCountRef.current;
    if (!silent) {
      setEmailsLoading(true);
      setEmailsError(null);
    }
    try {
      const data = await emailService.getEmailsByMailbox(targetMailbox, p, pageSize, filters, sortLayers);
      // V48: Only update if this is still the most recent request
      if (requestId === loadCountRef.current) {
        setEmails(data.emails);
        setTotalEmails(data.total);
        setCurrentPage(p);
      }
    } catch (err: any) {
      console.error('Failed to load emails:', err);
      if (!silent) setEmailsError(err.message || 'Failed to fetch emails. Please check your connection.');
    } finally {
      if (!silent && requestId === loadCountRef.current) {
        setEmailsLoading(false);
      }
    }
  }, [selectedMailbox, pageSize, filters, sortLayers]);

  // Primary initialization: load mailboxes THEN load emails in sequence
  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      console.log('[InboxPage] init: starting mailbox + email load sequence');
      // V49: Removed setSelectedEmail(null) to prevent selection loss on first click after load (Image 5 bug)
      // setSelectedEmail(null); 
      setShowMobileDetail(false);

      const mailboxId = await loadMailboxes();
      if (cancelled) return;

      const mailboxFromUrl = searchParams.get('mailbox');
      const mailboxToLoad = mailboxFromUrl || initialMailbox;

      if (mailboxToLoad) {
        setSelectedMailbox(mailboxToLoad);
        selectedMailboxRef.current = mailboxToLoad;

        // Restore page number and filters from localStorage
        const savedPage = (typeof window !== 'undefined') ? Number(localStorage.getItem('mb:currentPage') || '1') : 1;

        // Load with restored state
        await loadEmails(savedPage || 1);
      } else {
        console.warn('[InboxPage] init: no mailbox available to load');
      }

      // Restore list scroll position
      try {
        const savedScroll = Number(localStorage.getItem('mb:listScrollTop') || '0');
        setTimeout(() => {
          try {
            if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = savedScroll;
          } catch (e) { }
        }, 300);
      } catch (e) { }
    };
    init();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When selectedMailbox changes AFTER initial load (e.g. user clicks sidebar), reload emails
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  useEffect(() => {
    if (!initialLoadDone && selectedMailbox) {
      setInitialLoadDone(true);
      return;
    }
    if (initialLoadDone && selectedMailbox) {
      console.log('[InboxPage] selectedMailbox/filters changed - clearing list and reloading');
      // V50: Aggressive clearing for ALL mailbox/filter changes to prevent "ghosting"
      setEmails([]);
      setTotalEmails(0);
      setSelectedEmail(null);
      loadCountRef.current++; // Invalidate any previous in-flight requests
      
      loadEmails(1);
    }
    // V50: Clear selection when mailbox/filters change
    setSelectedEmailIds(new Set());
    setIsAllSelectedInMailbox(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMailbox, filters, sortLayers, pageSize]);

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
        .catch((err: any) => {
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
    loadEmails(page);
  };

  const handleMailboxSelect = (mailboxId: string) => {
    console.log(`[InboxPage] handleMailboxSelect: switching to ${mailboxId}`);
    // V43: Clear list immediately to prevent "ghost" mails from previous mailbox
    setEmails([]);
    setTotalEmails(0);
    setSelectedEmail(null);
    loadCountRef.current++; // V50: Increment request ID immediately to invalidate any in-flight requests

    setSelectedMailbox(mailboxId);
    setCurrentPage(1); // Reset to page 1 when switching mailbox
    setShowMobileDetail(false);
    setIsSearching(false); // V50: Exit search mode when a mailbox is explicitly selected
    setSearchQuery(''); // Clear search query state

    // Persist mailbox to URL
    const params = new URLSearchParams(searchParams.toString());
    params.set('mailbox', mailboxId);
    router.push(`${pathname}?${params.toString()}`);

    // V10.50: Automatically trigger sync ONLY for INBOX when selected
    if (mailboxId.toUpperCase() === 'INBOX') {
      const now = Date.now();
      const lastSync = lastSyncTimeRef.current['INBOX'] || 0;
      // Only auto-sync if it's been more than 30 seconds since last sync for this folder
      if (now - lastSync > 30000) {
        console.log('[InboxPage] handleMailboxSelect: triggering auto-sync for INBOX (cooldown passed)');
        handleSync(mailboxId);
      } else {
        console.log('[InboxPage] handleMailboxSelect: skipping auto-sync for INBOX (cooldown active)');
      }
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

    // V49: Optimistic update IMMEDIATELY
    const readEmail = { ...email, isRead: true };
    const idStr = String(email.id);

    setSelectedEmail(readEmail);
    setReadingEmailId(idStr); // V49: Force instant unbolding via separate state
    setOptimisticStatusMap(prev => ({ ...prev, [idStr]: true })); // V49: Lock as READ instantly

    if (!email.isRead) {
      setEmails(prev => prev.map(e => String(e.id) === idStr ? { ...e, isRead: true } : e));
      setMailboxes(prev => prev.map(m => {
        if (normalizeMailboxId(m.id) === 'INBOX') {
          return { ...m, unreadCount: Math.max(0, m.unreadCount - 1) };
        }
        return m;
      }));
    }

    // V49: Cleanup optimistic lock after sync
    setTimeout(() => {
      setOptimisticStatusMap(prev => {
        const next = { ...prev };
        delete next[idStr];
        return next;
      });
    }, 1500);

    setShowMobileDetail(true);

    if (!email.isRead) {
      // Fire and forget backend sync
      emailService.markAsRead(email.id).catch(err => console.error('Failed to mark as read', err));
    }

    try { localStorage.setItem('mb:selectedEmailId', String(email.id)); } catch (e) { }
    try { localStorage.setItem('mb:selectedMailbox', String(email.mailboxId || selectedMailbox)); } catch (e) { }

    // If body is missing OR if we expect attachments but don't have them yet, fetch full details
    const needsDetail = !email.body || (email.hasAttachments && (!email.attachments || email.attachments.length === 0));

    if (needsDetail) {
      try {
        const fullEmail = await emailService.getEmailDetail(email.id);
        console.log('[InboxPage] Fetched full email detail for', fullEmail.id, 'attachmentsCount=', fullEmail.attachments?.length);
        setSelectedEmail(prev => {
          if (!prev || String(prev.id) !== String(fullEmail.id)) return prev; // Only update if we're still on the same email
          return {
            ...prev,
            ...fullEmail,
            preview: fullEmail.preview || prev.preview, // V49: Preserve preview if missing in detail
            isRead: true, // Ensure it's read
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
  };

  const handleRefresh = () => {
    setSelectedEmail(null);
    setShowMobileDetail(false);
    loadEmails(1);
  };

  const handleResetFilters = useCallback(() => {
    setFilters({ unread: false, hasAttachment: false });
    setSortLayers([{ field: 'receivedDate', order: 'desc' }]);
    setCurrentPage(1);
    setSelectedEmail(null);
    setShowMobileDetail(false);
    setEmails([]);
    setTotalEmails(0);
    loadCountRef.current++;
    // Explicitly reload with defaults
    loadEmails(1, true);
    message.info('Filters reset to default');
  }, [loadEmails]);

  const handleMarkAsUnread = async (e: React.MouseEvent, email: Email) => {
    e.stopPropagation();
    if (processingIds.has(String(email.id))) return;

    const idStr = String(email.id);

    setProcessingIds(prev => new Set(prev).add(idStr));
    setOptimisticStatusMap(prev => ({ ...prev, [idStr]: false })); // V49: Force UNREAD state instantly

    // V49: Close detail view immediately when marking as unread (as requested)
    setSelectedEmail(null);
    setShowMobileDetail(false);
    setReadingEmailId(null); // V49: Reset reading state so it becomes bold again

    setEmails(prev => prev.map(item => {
      if (String(item.id) === idStr) {
        return { ...item, isRead: false };
      }
      return item;
    }));

    setMailboxes(prev => prev.map(m => {
      if (normalizeMailboxId(m.id) === 'INBOX') return { ...m, unreadCount: m.unreadCount + 1 };
      return m;
    }));

    try {
      await emailService.markAsUnread(email.id);
    } catch (err) {
      console.error('Failed to mark as unread', err);
      message.error('Failed to update status');
    } finally {
      setProcessingIds(prev => {
        const next = new Set(prev);
        next.delete(idStr);
        return next;
      });
      // V49: Keep the optimistic status for a bit longer to ensure server catch-up
      setTimeout(() => {
        setOptimisticStatusMap(prev => {
          const next = { ...prev };
          delete next[idStr];
          return next;
        });
      }, 2000);
    }
  };

  const handleMarkAsRead = async (e: React.MouseEvent, email: Email) => {
    e.stopPropagation();
    if (processingIds.has(String(email.id))) return;

    const idStr = String(email.id);
    setProcessingIds(prev => new Set(prev).add(idStr));
    setOptimisticStatusMap(prev => ({ ...prev, [idStr]: true })); // V49: Force READ state instantly
    setReadingEmailId(idStr); // V49: Force instant unbolding

    setEmails(prev => prev.map(item => {
      if (String(item.id) === idStr) {
        return { ...item, isRead: true };
      }
      return item;
    }));

    setMailboxes(prev => prev.map(m => {
      if (normalizeMailboxId(m.id) === 'INBOX') return { ...m, unreadCount: Math.max(0, m.unreadCount - 1) };
      return m;
    }));

    try {
      await emailService.markAsRead(email.id);
    } catch (error) {
      console.error('Failed to mark as read', error);
      message.error('Failed to mark as read');
    } finally {
      setProcessingIds(prev => {
        const next = new Set(prev);
        next.delete(idStr);
        return next;
      });
      // V49: Cleanup optimistic lock after delay
      setTimeout(() => {
        setOptimisticStatusMap(prev => {
          const next = { ...prev };
          delete next[idStr];
          return next;
        });
      }, 2000);
    }
  };

  const handleSync = async (mailboxId?: string) => {
    const normalized = (mailboxId || selectedMailbox || 'INBOX').toUpperCase();
    
    // V50: Prevent concurrent syncs for the same folder
    if (activeSyncsRef.current.has(normalized)) {
      console.log(`[InboxPage] handleSync: sync already in progress for ${normalized}, skipping`);
      return;
    }

    activeSyncsRef.current.add(normalized);
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
      const syncFolder = folderMap[normalized] || mailboxId || selectedMailbox || 'INBOX';

      // Close detail view during sync to show fresh list
      setSelectedEmail(null);
      setShowMobileDetail(false);

      await emailService.syncEmails(undefined, syncFolder);
      lastSyncTimeRef.current[normalized] = Date.now();
      message.success(`Sync completed for ${normalized}`);
      
      // V50: Use the SPECIFIC mailboxId we were syncing to refresh
      await Promise.all([
        loadEmails(1, true, normalized),
        loadMailboxes()
      ]);
    } catch (error) {
      console.error('Sync failed:', error);
      message.error('Failed to sync emails from Gmail');
    } finally {
      activeSyncsRef.current.delete(normalized);
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

    if (msg?.type === 'DELETED_EMAILS') {
      const emailIds = msg.emailIds || (msg.emailId ? [msg.emailId] : []);
      setEmails(prev => prev.filter(e => !emailIds.includes(String(e.id)) && !emailIds.includes(Number(e.id))));
      return;
    }

    if (msg?.type === 'NEW_EMAILS' || msg?.type === 'UPDATED_EMAILS') {
      // V49: Always reload mailboxes for any new/updated signals to keep sidebar accurate
      loadMailboxes();

      const emailIds = msg.emailIds || (msg.emailId ? [msg.emailId] : []);
      if (emailIds.length === 0) return;

      if (isRestoring) {
        console.log('[InboxPage] Skipping email list refresh for WebSocket during active restoration');
        return;
      }

      const isInbox = (selectedMailbox || 'INBOX').toUpperCase() === 'INBOX';
      (async () => {
        try {
          let anyChanges = false;
          let newEmailsForTotal = 0;

          for (const id of emailIds) {
            try {
              const fullEmail = await emailService.getEmailDetail(String(id));
              anyChanges = true;

              const mailboxId = (fullEmail.mailboxId || '').toUpperCase();
              const currentMailbox = (selectedMailbox || 'INBOX').toUpperCase();

              // Logic check: Does it belong here?
              const statusMatch = mailboxId === currentMailbox || (currentMailbox === 'DRAFTS' && mailboxId === 'DRAFT');
              const unreadMatch = !filters.unread || !fullEmail.isRead;
              const attachMatch = !filters.hasAttachment || fullEmail.hasAttachments;
              const shouldBeInList = statusMatch && unreadMatch && attachMatch;

              if (mailboxId === 'INBOX' && msg.type === 'NEW_EMAILS') {
                newEmailsForTotal++;
              }

              setEmails(prev => {
                const exists = prev.some(e => String(e.id) === String(fullEmail.id));

                if (shouldBeInList) {
                  if (exists) {
                    return prev.map(e => String(e.id) === String(fullEmail.id) ? fullEmail : e);
                  }
                  if (isSearching) return prev;

                  // Insert and Sort
                  const next = [fullEmail, ...prev];
                  return next.sort((a, b) => {
                    for (const layer of sortLayers) {
                      const { field, order } = layer;
                      const isAsc = order === 'asc';
                      let res = 0;
                      if (field === 'date' || field === 'receivedDate') {
                        res = isAsc ? new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime() : new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime();
                      } else if (field === 'fromName' || field === 'sender') {
                        const getName = (e: Email) => {
                          const isMe = e.isFromMe || (e.accountEmail && e.from?.email?.toLowerCase() === e.accountEmail.toLowerCase());
                          if (isMe) return 'you';
                          return (e.fromName || e.from?.name || e.from?.email || '').toLowerCase();
                        };
                        const sA = getName(a);
                        const sB = getName(b);
                        res = isAsc ? sA.localeCompare(sB) : sB.localeCompare(sA);
                      } else if (field === 'subject') {
                        res = isAsc ? (a.subject || '').localeCompare(b.subject || '') : (b.subject || '').localeCompare(a.subject || '');
                      }
                      if (res !== 0) return res;
                    }
                    return 0;
                  }).slice(0, pageSize);
                } else {
                  // If it shouldn't be here but exists, REMOVE it (important for moved/deleted emails)
                  if (exists) {
                    return prev.filter(e => String(e.id) !== String(fullEmail.id));
                  }
                  return prev;
                }
              });
            } catch (err) {
              console.warn('[InboxPage] Failed to process email id', id, err);
            }
          }

          if (anyChanges) {
            // V42: Add delay to allow backend transactions to commit before refreshing counts
            setTimeout(() => {
              loadMailboxes();
            }, 1000);
          }

          if (newEmailsForTotal > 0) {
            notification.success({
              message: 'New Email Received',
              description: `You have ${newEmailsForTotal} new email(s) in your inbox.`,
              placement: 'bottomRight',
              duration: 4
            });
            setTotalEmails(t => t + newEmailsForTotal);
          }
        } catch (e) {
          console.warn('[InboxPage] Error in notification loop', e);
          // V42: Add delay to allow backend transactions to commit
          setTimeout(() => {
            loadMailboxes();
            loadEmails(currentPage, true);
          }, 1000);
        }
      })();
    }
  }, [selectedMailbox, loadMailboxes, loadEmails, currentPage, pageSize, filters, isSearching, sortLayers, isRestoring]);

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
      loadEmails(1);
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
    if (isRestoring === email.id) return;
    setIsRestoring(email.id);
    setIsStabilizing('Syncing star status with Gmail...');

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

    // Optimistic update for mailbox counts
    setMailboxes(prev => prev.map(m => {
      if (m.id.toUpperCase() === 'STARRED') {
        return { ...m, unreadCount: newStarred ? m.unreadCount + 1 : Math.max(0, m.unreadCount - 1) };
      }
      return m;
    }));

    if (selectedEmail?.id === email.id) {
      if (selectedMailbox === 'STARRED' && !newStarred) {
        setSelectedEmail(null);
      } else {
        setSelectedEmail({ ...selectedEmail, isStarred: newStarred });
      }
    }

    const hide = message.loading(newStarred ? 'Starring...' : 'Unstarring...', 0);

    // Then sync with backend
    try {
      await emailService.toggleStar(email.id, newStarred);
      hide();
      message.success(newStarred ? 'Starred' : 'Unstarred');

      // V45: Guaranteed refresh after delay (Increased to 3s for better sync stability)
      setTimeout(() => {
        Promise.all([
          loadMailboxes(),
          // Refresh list if in Starred
          selectedMailbox?.toUpperCase() === 'STARRED' ? loadEmails(currentPage, true) : Promise.resolve()
        ]).finally(() => {
          setIsRestoring(null);
          setIsStabilizing(null);
        });
      }, 3000);
    } catch (error: any) {
      hide();
      setIsRestoring(null);
      console.error('Star error:', error);
      message.error('Failed to update star, reverting...');

      // Rollback on failure
      setEmails(prev => prev.map(e =>
        e.id === email.id ? { ...e, isStarred: originalStarred } : e
      ));
      if (selectedEmail?.id === email.id) {
        setSelectedEmail(prev => prev ? { ...prev, isStarred: originalStarred } : null);
      }
      loadMailboxes();
    }
  };

  const handleDelete = async (e: React.MouseEvent, email: Email) => {
    e.stopPropagation();
    if (isRestoring === email.id) return;

    const emailIndex = emails.findIndex(em => em.id === email.id);
    const deleteAction = () => {
      setIsRestoring(email.id);
      const originalEmails = [...emails];

      // Optimistic update FIRST (instant UI feedback)
      setEmails(prev => prev.filter(e => e.id !== email.id));
      setTotalEmails(prev => Math.max(0, prev - 1));

      if (selectedEmail?.id === email.id) {
        setSelectedEmail(null);
        setShowMobileDetail(false);
      }

      // Optimistic update for mailbox counts
      setMailboxes(prev => prev.map(m => {
        const mid = (selectedMailbox || 'INBOX').toUpperCase();

        // 1. Handle current mailbox decrease
        if (normalizeMailboxId(m.id) === mid) {
          // Inbox uses unreadCount; others (Drafts, Starred, Sent, Spam) use total count in our UI
          const isTotalCountMailbox = mid !== 'INBOX';
          const decreaseBy = isTotalCountMailbox ? 1 : (email.isRead ? 0 : 1);
          return { ...m, unreadCount: Math.max(0, m.unreadCount - decreaseBy) };
        }

        // 2. Handle Trash increase (only if not already in Trash)
        if (normalizeMailboxId(m.id) === 'TRASH' && mid !== 'TRASH') {
          return { ...m, unreadCount: m.unreadCount + 1 };
        }

        // 3. Handle Starred count cross-mailbox
        if (m.id === 'STARRED' && email.isStarred && mid !== 'STARRED') {
          return { ...m, unreadCount: Math.max(0, m.unreadCount - 1) };
        }

        return m;
      }));

      message.success('Email deleted');

      const deletePromise = selectedMailbox === 'TRASH'
        ? emailService.deleteEmailPermanently(email.id)
        : emailService.deleteEmail(email.id);

      setIsStabilizing(selectedMailbox === 'TRASH' ? 'Deleting permanently...' : 'Moving to Trash...');

      deletePromise
        .then(() => {
          // V49: Increased delay to 3s and clear stabilizing
          setTimeout(() => {
            Promise.all([
              loadMailboxes(),
              loadEmails(currentPage, true)
            ]).finally(() => {
              setIsRestoring(null);
              setIsStabilizing(null);
            });
          }, 3000);
        })
        .catch((err: any) => {
          console.error('Delete failed:', err);
          message.error('Failed to delete email');
          setEmails(originalEmails);
          setIsRestoring(null);
          setIsStabilizing(null);
        });
    };

    if (selectedMailbox === 'TRASH') {
      setConfirmModal({
        visible: true,
        title: 'Delete Permanently?',
        content: 'This action cannot be undone. Are you sure you want to permanently delete this email?',
        okText: 'Delete Permanently',
        danger: true,
        onConfirm: () => {
          setConfirmModal(prev => ({ ...prev, visible: false }));
          deleteAction();
        }
      });
    } else {
      deleteAction();
    }
  };

  const handleMarkSpam = async (email: Email) => {
    if (isRestoring === email.id) return;
    setIsRestoring(email.id);

    const originalEmails = [...emails];
    setEmails(prev => prev.filter(e => e.id !== email.id));
    if (selectedEmail?.id === email.id) {
      setSelectedEmail(null);
      setShowMobileDetail(false);
    }

    // Optimistic update for mailbox counts
    setMailboxes(prev => prev.map(m => {
      const mid = (selectedMailbox || 'INBOX').toUpperCase();
      if (m.id === mid) {
        const isTotalCountMailbox = mid !== 'INBOX';
        const decreaseBy = isTotalCountMailbox ? 1 : (email.isRead ? 0 : 1);
        return { ...m, unreadCount: Math.max(0, m.unreadCount - decreaseBy) };
      }
      if (m.id === 'SPAM') {
        return { ...m, unreadCount: m.unreadCount + 1 };
      }
      if (m.id === 'STARRED' && email.isStarred && mid !== 'STARRED') {
        return { ...m, unreadCount: Math.max(0, m.unreadCount - 1) };
      }
      return m;
    }));

    emailService.markAsSpam(email.id)
      .then(() => {
        // V49: Guaranteed refresh after 2s delay
        setTimeout(() => {
          Promise.all([
            loadMailboxes(),
            loadEmails(currentPage, true)
          ]).finally(() => {
            setIsRestoring(null);
          });
        }, 2000);
      })
      .catch((error) => {
        setIsRestoring(null);
        console.error('Spam move error:', error);
        message.error('Failed to move to Spam');
        loadEmails(currentPage, true);
      });
  };

  const handleToggleSelect = (e: React.MouseEvent | React.ChangeEvent, emailId: string) => {
    if (e.stopPropagation) e.stopPropagation();
    setSelectedEmailIds(prev => {
      const next = new Set(prev);
      if (next.has(emailId)) next.delete(emailId);
      else next.add(emailId);
      // V50: If we manually deselect one, we are no longer selecting "all in mailbox"
      if (next.size < emails.length) setIsAllSelectedInMailbox(false);
      return next;
    });
  };

  const handleSelectAll = (e: any) => {
    if (e.target.checked) {
      const allIds = emails.map(em => String(em.id));
      setSelectedEmailIds(new Set(allIds));
    } else {
      setSelectedEmailIds(new Set());
      setIsAllSelectedInMailbox(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedEmailIds.size === 0) return;
    
    const ids = isAllSelectedInMailbox ? null : Array.from(selectedEmailIds);
    const bulkFilters = isAllSelectedInMailbox ? { 
      mailboxId: selectedMailbox, 
      unread: filters.unread, 
      hasAttachments: filters.hasAttachment 
    } : {};
    
    const isTrash = (selectedMailbox || '').toUpperCase() === 'TRASH';
    
    const performBulkDelete = async () => {
      setIsBulkProcessing(true);
      const hide = message.loading(isTrash ? 'Deleting permanently...' : 'Moving to Trash...', 0);
      try {
        if (isTrash) {
          await emailService.bulkDeleteEmails(ids, bulkFilters);
        } else {
          await emailService.bulkModifyEmails(ids, ['TRASH'], [], bulkFilters);
        }
        message.success(`${isAllSelectedInMailbox ? 'All matching' : ids?.length} emails ${isTrash ? 'permanently deleted' : 'moved to Trash'}`);
        
        // V50: Close detail view if the currently open email was deleted
        if (selectedEmail && (isAllSelectedInMailbox || ids?.includes(String(selectedEmail.id)))) {
          setSelectedEmail(null);
          setShowMobileDetail(false);
          setReadingEmailId(null); // V50: Clear reading state to allow bolding
        }

        setSelectedEmailIds(new Set());
        setIsAllSelectedInMailbox(false);
        loadEmails(currentPage, true);
        loadMailboxes();
      } catch (err) {
        console.error('Bulk delete failed:', err);
        message.error('Bulk action failed');
      } finally {
        hide();
        setIsBulkProcessing(false);
      }
    };

    if (isTrash) {
      setConfirmModal({
        visible: true,
        title: 'Delete Multiple Permanently?',
        content: `Are you sure you want to permanently delete ${isAllSelectedInMailbox ? totalEmails : ids?.length} selected emails? This cannot be undone.`,
        okText: 'Delete Permanently',
        danger: true,
        onConfirm: () => {
          setConfirmModal(prev => ({ ...prev, visible: false }));
          performBulkDelete();
        }
      });
    } else {
      performBulkDelete();
    }
  };

  const handleBulkToggleStar = async (star: boolean) => {
    // V50: Optimization - only process IDs that need changing
    let idsToProcess: string[] | null = null;
    
    if (!isAllSelectedInMailbox) {
      const selectedList = emails.filter(e => selectedEmailIds.has(String(e.id)));
      idsToProcess = selectedList
        .filter(e => e.isStarred !== star)
        .map(e => String(e.id));
      
      if (idsToProcess.length === 0) {
        message.info(star ? 'All selected emails are already starred' : 'All selected emails are already unstarred');
        setSelectedEmailIds(new Set());
        return;
      }
    } else {
      // If full mailbox selection, we pass null to let backend handle it, 
      // but we could technically add a "onlyStarred" or "onlyUnstarred" filter if API supported it.
      // For now, let's stick to the current filter-based logic.
      idsToProcess = null;
    }

    const ids = idsToProcess;
    const bulkFilters = isAllSelectedInMailbox ? { 
      mailboxId: selectedMailbox, 
      unread: filters.unread, 
      hasAttachments: filters.hasAttachment 
    } : {};

    setIsBulkProcessing(true);
    setIsStabilizing(star ? 'Starring conversations...' : 'Unstarring conversations...');
    const hide = message.loading(star ? 'Starring...' : 'Unstarring...', 0);

    const originalEmails = [...emails];
    const targetIds = ids || emails.map(e => String(e.id));

    // V50: Optimistic update for list - only those that actually change
    setEmails(prev => prev.map(e => {
      if (isAllSelectedInMailbox || targetIds.includes(String(e.id))) {
        return { ...e, isStarred: star };
      }
      return e;
    }));

    // V50: Optimistic update for mailbox counts
    setMailboxes(prev => prev.map(m => {
      if (m.id.toUpperCase() === 'STARRED') {
        const countChange = isAllSelectedInMailbox ? totalEmails : targetIds.length;
        return { ...m, unreadCount: star ? m.unreadCount + countChange : Math.max(0, m.unreadCount - countChange) };
      }
      return m;
    }));

    try {
      if (star) await emailService.bulkModifyEmails(ids, ['STARRED'], [], bulkFilters);
      else await emailService.bulkModifyEmails(ids, [], ['STARRED'], bulkFilters);
      
      message.success(`${isAllSelectedInMailbox ? 'All matching' : targetIds.length} emails updated`);
      
      // V50: Close detail view if the opened email was affected by bulk star
      if (selectedEmail && (isAllSelectedInMailbox || targetIds.includes(String(selectedEmail.id)))) {
        setSelectedEmail(null);
        setShowMobileDetail(false);
        setReadingEmailId(null);
      }

      setSelectedEmailIds(new Set());
      setIsAllSelectedInMailbox(false);
      
      // V50: Refresh with delay for backend sync
      setTimeout(() => {
        Promise.all([
          loadEmails(currentPage, true),
          loadMailboxes()
        ]).finally(() => {
          setIsStabilizing(null);
        });
      }, 3000);
    } catch (err) {
      console.error('Bulk star failed:', err);
      message.error('Bulk action failed');
      setEmails(originalEmails);
      setIsStabilizing(null);
    } finally {
      hide();
      setIsBulkProcessing(false);
    }
  };

  const handleBulkMarkRead = async (read: boolean) => {
    const ids = isAllSelectedInMailbox ? null : Array.from(selectedEmailIds);
    const bulkFilters = isAllSelectedInMailbox ? { 
      mailboxId: selectedMailbox, 
      unread: filters.unread, 
      hasAttachments: filters.hasAttachment 
    } : {};

    setIsBulkProcessing(true);
    const hide = message.loading(read ? 'Marking as read...' : 'Marking as unread...', 0);
    try {
      if (read) await emailService.bulkModifyEmails(ids, [], ['UNREAD'], bulkFilters);
      else await emailService.bulkModifyEmails(ids, ['UNREAD'], [], bulkFilters);
      message.success(`${isAllSelectedInMailbox ? 'All matching' : ids?.length} emails updated`);
      
      // V50: Close detail view if the opened email was affected by bulk read/unread
      if (selectedEmail && (isAllSelectedInMailbox || ids?.includes(String(selectedEmail.id)))) {
        setSelectedEmail(null);
        setShowMobileDetail(false);
        setReadingEmailId(null);
      }

      setSelectedEmailIds(new Set());
      setIsAllSelectedInMailbox(false);
      loadEmails(currentPage, true);
      loadMailboxes();
    } catch (err) {
      message.error('Bulk action failed');
    } finally {
      hide();
      setIsBulkProcessing(false);
    }
  };

  const handleRestoreToInbox = async (email: Email) => {
    if (isRestoring) return;
    setIsRestoring(email.id);

    const fromMailbox = (email.mailboxId || '').toUpperCase() === 'TRASH' ? 'TRASH' : 'SPAM';
    const originalEmails = [...emails];

    // Remove from list immediately
    setEmails(prev => prev.filter(e => e.id !== email.id));

    if (selectedEmail?.id === email.id) {
      setSelectedEmail(null);
      setShowMobileDetail(false);
    }
    // V45: Optimistic update for mailbox counts - intelligently restore to the correct destination
    setMailboxes(prev => prev.map(m => {
      if (m.id === fromMailbox) {
        return { ...m, unreadCount: Math.max(0, m.unreadCount - 1) };
      }

      const destination = (email.previousStatus || 'INBOX').toUpperCase();
      // Backend handles logic to return to SENT or DRAFTS if that was previous status
      const targetId = destination === 'DRAFT' ? 'DRAFTS' : destination;

      if (m.id === targetId) {
        // V49: Distinguish between INBOX (unread) and others (total)
        const increment = (targetId === 'INBOX') ? (email.isRead ? 0 : 1) : 1;
        return { ...m, unreadCount: m.unreadCount + increment };
      }

      if (m.id === 'STARRED' && email.isStarred) {
        // Starred tracks TOTAL count
        return { ...m, unreadCount: m.unreadCount + 1 };
      }
      return m;
    }));

    setIsRestoring(email.id);
    setIsStabilizing(`Restoring to ${fromMailbox === 'SPAM' ? 'Inbox' : 'original folder'}...`);

    emailService.restoreToInbox(email.id, fromMailbox as 'TRASH' | 'SPAM')
      .then(() => {
        message.success('Email restored successfully');

        // V43: 1s delay (WebSocket handles real-time updates now)
        setTimeout(() => {
          // Promise.all to ensure both finish before clearing restoring state
          Promise.all([
            loadMailboxes(),
            loadEmails(currentPage, true)
          ]).finally(() => {
            setIsRestoring(null);
            setIsStabilizing(null);
          });
        }, 3000);
      })
      .catch((err: any) => {
        console.error('Restore failed:', err);
        message.error('Failed to restore email');
        setIsRestoring(null);
        setIsStabilizing(null);
      });
  };

  const handleEmptyTrash = async () => {
    setConfirmModal({
      visible: true,
      title: 'Empty Trash Folder?',
      content: 'This will permanently delete all emails in your trash. This action is irreversible.',
      okText: 'Empty Trash',
      danger: true,
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, visible: false }));

        setIsStabilizing('Emptying trash folder...');
        const hide = message.loading('Emptying trash...', 0);
        try {
          await emailService.emptyTrash();
          hide();
          message.success('Trash emptied successfully');
          setEmails([]);
          setTotalEmails(0);

          setMailboxes(prev => prev.map(m =>
            m.id === 'TRASH' ? { ...m, unreadCount: 0 } : m
          ));

          setTimeout(() => {
            setIsStabilizing(null);
            loadMailboxes();
            loadEmails(1);
          }, 3000);
        } catch (err: any) {
          hide();
          console.error('Empty trash failed:', err);
          message.error('Failed to empty trash');
          setIsStabilizing(null);
        }
      }
    });
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

      // Mark as read in backend and update counts if not already read
      if (!card.isRead) {
        emailService.markAsRead(card.id).catch(err => console.error('Failed to mark as read from Kanban', err));

        // Optimistic update for emails list
        setEmails(prev => prev.map(e => e.id === card.id ? { ...e, isRead: true } : e));

        // Optimistic update for mailbox unread count - ONLY for Inbox
        setMailboxes(prev => prev.map(m => {
          if (normalizeMailboxId(m.id) === 'INBOX') {
            return { ...m, unreadCount: Math.max(0, m.unreadCount - 1) };
          }
          return m;
        }));
      }

      // Fetch full email details
      const fullEmail = await emailService.getEmailDetail(card.id);

      // Update selected email only if it's still the same one (user hasn't closed/switched)
      setSelectedEmail(prev => (prev && prev.id === card.id ? fullEmail : prev));

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

  // CRITICAL: Keep the ref updated with the latest callback (v10.32)
  useEffect(() => {
    handleNotificationRef.current = handleNotification;
  }, [handleNotification]);

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
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Button
                type="text"
                icon={<MenuOutlined />}
                onClick={() => setMobileDrawerOpen(true)}
                className="hidden-desktop mobile-menu-btn"
                style={{ fontSize: '20px', padding: 0, width: '40px', height: '40px' }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }} onClick={() => handleMailboxSelect('INBOX')}>
                <div className="inline-flex items-center justify-center w-8 h-8 rounded-lg shadow-sm text-white logo-icon" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
                    <path d="M20 3v4" /><path d="M22 5h-4" /><path d="M4 17v2" /><path d="M5 18H3" />
                  </svg>
                </div>
                <Title level={4} className="logo-text" style={{ margin: 0, color: '#1a1a1a', letterSpacing: '-0.5px', fontWeight: 700 }}>MailBoard</Title>
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
                      onClick={handleCompose}
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
                        <div className="flex justify-between items-center w-full group">
                          <span className="flex-1">{mailbox.displayName}</span>
                          <div className="flex items-center gap-2">
                            {mailbox.unreadCount > 0 && (
                              <span className="gmail-mailbox-count">{mailbox.unreadCount}</span>
                            )}
                          </div>
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
                  sortLayers={sortLayers}
                  onFilterChange={setFilters}
                  onSortLayersChange={setSortLayers}
                  onSync={handleSync}
                  onRefresh={handleRefresh}
                  onReset={handleResetFilters}
                  onEmptyTrash={(selectedMailbox || '').toUpperCase() === 'TRASH' && (mailboxes.find(m => m.id.toUpperCase() === 'TRASH')?.unreadCount || 0) > 0 ? handleEmptyTrash : undefined}
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
                      className={`flex flex-col bg-white border-r border-gray-100 ${showMobileDetail ? 'hidden lg:flex' : 'flex w-full'}`}
                      style={{
                        width: viewMode === 'list' ? (selectedEmail ? `${listWidth}px` : '100%') : '100%',
                        transition: isResizing ? 'none' : 'width 0.3s ease',
                        minWidth: viewMode === 'list' ? (selectedEmail ? '280px' : 'auto') : 'auto'
                      }}
                    >
                      {viewMode === 'list' ? (
                        <>
                          <div className="p-2 border-b border-gray-100 flex items-center justify-between" style={{ paddingLeft: '24px', minHeight: '48px' }}>
                            <div className="flex items-center gap-3">
                              <Checkbox 
                                indeterminate={selectedEmailIds.size > 0 && selectedEmailIds.size < emails.length}
                                checked={emails.length > 0 && selectedEmailIds.size === emails.length}
                                onChange={handleSelectAll}
                                style={{ marginLeft: '4px' }}
                              />
                              {selectedEmailIds.size > 0 ? (
                                <div className="flex items-center gap-2 animate-in fade-in duration-200">
                                  <Text strong style={{ marginRight: '12px', fontSize: '13px' }}>{selectedEmailIds.size} selected</Text>
                                  <Tooltip title="Mark as Read">
                                    <Button size="small" type="text" icon={<MailOutlined />} onClick={() => handleBulkMarkRead(true)} disabled={isBulkProcessing} />
                                  </Tooltip>
                                  <Tooltip title="Mark as Unread">
                                    <Button size="small" type="text" icon={<MailFilled />} onClick={() => handleBulkMarkRead(false)} disabled={isBulkProcessing} />
                                  </Tooltip>
                                  {(() => {
                                    const allStarred = Array.from(selectedEmailIds).every(id => emails.find(e => String(e.id) === id)?.isStarred);
                                    return (
                                      <Tooltip title={allStarred ? "Unstar Selected" : "Star Selected"}>
                                        <Button 
                                          size="small" 
                                          type="text" 
                                          icon={allStarred ? <StarFilled style={{ color: '#faad14' }} /> : <StarOutlined />} 
                                          onClick={() => handleBulkToggleStar(!allStarred)} 
                                          disabled={isBulkProcessing} 
                                        />
                                      </Tooltip>
                                    );
                                  })()}
                                  <Tooltip title="Delete Selected">
                                    <Button size="small" type="text" icon={<DeleteOutlined style={{ color: '#ff4d4f' }} />} onClick={handleBulkDelete} disabled={isBulkProcessing} />
                                  </Tooltip>
                                </div>
                              ) : (
                                <Title level={5} style={{ margin: 0 }}>
                                  {selectedMailboxTitle}
                                </Title>
                              )}
                            </div>
                            {selectedEmailIds.size === 0 && (
                               <div className="flex items-center gap-2">
                                  <Text type="secondary" style={{ fontSize: '12px' }}>{totalEmails} total</Text>
                               </div>
                            )}
                          </div>
                          
                          {/* V50: Select All Banner */}
                          {selectedEmailIds.size === emails.length && totalEmails > emails.length && (
                            <div className="bg-blue-50 border-b border-blue-100 p-2 text-center animate-in slide-in-from-top duration-300">
                              <Text style={{ fontSize: '13px' }}>
                                {isAllSelectedInMailbox ? (
                                  <>
                                    All <strong>{totalEmails}</strong> conversations in {selectedMailboxTitle} are selected. 
                                    <Button type="link" size="small" onClick={() => {
                                      setSelectedEmailIds(new Set());
                                      setIsAllSelectedInMailbox(false);
                                    }}>Clear selection</Button>
                                  </>
                                ) : (
                                  <>
                                    All <strong>{emails.length}</strong> conversations on this page are selected. 
                                    <Button type="link" size="small" onClick={() => setIsAllSelectedInMailbox(true)}>
                                      Select all <strong>{totalEmails}</strong> conversations in {selectedMailboxTitle}
                                    </Button>
                                  </>
                                )}
                              </Text>
                            </div>
                          )}
                          <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-2 inbox-list-scroll" style={{ paddingLeft: '24px', paddingRight: '12px' }}>
                            {emailsLoading ? (
                              <div className="p-12 text-center">
                                <Spin size="large" />
                                <p style={{ marginTop: '16px', color: '#64748b' }}>Fetching your emails...</p>
                              </div>
                            ) : emailsError ? (
                              <div className="p-12 text-center">
                                <Empty
                                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                                  description={
                                    <div style={{ color: '#ef4444' }}>
                                      <p style={{ fontSize: '16px', fontWeight: 500, marginBottom: '4px' }}>Oops! Something went wrong</p>
                                      <p style={{ fontSize: '14px', color: '#64748b' }}>{emailsError}</p>
                                      <Button
                                        type="primary"
                                        danger
                                        ghost
                                        size="small"
                                        icon={<ReloadOutlined />}
                                        onClick={() => loadEmails(1)}
                                        style={{ marginTop: '16px', borderRadius: '8px' }}
                                      >
                                        Try Again
                                      </Button>
                                    </div>
                                  }
                                />
                              </div>
                            ) : (
                              <>
                                <List
                                  locale={{
                                    emptyText: (
                                      <Empty
                                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                                        description={
                                          <div style={{ color: '#64748b' }}>
                                            <p style={{ fontSize: '16px', fontWeight: 500, marginBottom: '4px' }}>
                                              {searchQuery ? 'No matching emails found' : `${selectedMailboxTitle} is clear!`}
                                            </p>
                                            <p style={{ fontSize: '14px' }}>
                                              {searchQuery
                                                ? 'Try adjusting your search query or filters'
                                                : `There are no emails in your ${selectedMailboxTitle.toLowerCase()}.`}
                                            </p>
                                            {!searchQuery && (
                                              <Button
                                                type="primary"
                                                ghost
                                                size="small"
                                                icon={<ReloadOutlined />}
                                                onClick={() => loadEmails(1)}
                                                style={{ marginTop: '16px', borderRadius: '8px' }}
                                              >
                                                Check for new emails
                                              </Button>
                                            )}
                                          </div>
                                        }
                                      />
                                    )
                                  }}
                                  dataSource={emails}
                                  renderItem={(email, index) => {
                                    const emailIdStr = String(email.id);
                                    const isReadOptimistic = optimisticStatusMap[emailIdStr] !== undefined
                                      ? optimisticStatusMap[emailIdStr]
                                      : email.isRead;
                                    const shouldShowBold = !isReadOptimistic && readingEmailId !== emailIdStr;
                                    const isSelected = String(selectedEmail?.id) === emailIdStr;

                                    return (
                                      <Card
                                        id={`email-item-${email.id}`}
                                        key={email.id}
                                        hoverable
                                        className={`mail-item-card cursor-pointer transition-all ${isSelected ? 'email-card-selected' : ''}`}
                                        styles={{ body: { padding: '12px' } }}
                                        onClick={() => {
                                          setActiveIndex(index);
                                          handleEmailSelect(email);
                                        }}
                                      >
                                        <div className="flex items-start gap-3">
                                          {/* Selection Checkbox */}
                                          <div onClick={(e) => e.stopPropagation()} style={{ paddingTop: '8px' }}>
                                            <Checkbox 
                                              checked={selectedEmailIds.has(emailIdStr)}
                                              onChange={(e: any) => handleToggleSelect(e, emailIdStr)}
                                            />
                                          </div>

                                          {/* Left: Avatar */}
                                          <Avatar
                                            className="flex-shrink-0"
                                            style={{ backgroundColor: email.isRead ? '#f1f5f9' : '#e0e7ff', color: email.isRead ? '#64748b' : '#4f46e5', fontWeight: 600 }}
                                          >
                                            {email.from.name ? email.from.name.charAt(0).toUpperCase() : (email.from.email ? email.from.email.charAt(0).toUpperCase() : '?')}
                                          </Avatar>

                                          {/* Middle: Content */}
                                          <div className="flex-1 min-w-0">
                                            <div className="flex justify-between items-start mb-0.5">
                                              <div className="flex items-center gap-2 min-w-0">
                                                {/* V49: Robust unread dot logic */}
                                                {shouldShowBold && !isSelected && (
                                                  <div className="unread-dot flex-shrink-0" />
                                                )}
                                                <div
                                                  className="mail-item-sender truncate"
                                                  style={{
                                                    fontWeight: shouldShowBold ? 700 : 500,
                                                    fontSize: '14px',
                                                    color: shouldShowBold ? '#1e293b' : '#64748b',
                                                    transition: 'none'
                                                  }}
                                                >
                                                  {(() => {
                                                    const currentMailbox = (selectedMailbox || 'INBOX').toUpperCase();
                                                    const prevStatus = (email.previousStatus || '').toUpperCase();

                                                    // V43: Robust outgoing detection
                                                    const isMe = email.isFromMe || (email.accountEmail && email.from.email.toLowerCase() === email.accountEmail.toLowerCase());
                                                    const isOutgoingStyle = currentMailbox === 'DRAFTS' || currentMailbox === 'DRAFT' || currentMailbox === 'SENT' ||
                                                      (currentMailbox === 'TRASH' && (prevStatus === 'DRAFTS' || prevStatus === 'DRAFT' || prevStatus === 'SENT' || isMe));

                                                    if (isOutgoingStyle) {
                                                      const recipient = email.to && email.to.length > 0
                                                        ? (typeof email.to[0] === 'string' ? email.to[0] : (email.to[0].name || email.to[0].email))
                                                        : '(No recipient)';

                                                      return (
                                                        <span className="text-blue-600">
                                                          <span style={{ fontWeight: 500, marginRight: '4px' }}>To:</span>
                                                          {recipient}
                                                          {email.to && email.to.length > 1 ? ` (+${email.to.length - 1})` : ''}
                                                        </span>
                                                      );
                                                    }

                                                    if (isMe) return 'You';
                                                    let name = email.fromName || email.from.name;
                                                    const emailAddr = email.from.email;
                                                    if (name) {
                                                      name = name.replace(/^"|"$/g, '').trim();
                                                      if (name.includes('<') && name.includes('>')) {
                                                        const match = name.match(/^(.*?)\s*</);
                                                        if (match && match[1]) name = match[1].trim();
                                                      }
                                                      name = name.replace(/^"|"$/g, '').trim();
                                                    }
                                                    if (name && name.toLowerCase() !== emailAddr.toLowerCase() && !name.includes('@')) return name;
                                                    const domain = emailAddr.split('@')[1];
                                                    const commonProviders = ['gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com', 'icloud.com', 'aol.com', 'protonmail.com'];
                                                    if (domain && !commonProviders.includes(domain.toLowerCase())) {
                                                      const parts = domain.split('.');
                                                      let brand = parts[parts.length - 2];
                                                      if (brand === 'com' || brand === 'edu' || brand === 'org' || brand === 'net' || brand === 'io' || brand === 'ai') {
                                                        brand = parts[parts.length - 3] || brand;
                                                      }
                                                      if (brand) return brand.charAt(0).toUpperCase() + brand.slice(1).toLowerCase();
                                                    }
                                                    return emailAddr.split('@')[0];
                                                  })()}
                                                </div>
                                                <div className="flex items-center gap-1 flex-shrink-0">
                                                  {email.hasPhysicalAttachments && (
                                                    <PaperClipOutlined style={{ fontSize: '11px', color: '#94a3b8' }} />
                                                  )}
                                                  {email.hasCloudLinks && (
                                                    <CloudOutlined style={{ fontSize: '11px', color: '#3b82f6' }} />
                                                  )}
                                                </div>
                                              </div>

                                              <div className="flex items-center gap-2 flex-shrink-0 mail-item-actions">
                                                {selectedMailbox === 'TRASH' && (
                                                  <Tooltip title="Restore to Original Folder">
                                                    <div
                                                      className="mail-action-icon restore-btn"
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleRestoreToInbox(email);
                                                      }}
                                                    >
                                                      <ReloadOutlined style={{ fontSize: '14px' }} />
                                                    </div>
                                                  </Tooltip>
                                                )}

                                                {isReadOptimistic ? (
                                                  <Tooltip title="Mark as unread">
                                                    <div
                                                      onClick={(e) => handleMarkAsUnread(e, email)}
                                                      className={`mail-action-icon unread-btn ${processingIds.has(emailIdStr) ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                      style={processingIds.has(emailIdStr) ? { pointerEvents: 'none' } : {}}
                                                    >
                                                      <MailFilled style={{ fontSize: '14px' }} />
                                                    </div>
                                                  </Tooltip>
                                                ) : (
                                                  <Tooltip title="Mark as read">
                                                    <div
                                                      onClick={(e) => handleMarkAsRead(e, email)}
                                                      className={`mail-action-icon read-btn ${processingIds.has(emailIdStr) ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                      style={processingIds.has(emailIdStr) ? { pointerEvents: 'none' } : {}}
                                                    >
                                                      <MailOutlined style={{ fontSize: '14px', color: '#64748b' }} />
                                                    </div>
                                                  </Tooltip>
                                                )}

                                                <Tooltip title={email.isStarred ? 'Unstar' : 'Star'}>
                                                  <div
                                                    onClick={(e) => handleStar(e, email)}
                                                    className={`mail-action-icon star-btn ${email.isStarred ? 'is-starred' : ''}`}
                                                  >
                                                    {email.isStarred ? (
                                                      <StarFilled style={{ color: '#f59e0b', fontSize: '14px' }} />
                                                    ) : (
                                                      <StarOutlined style={{ fontSize: '14px' }} />
                                                    )}
                                                  </div>
                                                </Tooltip>

                                                <Tooltip title={selectedMailbox === 'TRASH' ? 'Delete Permanently' : 'Move to Trash'}>
                                                  <div
                                                    onClick={(e) => handleDelete(e, email)}
                                                    className="mail-action-icon delete-btn"
                                                  >
                                                    <DeleteOutlined style={{ fontSize: '14px' }} />
                                                  </div>
                                                </Tooltip>

                                                <div className="mail-item-date" style={{ fontSize: '11px', whiteSpace: 'nowrap', marginLeft: '4px', color: '#64748b' }}>
                                                  {(selectedMailbox || '').toUpperCase() === 'TRASH' && email.deletedAt ? (
                                                    <span style={{ color: '#ef4444', fontWeight: 500 }}>
                                                      {(() => {
                                                        const expiry = new Date(new Date(email.deletedAt).getTime() + 30 * 24 * 60 * 60 * 1000);
                                                        const diff = expiry.getTime() - Date.now();
                                                        if (diff <= 0) return 'Expired';
                                                        const d = Math.floor(diff / 86400000);
                                                        const h = Math.floor((diff % 86400000) / 3600000);
                                                        const m = Math.floor((diff % 3600000) / 60000);
                                                        return `${d}d ${h}h ${m}m`;
                                                      })()}
                                                    </span>
                                                  ) : (
                                                    formatDate(email.receivedAt)
                                                  )}
                                                </div>
                                              </div>
                                            </div>

                                            <div className="mail-item-subject block truncate" style={{
                                              fontWeight: shouldShowBold ? 700 : 400,
                                              color: '#1e293b',
                                              fontSize: '14px',
                                              transition: 'none'
                                            }}>
                                              {email.subject}
                                            </div>
                                            <div className="mail-item-preview block truncate" style={{ marginTop: '2px', color: '#64748b', fontSize: '13px' }}>
                                              {email.preview || (email.body ? email.body.replace(/<style([\s\S]*?)<\/style>/gi, '').replace(/<script([\s\S]*?)<\/script>/gi, '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 100) : '')}
                                            </div>
                                          </div>
                                        </div>
                                      </Card>
                                    );
                                  }}
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
                          sortLayers={sortLayers}
                          mailboxId={selectedMailbox}
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
                      <div className={`flex-1 overflow-y-auto ${!showMobileDetail ? 'hidden lg:flex' : 'flex w-full absolute inset-0 z-50 lg:relative lg:w-auto'}`}>
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
                          onMarkAsUnread={handleMarkAsUnread}
                          onMarkAsRead={handleMarkAsRead}
                          loadingSummary={loadingSummary}
                          onDownloadAttachment={handleDownloadAttachment}
                          showMobileDetail={showMobileDetail}
                          showBackButton={showMobileDetail}
                          isRestoring={isRestoring === (selectedEmail?.id || '')}
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
                      handleCompose();
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

          {/* Stabilizing Overlay (V43) */}
          {isStabilizing && (
            <div className="stabilizing-overlay">
              <div className="stabilizing-content">
                <Spin size="large" />
                <div className="stabilizing-text">
                  <Text strong style={{ fontSize: '16px', color: '#1e293b' }}>{isStabilizing}</Text>
                  <Text type="secondary" style={{ fontSize: '13px', display: 'block', marginTop: '4px' }}>
                    Syncing changes with Gmail...
                  </Text>
                </div>
              </div>
            </div>
          )}

          <ComposeModal
            visible={isComposeVisible}
            onCancel={handleComposeClose}
            onSend={handleComposeSend}
            onSaveDraft={handleDraftUpdate}
            onDiscard={() => {
              // If we were editing an existing draft, decrease the count
              if (replyToEmail && (replyToEmail.mailboxId?.toUpperCase() === 'DRAFTS' || replyToEmail.mailboxId?.toUpperCase() === 'DRAFT')) {
                setMailboxes(prev => prev.map(m => {
                  if (m.id === 'DRAFTS') {
                    return { ...m, unreadCount: Math.max(0, m.unreadCount - 1) };
                  }
                  return m;
                }));
              }
              loadEmails(1);
              loadMailboxes(); // Refresh counts
            }}
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
              },
              mask: {
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                background: 'rgba(0, 0, 0, 0.4)'
              }
            }}
            className="email-detail-modal"
            destroyOnHidden
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

          {/* Custom Glassmorphism Confirmation Modal */}
          <Modal
            title={confirmModal.title}
            open={confirmModal.visible}
            onOk={confirmModal.onConfirm}
            onCancel={() => setConfirmModal(prev => ({ ...prev, visible: false }))}
            okText={confirmModal.okText}
            okButtonProps={{ danger: confirmModal.danger, className: 'rounded-lg' }}
            cancelButtonProps={{ className: 'rounded-lg' }}
            className="glass-confirm-modal"
            styles={{
              mask: {
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                background: 'rgba(0, 0, 0, 0.4)'
              },
              content: {
                background: 'rgba(255, 255, 255, 0.95)',
                backdropFilter: 'blur(20px) saturate(180%)',
                WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                border: '1px solid rgba(255, 255, 255, 0.5)',
                borderRadius: '20px',
                boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.15)'
              }
            }}
            centered
            destroyOnHidden
          >
            <div className="py-2">
              <Text>{confirmModal.content}</Text>
            </div>
          </Modal>

          {/* Mobile Navigation & FAB */}
          {isMobile && !showMobileDetail && (
            <>
              <div className="mobile-bottom-nav">
                <div
                  className={`mobile-nav-item ${selectedMailbox === 'INBOX' ? 'active' : ''}`}
                  onClick={() => handleMailboxSelect('INBOX')}
                >
                  <InboxOutlined />
                  <span>Inbox</span>
                </div>
                <div
                  className={`mobile-nav-item ${selectedMailbox === 'STARRED' ? 'active' : ''}`}
                  onClick={() => handleMailboxSelect('STARRED')}
                >
                  <StarOutlined />
                  <span>Starred</span>
                </div>
                <div
                  className={`mobile-nav-item ${selectedMailbox === 'SENT' ? 'active' : ''}`}
                  onClick={() => handleMailboxSelect('SENT')}
                >
                  <SendOutlined />
                  <span>Sent</span>
                </div>
                <div
                  className={`mobile-nav-item ${(selectedMailbox === 'DRAFTS' || selectedMailbox === 'DRAFT') ? 'active' : ''}`}
                  onClick={() => handleMailboxSelect('DRAFTS')}
                >
                  <FileTextOutlined />
                  <span>Drafts</span>
                </div>
                <div
                  className="mobile-nav-item"
                  onClick={() => setMobileDrawerOpen(true)}
                >
                  <BarsOutlined />
                  <span>More</span>
                </div>
              </div>

              <Button
                type="primary"
                shape="circle"
                icon={<EditOutlined style={{ fontSize: '24px' }} />}
                size="large"
                className="mobile-fab-compose"
                onClick={handleCompose}
              />
            </>
          )}
        </Layout >
      </InlineAlertContext.Provider>
    </ProtectedRoute >
  );
}
