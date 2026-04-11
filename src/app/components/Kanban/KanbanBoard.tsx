import React, { useEffect, useState, useMemo, useCallback } from 'react';
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
import { FilterState, SortMode } from '../FilterBar';

export interface ColumnWithMeta extends ColMeta {
  id: string; // Database ID for sortable items
}

export default function KanbanBoard({ 
  onCardClick,
  filters,
  sortMode,
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
  sortMode: SortMode,
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

  // Fetch only column metadata (lighter than full board)
  const fetchColumnsMeta = useCallback(async () => {
    try {
      const columnsData = await kanbanService.getColumns();
      const incomingMeta: ColumnWithMeta[] = columnsData
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

  const fetchBoard = useCallback(async () => {
    setLoading(true);
    try {
      // map sortMode to backend params
      const [sortBy, sortOrder] = sortMode.split('-');

      const [boardData, columnsData] = await Promise.all([
        kanbanService.getKanban({
          unread: filters.unread,
          hasAttachments: filters.hasAttachment,
          sortBy,
          sortOrder,
        }),
        kanbanService.getColumns(),
      ]);

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

      const incomingCols = boardData.columns || {};

      // Ensure all meta columns exist in state even if empty
      const finalCols: Record<string, KanbanCardType[]> = {};
      incomingMeta.forEach(m => {
        finalCols[m.key] = [];
      });
      // Merge actual data
      Object.entries(incomingCols).forEach(([k, v]) => {
        if (v) finalCols[k] = v;
      });

      setColumns(finalCols);
      setMeta(incomingMeta);
      setError('');
    } catch (err) {
      setError('Failed to load Kanban board');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [filters, sortMode]);

  useEffect(() => {
    fetchBoard();
  }, [fetchBoard]);

  // Handle real-time notifications
  const handleNotification = useCallback((msg: { type: string; message: string }) => {
    if (msg.type === 'NEW_EMAILS') {
      message.info('New emails received! Updating Kanban...');
      fetchBoard();
    }
  }, [fetchBoard]);

  useEmailNotifications(accountId, handleNotification);

  const handleSync = async () => {
    setSyncLoading(true);
    try {
      await emailService.syncEmails();
      message.success('Sync completed. Refreshing board...');
      await fetchBoard();
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
        newIndex = overItems.length + 1;
      } else {
        const isBelowLastItem = over && overIndex === overItems.length - 1;
        const modifier = isBelowLastItem ? 1 : 0;
        newIndex = overIndex >= 0 ? overIndex + modifier : overItems.length + 1;
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

  const handleCardSnooze = useCallback((cardId: string, until: string) => {
    // Immediate UI Update: Remove card from current column and potentially add to SNOOZED
    setColumns(prev => {
      const newCols = { ...prev };
      let snoozedItem: KanbanCardType | undefined;

      // Find and remove from any column
      Object.keys(newCols).forEach(key => {
        const idx = newCols[key].findIndex(c => c.id === cardId);
        if (idx !== -1) {
          [snoozedItem] = newCols[key].splice(idx, 1);
          newCols[key] = [...newCols[key]];
        }
      });

      // Add to SNOOZED if it exists in state
      if (snoozedItem && newCols['SNOOZED']) {
        newCols['SNOOZED'] = [
          { ...snoozedItem, snoozedUntil: until },
          ...newCols['SNOOZED']
        ];
      }

      return newCols;
    });
    
    // Then refresh in background to stay in sync with server
    fetchBoard();
  }, [fetchBoard]);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    const activeIdVal = active.id as string;
    setActiveId(null);

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
      fetchBoard(); 
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
            onRefresh={() => {}}
            onSnooze={() => {}}
            onCardClick={() => {}}
          />
        );
      }
    }

    // 2. Otherwise it's a card
    for (const key in columns) {
      const found = columns[key].find(c => c.id === activeId);
      if (found) return (
        <div style={{ pointerEvents: 'none' }}>
           <KanbanCard card={found} onRefresh={() => { }} onSnooze={() => { }} onClick={() => { }} />
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
            onClick={fetchBoard}
            className="px-3 py-1 bg-white border border-red-300 rounded hover:bg-red-50 text-sm"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-x-auto p-5 bg-gray-50 flex flex-col pt-0">

      <DndContext
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
                onRefresh={fetchBoard}
                onSnooze={handleCardSnooze}
                onCardClick={onCardClick}
              />
            ))}
          </SortableContext>
          
          <AddColumnButton onClick={onAddColumnClick || (() => {})} />
        </div>

        <DragOverlay>
          {renderActiveOverlay()}
        </DragOverlay>
      </DndContext>

      <KanbanSettingsModal
        open={settingsOpen}
        onClose={onSettingsClose}
        onColumnsChanged={fetchColumnsMeta}
        initialSelectedColumnId={initialSelectedColumnId}
        triggerAddOnOpen={triggerAddOnOpen}
      />
    </div>
  );
}
