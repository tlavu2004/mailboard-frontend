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
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import {
  ReloadOutlined,
  SettingOutlined,
  CloudSyncOutlined
} from '@ant-design/icons';
import { KanbanCardType, ColMeta, kanbanService } from '@/services/kanbanService';
import { emailService } from '@/services/email';
import KanbanColumn from './KanbanColumn';
import KanbanCard from './KanbanCard';
import KanbanSettingsModal from './KanbanSettingsModal';

import { FilterState, SortMode } from '../FilterBar';

export default function KanbanBoard({ 
  onCardClick,
  filters,
  sortMode
}: { 
  onCardClick: (card: KanbanCardType) => void,
  filters: FilterState,
  sortMode: SortMode
}) {
  const [columns, setColumns] = useState<Record<string, KanbanCardType[]>>({});
  const [meta, setMeta] = useState<ColMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);

  // Fetch only column metadata (lighter than full board)
  const fetchColumnsMeta = useCallback(async () => {
    try {
      const columnsData = await kanbanService.getColumns();
      const incomingMeta: ColMeta[] = columnsData
        .sort((a, b) => a.order - b.order)
        .map(col => ({
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
      const sortBy = sortMode.startsWith('date') ? 'date' : (sortMode === 'sender' ? 'sender' : 'date');
      const sortOrder = sortMode === 'date-asc' ? 'asc' : 'desc';

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
      const incomingMeta: ColMeta[] = columnsData
        .sort((a, b) => a.order - b.order)
        .map(col => ({
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
    const activeContainer = findContainer(activeIdVal, columns);
    const overContainer = findContainer(overId, columns);

    if (!activeContainer || !overContainer) return;

    if (activeContainer === overContainer && active.id === over.id) return;

    // 1. Calculate new position and order
    const sourceList = [...columns[activeContainer]];
    const destList = activeContainer === overContainer ? sourceList : [...columns[overContainer]];
    
    const activeIndex = sourceList.findIndex(c => c.id === activeIdVal);
    const overIndex = destList.findIndex(c => c.id === overId);
    
    // Option B: Default to top (index 0) if dropping on column itself
    let newIndex = overIndex === -1 ? 0 : overIndex;
    
    // Remove from source
    const [movedItem] = sourceList.splice(activeIndex, 1);
    
    // Adjust newIndex if moving within same container
    if (activeContainer === overContainer && activeIndex < newIndex) {
      // no-op, splice already handled the shift
    }

    // Insert into destination
    destList.splice(newIndex, 0, movedItem);

    // 2. Calculate kanbanOrder
    // Since we sort by DESC, higher index means lower order.
    // Neighbors for order calculation:
    const prevItem = destList[newIndex - 1]; // Item above
    const nextItem = destList[newIndex + 1]; // Item below
    
    let newOrder: number;
    const GAP = 1000; // Large initial gap for new items

    if (!prevItem && !nextItem) {
      // Only item in column
      newOrder = Date.now(); 
    } else if (!prevItem) {
      // Dropped at the top
      newOrder = (nextItem.kanbanOrder || 0) + GAP;
    } else if (!nextItem) {
      // Dropped at the bottom
      newOrder = (prevItem.kanbanOrder || 0) - GAP;
    } else {
      // Dropped between two items
      newOrder = ((prevItem.kanbanOrder || 0) + (nextItem.kanbanOrder || 0)) / 2;
    }

    movedItem.kanbanOrder = newOrder;

    // 3. Optimistic Update
    setColumns((prev) => ({
      ...prev,
      [activeContainer]: sourceList,
      [overContainer]: destList,
    }));

    // 4. API Call
    try {
      await kanbanService.moveCard(activeIdVal, overContainer, newOrder);
    } catch (err) {
      console.error("Move failed", err);
      message.error("Failed to save new position");
      fetchBoard(); // Revert
    }
  };

  const renderActiveCard = () => {
    if (!activeId) return null;
    // Find the card data
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
    <div className="h-full overflow-x-auto p-5 bg-gray-50 flex flex-col">
      <div className="flex justify-end mb-4 gap-2">
        <button title="Board Settings" onClick={() => setSettingsOpen(true)} className="p-2 text-gray-400 hover:text-blue-600 transition-colors bg-white rounded-lg border border-gray-100 shadow-sm">
          <SettingOutlined />
        </button>
        <button title="Refresh Board" onClick={fetchBoard} className="p-2 text-gray-400 hover:text-blue-600 transition-colors bg-white rounded-lg border border-gray-100 shadow-sm">
          <ReloadOutlined spin={loading} />
        </button>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 h-full min-w-fit pb-4">
          {meta.map((col) => (
            <KanbanColumn
              key={col.key}
              id={col.key}
              label={col.label}
              color={col.color}
              cards={processedColumns[col.key] || []}
              onRefresh={fetchBoard}
              onCardClick={onCardClick}
            />
          ))}
        </div>

        <DragOverlay>
          {renderActiveCard()}
        </DragOverlay>
      </DndContext>

      <KanbanSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onColumnsChanged={fetchColumnsMeta}
      />
    </div>
  );
}
