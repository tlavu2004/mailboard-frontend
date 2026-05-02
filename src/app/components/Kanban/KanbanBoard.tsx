import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { message } from 'antd';
import {
  DndContext,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  DragEndEvent,
  DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
  arrayMove
} from '@dnd-kit/sortable';
import {
  ReloadOutlined,
  SettingOutlined,
  CloudSyncOutlined
} from '@ant-design/icons';
import { KanbanCardType, ColMeta, kanbanService, KanbanColumn } from '@/services/kanbanService';
import { emailService } from '@/services/email';
import KanbanColumnComponent from './KanbanColumn';
import KanbanCard from './KanbanCard';
import KanbanSettingsModal from './KanbanSettingsModal';
import AddColumnButton from '../AddColumnButton';

import { useEmailNotifications } from '@/hooks/useEmailNotifications';
import { FilterState } from '../FilterBar';

export interface ColumnWithMeta extends ColMeta {
  id: string; // Database ID for sortable items
}

export default function KanbanBoard({
  onCardClick,
  filters,
  sortLayers,
  mailboxId,
  accountId,
  settingsOpen,
  onSettingsClose,
  onOpenSettingsWithColumn,
  onAddColumnClick,
  initialSelectedColumnId,
  triggerAddOnOpen,
}: {
  onCardClick: (card: KanbanCardType) => void,
  filters: FilterState,
  sortLayers: { field: string, order: 'asc' | 'desc' }[],
  mailboxId: string,
  accountId: number | string | null,
  settingsOpen: boolean,
  onSettingsClose: () => void,
  onOpenSettingsWithColumn?: (columnId: string) => void,
  onAddColumnClick?: () => void,
  initialSelectedColumnId?: string,
  triggerAddOnOpen?: boolean,
}) {
  const [columns, setColumns] = useState<Record<string, KanbanCardType[]>>({});
  const [meta, setMeta] = useState<ColumnWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeIsColumn, setActiveIsColumn] = useState(false); // track dragged type to avoid ID conflicts
  const [syncLoading, setSyncLoading] = useState(false);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const dragPreviewRef = useRef<KanbanCardType | null>(null);
  const [boardKey, setBoardKey] = useState(0);
  const fetchCountRef = useRef(0);

  const scrollToColumn = useCallback((colKey: string) => {
    const container = boardRef.current;
    if (!container || !colKey) return;

    // Try to find matching element case-insensitively
    const nodes = Array.from(container.querySelectorAll('[data-column-key]')) as HTMLElement[];
    const lower = colKey.toLowerCase();
    let target: HTMLElement | undefined = nodes.find(n => (n.dataset.columnKey || '').toLowerCase() === lower);
    if (!target) {
      // fallback: try direct query
      target = container.querySelector(`[data-column-key="${colKey}"]`) as HTMLElement | null || undefined;
    }
    if (target) {
      // Center column into view horizontally
      const left = target.offsetLeft - (container.offsetLeft || 0);
      const center = Math.max(0, left + (target.offsetWidth / 2) - (container.clientWidth / 2));
      container.scrollTo({ left: center, behavior: 'smooth' });
    }
  }, []);

  // Fetch only column metadata (lighter than full board)
  const fetchColumnsMeta = useCallback(async () => {
    try {
      // Force refresh with cache buster
      const columnsData = await kanbanService.getColumns();
      const incomingMeta: ColumnWithMeta[] = columnsData
        .filter(col => (col.key || '').toUpperCase() !== 'SPAM') // V10.42: Hide Spam
        .sort((a, b) => a.order - b.order)
        .map(col => ({
          id: col.id,
          key: col.key,
          label: col.label,
          color: col.color
        }));
      setMeta(incomingMeta);
    } catch (err) {
      console.error('Failed to fetch columns meta:', err);
    }
  }, []);


  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const fetchBoard = useCallback(async (silent = false) => {
    const requestId = ++fetchCountRef.current;
    if (!silent) {
      setLoading(true);
      // V50: Clear columns and meta immediately for non-silent loads to show skeletons
      setColumns({});
      setMeta([]);
    }
    try {
      const [boardData, columnsData] = await Promise.all([
        emailService.getKanban(mailboxId, sortLayers),
        kanbanService.getColumns(),
      ]);

      if (requestId !== fetchCountRef.current) return;

      // Map KanbanColumn[] to ColMeta[]
      // Sort by order to ensure correct display order
      const incomingMeta: ColumnWithMeta[] = columnsData
        .sort((a, b) => a.order - b.order)
        .map(col => ({
          id: col.id,
          key: col.key,
          label: col.label,
          color: col.color
        }));

      const incomingCols = (boardData.columns || {}) as Record<string, KanbanCardType[]>;

      // Ensure all meta columns exist in state even if empty
      const finalCols: Record<string, KanbanCardType[]> = {};
      incomingMeta.forEach(m => {
        finalCols[m.key] = [];
      });
      // Merge actual data
      Object.entries(incomingCols).forEach(([k, v]) => {
        if (v) finalCols[k] = v;
      });

      console.log('[KanbanBoard] fetchBoard -> meta keys:', incomingMeta.map(m => m.key));
      console.log('[KanbanBoard] fetchBoard -> finalCols keys:', Object.keys(finalCols).map(k => ({ k, len: finalCols[k]?.length || 0 })));

      setColumns(finalCols);
      setMeta(incomingMeta);
      setError('');
    } catch (err) {
      if (requestId === fetchCountRef.current) {
        setError('Failed to load Kanban board');
      }
      console.error(err);
    } finally {
      if (requestId === fetchCountRef.current) {
        setLoading(false);
      }
    }
  }, [filters, sortLayers, mailboxId]);

  useEffect(() => {
    fetchBoard();
  }, [fetchBoard]);

  // Handle real-time notifications
  const handleNotification = useCallback(async (msg: any) => {
    if (msg.type === 'DELETED_EMAILS') {
      const emailIds = msg.emailIds || (msg.emailId ? [msg.emailId] : []);
      setColumns(prev => {
        const next = { ...prev };
        Object.keys(next).forEach(key => {
          next[key] = next[key].filter(c => !emailIds.includes(String(c.id)));
        });
        return next;
      });
      return;
    }

    if (msg.type === 'NEW_EMAILS' || msg.type === 'UPDATED_EMAILS') {
      if (msg.type === 'NEW_EMAILS') {
        message.info('New emails received! Updating Kanban...');
      }
      try {
        await fetchBoard(true);

        // If backend provided specific email IDs, highlight those cards (no navigation)
        if (Array.isArray(msg.emailIds) && msg.emailIds.length > 0) {
          const ids: string[] = msg.emailIds.map((x: any) => String(x));
          const container = boardRef.current;
          if (container) {
            ids.forEach((idToShow: string) => {
              const cardNode = container.querySelector(`[data-card-id="${idToShow}"]`) as HTMLElement | null;
              if (cardNode) {
                // temporary visual highlight
                const prevTransition = cardNode.style.transition;
                cardNode.style.transition = 'box-shadow 200ms, transform 200ms';
                const prevBox = cardNode.style.boxShadow;
                const prevTransform = cardNode.style.transform;
                cardNode.style.boxShadow = '0 0 0 4px rgba(99,102,241,0.18)';
                cardNode.style.transform = 'scale(1.01)';
                setTimeout(() => {
                  cardNode.style.boxShadow = prevBox || '';
                  cardNode.style.transform = prevTransform || '';
                  cardNode.style.transition = prevTransition || '';
                }, 1800);
              }
            });
          }
        }
      } catch (err) {
        console.warn('Failed to refresh Kanban board on NEW_EMAILS', err);
      }
    }
  }, [fetchBoard]);

  useEmailNotifications(accountId, handleNotification);

  const handleSync = async () => {
    setSyncLoading(true);
    try {
      await emailService.syncEmails();
      message.success('Sync completed. Refreshing board...');
      await fetchBoard(true);
    } catch (err) {
      console.error('Sync failed:', err);
      message.error('Failed to sync emails from Gmail');
    } finally {
      setSyncLoading(false);
    }
  };

  const findContainer = (id: string, cols: Record<string, KanbanCardType[]>) => {
    // 1. Check if ID is a column key (logical name)
    if (id in cols) {
      return id;
    }
    // 2. Check if ID is a card ID within any column
    const foundByCard = Object.keys(cols).find((key) => cols[key].find((c) => c.id === id));
    if (foundByCard) return foundByCard;

    // 3. Check if ID is a column DB ID (from meta)
    const cleanId = id.startsWith('col-') ? id.replace('col-', '') : id;
    const foundMeta = meta.find(m => m.id === cleanId);
    if (foundMeta) return foundMeta.key;

    return undefined;
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
    // Use data.type to distinguish columns from cards — avoids false match when IDs overlap
    setActiveIsColumn(event.active.data.current?.type === 'column');
    // Store a stable preview of the dragged item so DragOverlay can render it
    try {
      const id = event.active.id as string;
      for (const key in columns) {
        const found = columns[key].find(c => c.id === id);
        if (found) {
          dragPreviewRef.current = found;
          break;
        }
      }
    } catch (err) {
      // ignore
    }

  };

  const handleDragOver = (event: any) => {
    const { active, over } = event;
    const activeIdVal = active.id as string;
    const overId = over?.id as string;

    if (!overId) return;

    // PROTECTION: If we are dragging a column, don't process card-over logic
    const isActiveColumn = active.data.current?.type === 'column';
    if (isActiveColumn) return;

    // Also skip if over element is another column (not a card target)
    const isOverColumn = over?.data.current?.type === 'column' || overId in columns;

    // Find containers
    const activeContainer = findContainer(activeIdVal, columns);
    const overContainer = findContainer(overId, columns);

    if (!activeContainer || !overContainer || activeContainer === overContainer) {
      return;
    }

    // Logic to move item between containers in STATE
    setColumns((prev) => {
      const activeItems = prev[activeContainer];
      const overItems = prev[overContainer];

      const activeIndex = activeItems.findIndex((item) => item.id === activeIdVal);
      const overIndex = overItems.findIndex((item) => item.id === overId);

      let newIndex;
      // Determine if we are over a column itself or a card inside it

      if (isOverColumn) {
        newIndex = overItems.length;
      } else {
        const isBelowLastItem = over && overIndex === overItems.length - 1;
        const modifier = isBelowLastItem ? 1 : 0;
        newIndex = overIndex >= 0 ? overIndex + modifier : overItems.length;
      }

      const activeItem = activeItems[activeIndex];
      if (!activeItem) return prev; // Safety check

      return {
        ...prev,
        [activeContainer]: [...prev[activeContainer].filter((item) => item.id !== activeIdVal)],
        [overContainer]: [
          ...prev[overContainer].slice(0, newIndex),
          activeItem,
          ...prev[overContainer].slice(newIndex, prev[overContainer].length)
        ]
      };
    });
  };

  // Debounced refresh helper to coalesce multiple snooze events and avoid races
  const refreshDebounceRef = useRef<number | null>(null);
  const scheduleFetchBoard = useCallback(() => {
    if (refreshDebounceRef.current) {
      window.clearTimeout(refreshDebounceRef.current);
    }
    console.log('[KanbanBoard] scheduleFetchBoard: scheduling fetch in 700ms');

    // Slightly longer debounce to allow backend to process snooze
    refreshDebounceRef.current = window.setTimeout(() => {
      console.log('[KanbanBoard] scheduleFetchBoard: executing fetchBoard');

      fetchBoard(true);
      refreshDebounceRef.current = null;
    }, 700);
  }, [fetchBoard]);

  const handleCardSnooze = useCallback((cardId: string, until: string) => {
    console.log('[KanbanBoard] handleCardSnooze called', { cardId, until, metaKeys: meta.map(m => m.key) });


    // If a drag is currently active, avoid mutating columns (which causes the DragOverlay to show a floating placeholder).
    // Instead, clear the active drag and schedule a fetch to let the server return the updated board.
    if (activeId) {
      console.log('[KanbanBoard] active drag detected during snooze, clearing active drag and remounting DnD to clear shadow');

      // Clear local drag state
      setActiveId(null);
      setActiveIsColumn(false);
      dragPreviewRef.current = null;
      // Force remount of the DnD context to clear any internal drag overlay state
      setBoardKey(k => k + 1);
      // Allow remount to settle then fetch board to reconcile state
      window.setTimeout(() => fetchBoard(true), 60);
      return;
    }

    // No active drag - perform optimistic move to Snoozed column and refresh in background
    setColumns((prev) => {
      console.log('[KanbanBoard] setColumns(prev) called - prev sizes:', Object.keys(prev).map(k => ({ k, len: prev[k].length })));

      // shallow-copy the top-level map and each array to avoid mutating state
      const newCols: Record<string, KanbanCardType[]> = {};
      Object.keys(prev).forEach(k => {
        newCols[k] = prev[k] ? prev[k].slice() : [];
      });

      // Remove any existing occurrences across all columns
      let foundItem: KanbanCardType | undefined;
      for (const k of Object.keys(newCols)) {
        const idx = newCols[k].findIndex(c => c.id === cardId);
        if (idx !== -1) {
          foundItem = newCols[k][idx];
          newCols[k].splice(idx, 1);
        }
      }

      // Find the key for the Snoozed column from meta (be tolerant to case and variants)
      const snoozedMeta = meta.find(m => {
        const k = (m.key || '').toLowerCase();
        const l = (m.label || '').toLowerCase();
        return k.includes('snooz') || l.includes('snooz');
      });
      let snoozedKey: string | undefined = snoozedMeta ? snoozedMeta.key : undefined;

      // If meta didn't reveal it, try to find a matching key in current columns state
      if (!snoozedKey) {
        const foundInPrev = Object.keys(prev).find(k => k.toLowerCase().includes('snooz'));
        if (foundInPrev) snoozedKey = foundInPrev;
      }

      if (!snoozedKey) {
        console.warn('[KanbanBoard] Could not determine Snoozed column key; aborting optimistic placement and refreshing from server. Meta keys:', meta.map(m => m.key));

        // Immediately fetch board to reconcile
        fetchBoard(true);
        return prev;
      }

      if (!newCols[snoozedKey]) newCols[snoozedKey] = [];

      // If the card already exists in Snoozed, update it. Otherwise insert at the top.
      const existingIdx = newCols[snoozedKey].findIndex(c => c.id === cardId);
      if (existingIdx !== -1) {
        newCols[snoozedKey][existingIdx] = { ...newCols[snoozedKey][existingIdx], snoozedUntil: until };
      } else {
        const placeholder: KanbanCardType = foundItem ? { ...foundItem, snoozedUntil: until } : {
          id: cardId,
          sender: '',
          subject: '',
          summary: '',
          preview: '',
          gmailUrl: '',
          receivedAt: new Date().toISOString(),
          isRead: false,
          hasAttachments: false,
          hasCloudLinks: false,
          hasPhysicalAttachments: false,
          kanbanOrder: Date.now(),
          snoozedUntil: until
        } as KanbanCardType;

        newCols[snoozedKey] = [placeholder, ...newCols[snoozedKey]];
      }

      console.log('[KanbanBoard] setColumns -> new sizes:', Object.keys(newCols).map(k => ({ k, len: newCols[k].length })));

      return newCols;
    });

    // Refresh immediately to reconcile with server state
    fetchBoard(true);
  }, [meta, scheduleFetchBoard, fetchBoard, activeId]);

  // Listen for external snooze events (e.g. snoozed from EmailDetail modal)
  useEffect(() => {
    const handler = (e: Event) => {
      try {
        const ce = e as CustomEvent;
        const detail = ce.detail || {};
        console.log('[KanbanBoard] Received kanban:snoozed event', detail);

        // schedule a refresh to reflect server state
        scheduleFetchBoard();
        // If an external snooze occurred while a DragOverlay is active, clear it
        setActiveId(null);
        setActiveIsColumn(false);
      } catch (err) {
        console.warn('kanban:snoozed handler error', err);
      }
    };
    window.addEventListener('kanban:snoozed', handler as EventListener);
    return () => window.removeEventListener('kanban:snoozed', handler as EventListener);
  }, [scheduleFetchBoard]);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    const activeIdVal = active.id as string;
    setActiveId(null);
    // clear stable preview when drag ends
    dragPreviewRef.current = null;

    if (!over) return;
    const overId = over.id as string;

    // Check if we are dragging a COLUMN or a CARD — use data.type, not ID comparison
    const isActiveColumn = active.data.current?.type === 'column';
    const cleanActiveId = activeIdVal.startsWith('col-') ? activeIdVal.replace('col-', '') : activeIdVal;

    setActiveIsColumn(false);
    if (isActiveColumn) {
      const cleanOverId = overId.startsWith('col-') ? overId.replace('col-', '') : overId;
      if (cleanActiveId === cleanOverId) return;

      const oldIndex = meta.findIndex(m => m.id === cleanActiveId);
      const newIndex = meta.findIndex(m => m.id === cleanOverId);
      if (newIndex === -1) return; // Dropped over something that isn't a column

      const newMetaOrder = arrayMove(meta, oldIndex, newIndex);
      setMeta(newMetaOrder);

      try {
        await kanbanService.reorderColumns(newMetaOrder.map(m => m.id));
        message.success('Columns reordered');
      } catch (error) {
        console.error('Failed to reorder columns:', error);
        message.error('Failed to save column order');
        fetchColumnsMeta();
      }
      return;
    }

    // Card Drag logic
    const activeContainer = findContainer(activeIdVal, columns);
    const overContainer = findContainer(overId, columns);

    if (!activeContainer || !overContainer) return;

    // The columns state has already been updated by handleDragOver
    // We just need to find the item in its NEW container, calculate order and persist
    const currentItems = columns[overContainer];
    const activeIndex = currentItems.findIndex(c => c.id === activeIdVal);
    const movedItem = currentItems[activeIndex];

    if (!movedItem) return;

    // Calculate new position and order
    const prevItem = currentItems[activeIndex - 1];
    const nextItem = currentItems[activeIndex + 1];

    let newOrder: number;
    const GAP = 1000;

    if (!prevItem && !nextItem) {
      newOrder = Date.now();
    } else if (!prevItem) {
      newOrder = (nextItem.kanbanOrder || 0) + GAP;
    } else if (!nextItem) {
      newOrder = (prevItem.kanbanOrder || 0) - GAP;
    } else {
      newOrder = ((prevItem.kanbanOrder || 0) + (nextItem.kanbanOrder || 0)) / 2;
    }

    movedItem.kanbanOrder = newOrder;

    try {
      await kanbanService.moveCard(activeIdVal, overContainer, newOrder);
    } catch (err) {
      console.error("Move failed", err);
      message.error("Failed to save new position");
      fetchBoard(true);
    }
  };

  const renderActiveOverlay = () => {
    if (!activeId) return null;

    // 1. Check if it's a column (use activeIsColumn state, NOT meta.find by ID)
    if (activeIsColumn) {
      const cleanId = activeId.startsWith('col-') ? activeId.replace('col-', '') : activeId;
      const foundMeta = meta.find(m => m.id === cleanId);
      if (foundMeta) {
        return (
          <KanbanColumnComponent
            id={foundMeta.id}
            columnKey={foundMeta.key}
            label={foundMeta.label}
            color={foundMeta.color}
            cards={processedColumns[foundMeta.key] || []}
            onRefresh={() => { }}
            onSnooze={() => { }}
            onCardClick={() => { }}
          />
        );
      }
    }

    // 2. Otherwise it's a card
    for (const key in columns) {
      const found = columns[key].find(c => c.id === activeId);
      if (found) return (
        <div style={{ pointerEvents: 'none' }}>
          <KanbanCard card={found} onRefresh={() => { }} onSnooze={() => { }} onClick={() => { }} isSnoozed={String(key).toLowerCase().includes('snooz')} />
        </div>
      );
    }

    // If the card was removed from columns due to optimistic updates, fall back to the stable preview
    if (dragPreviewRef.current && dragPreviewRef.current.id === activeId) {
      return (
        <div style={{ pointerEvents: 'none' }}>
          <KanbanCard card={dragPreviewRef.current} onRefresh={() => { }} onSnooze={() => { }} onClick={() => { }} isSnoozed={Boolean(dragPreviewRef.current?.snoozedUntil)} />
        </div>
      );
    }
    return null;
  };

  // When server returns filtered/sorted columns we can use them directly
  const processedColumns = useMemo(() => columns, [columns]);

  // Loading Skeleton
  if (loading && meta.length === 0) {
    return (
      <div className="flex gap-4 p-5 h-full overflow-hidden">
        {[1, 2, 3].map(i => (
          <div key={i} className="w-[320px] rounded-xl bg-gray-50 px-2 py-3 h-full flex flex-col gap-3">
            <div className="h-8 w-1/2 bg-gray-200 rounded animate-pulse" />
            <div className="h-24 w-full bg-white rounded-xl animate-pulse" />
            <div className="h-24 w-full bg-white rounded-xl animate-pulse" />
            <div className="h-24 w-full bg-white rounded-xl animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="m-4 rounded-md bg-red-50 p-4 text-red-700">
        <div className="flex justify-between items-center">
          <span>{error}</span>
          <button
            onClick={() => fetchBoard()}
            className="px-3 py-1 bg-white border border-red-300 rounded hover:bg-red-50 text-sm"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={boardRef} className="h-full overflow-x-auto p-5 bg-gray-50 flex flex-col pt-0">

      <DndContext
        key={boardKey}
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 h-full min-w-fit pb-4">
          <SortableContext items={meta.map(m => `col-${m.id}`)} strategy={horizontalListSortingStrategy}>
            {meta.map((col) => (
              <KanbanColumnComponent
                key={col.key}
                id={col.id}
                columnKey={col.key}
                label={col.label}
                color={col.color}
                cards={processedColumns[col.key] || []}
                onRefresh={() => fetchBoard()}
                onSnooze={handleCardSnooze}
                onCardClick={onCardClick}
              />
            ))}
          </SortableContext>

          <AddColumnButton onClick={onAddColumnClick || (() => { })} />
        </div>

        <DragOverlay>
          {renderActiveOverlay()}
        </DragOverlay>
      </DndContext>

      <KanbanSettingsModal
        open={settingsOpen}
        onClose={onSettingsClose}
        onColumnsChanged={fetchBoard}
        initialSelectedColumnId={initialSelectedColumnId}
        triggerAddOnOpen={triggerAddOnOpen}
        columnCounts={Object.keys(columns).reduce((acc, key) => {
          acc[key] = columns[key]?.length || 0;
          return acc;
        }, {} as Record<string, number>)}
      />

    </div>
  );
}
