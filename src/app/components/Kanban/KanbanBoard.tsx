import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { message } from 'antd';
import {
  DndContext,
  closestCenter,
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
    if (id in cols) {
      return id;
    }
    return Object.keys(cols).find((key) => cols[key].find((c) => c.id === id));
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    const activeIdVal = active.id as string;
    setActiveId(null);

    if (!over) return;

    const overId = over.id as string;

    // Check if we are dragging a COLUMN or a CARD
    const isActiveColumn = meta.some(m => m.id === activeIdVal);
    const isOverColumn = meta.some(m => m.id === overId);

    if (isActiveColumn) {
      if (activeIdVal === overId) return;

      const oldIndex = meta.findIndex(m => m.id === activeIdVal);
      const newIndex = meta.findIndex(m => m.id === overId);
      
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

    // Original Card Drag logic
    const activeContainer = findContainer(activeIdVal, columns);
    const overContainer = findContainer(overId, columns);

    if (!activeContainer || !overContainer) return;

    if (activeContainer === overContainer && active.id === over.id) return;

    // 1. Calculate new position and order
    const sourceList = [...columns[activeContainer]];
    const destList = activeContainer === overContainer ? sourceList : [...columns[overContainer]];
    
    const activeIndex = sourceList.findIndex(c => c.id === activeIdVal);
    const overIndex = destList.findIndex(c => c.id === overId);
    
    let newIndex = overIndex === -1 ? 0 : overIndex;
    
    const [movedItem] = sourceList.splice(activeIndex, 1);
    destList.splice(newIndex, 0, movedItem);

    const prevItem = destList[newIndex - 1]; 
    const nextItem = destList[newIndex + 1]; 
    
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

    setColumns((prev) => ({
      ...prev,
      [activeContainer]: sourceList,
      [overContainer]: destList,
    }));

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
    
    // 1. Check if it's a column
    const foundMeta = meta.find(m => m.id === activeId);
    if (foundMeta) {
      return (
        <KanbanColumnComponent
          id={foundMeta.id}
          label={foundMeta.label}
          color={foundMeta.color}
          cards={processedColumns[foundMeta.key] || []}
          onRefresh={() => {}}
          onCardClick={() => {}}
        />
      );
    }

    // 2. Otherwise it's a card
    for (const key in columns) {
      const found = columns[key].find(c => c.id === activeId);
      if (found) return <KanbanCard card={found} onRefresh={() => { }} onClick={() => { }} />;
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
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 h-full min-w-fit pb-4">
          <SortableContext items={meta.map(m => m.id)} strategy={horizontalListSortingStrategy}>
            {meta.map((col) => (
              <KanbanColumnComponent
                key={col.key}
                id={col.id} // use database ID for sortable!
                label={col.label}
                color={col.color}
                cards={processedColumns[col.key] || []}
                onRefresh={fetchBoard}
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
