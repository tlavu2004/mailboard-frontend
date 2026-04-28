import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import KanbanCard from './KanbanCard';
import { KanbanCardType } from '@/services/kanbanService';
import {
  InboxOutlined,
  ThunderboltFilled,
  CheckSquareFilled,
  ClockCircleOutlined,
  ProjectOutlined,
  TagOutlined,
  HolderOutlined,
} from '@ant-design/icons';
import { Empty } from 'antd';

interface KanbanColumnProps {
  id: string;       // DB UUID - used for column sorting (useSortable)
  columnKey: string; // Logical key e.g. "INBOX" - used for card dropping (useDroppable)
  label: string;
  color?: string;
  cards: KanbanCardType[];
  onRefresh: () => void;
  onSnooze: (cardId: string, until: string) => void;
  onCardClick: (card: KanbanCardType) => void;
}

const getColumnConfig = (id: string, label: string) => {
  const lowerId = id.toLowerCase();
  const lowerLabel = (label || '').toLowerCase();

  if (lowerId.includes('inbox') || lowerLabel.includes('inbox')) {
    return { bg: 'bg-white', icon: <InboxOutlined />, iconColor: 'text-blue-500', badgeColor: 'bg-blue-50 text-blue-600' };
  }
  if (lowerId.includes('todo') || lowerId.includes('to do') || lowerId.includes('unprocessed') || lowerLabel.includes('chưa xử lý')) {
    return { bg: 'bg-white', icon: <ThunderboltFilled />, iconColor: 'text-orange-500', badgeColor: 'bg-orange-50 text-orange-600' };
  }
  if (lowerId.includes('process') || lowerLabel.includes('process') || lowerLabel.includes('doing') || lowerLabel.includes('đang')) {
    return { bg: 'bg-white', icon: <ProjectOutlined />, iconColor: 'text-purple-500', badgeColor: 'bg-purple-50 text-purple-600' };
  }
  if (lowerId.includes('snoozed') || lowerLabel.includes('snooze') || lowerLabel.includes('tạm hoãn')) {
    return { bg: 'bg-white', icon: <ClockCircleOutlined />, iconColor: 'text-indigo-400', badgeColor: 'bg-indigo-50 text-indigo-600' };
  }
  if (lowerId.includes('done') || lowerLabel.includes('finished') || lowerLabel.includes('xong') || lowerLabel.includes('đã xử lý')) {
    return { bg: 'bg-white', icon: <CheckSquareFilled />, iconColor: 'text-green-500', badgeColor: 'bg-green-50 text-green-600' };
  }

  // Default for custom columns
  return { bg: 'bg-white', icon: <TagOutlined />, iconColor: 'text-gray-500', badgeColor: 'bg-gray-100 text-gray-600' };
}

function KanbanColumn({ id, columnKey, label, color, cards, onRefresh, onSnooze, onCardClick }: KanbanColumnProps) {
  const {
    attributes,
    listeners,
    setNodeRef: setSortableRef,
    transform,
    transition,
    isDragging
  } = useSortable({
    // Prefix ensures this ID never overlaps with card IDs in dnd-kit's SortableContext
    id: `col-${id}`,
    // Tag type so DndContext can distinguish columns from cards even if IDs overlap
    data: { type: 'column', columnKey },
  });

  // Use columnKey as droppable ID so it matches the columns state (e.g. "INBOX", "TODO")
  const { setNodeRef: setDroppableRef } = useDroppable({ id: columnKey });

  const config = getColumnConfig(columnKey, label);

  const sortableStyle = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : 1,
  };

  const bgStyle = color ? { backgroundColor: color } : undefined;
  const bgClass = color ? '' : config.bg;

  return (
    <div
      ref={setSortableRef}
      data-column-key={columnKey}
      style={sortableStyle}
      className={`relative flex h-full w-[380px] shrink-0 flex-col rounded-2xl px-4 py-5 border border-gray-100 shadow-[0_4px_20px_-10px_rgba(0,0,0,0.08)] transition-all ${bgClass} ${isDragging ? 'rotate-1 border-blue-200 scale-[1.02]' : ''}`}
    >
      <div
        style={bgStyle}
        className={`absolute inset-0 rounded-2xl -z-10 ${bgClass}`}
      />

      {/* Top Accent Border */}
      <div className={`absolute top-0 left-0 right-0 h-1 rounded-t-2xl ${config.iconColor.replace('text', 'bg')}`} />

      {/* Header */}
      <div className="mb-4 flex items-center justify-between px-2">
        <div className="flex items-center gap-2">
          {/* Drag Handle - left-click here to reorder columns */}
          <div
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 transition-colors p-1 -ml-2"
            title="Drag to reorder column"
          >
            <HolderOutlined />
          </div>
          <span className={`text-xl ${config.iconColor}`}>
            {config.icon}
          </span>
          <h3 className="text-lg font-bold text-gray-700 m-0 cursor-default select-none">{label}</h3>
        </div>
        <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${config.badgeColor}`}>
          {cards.length}
        </span>
      </div>

      {/* Droppable Area */}
      <div
        ref={setDroppableRef}
        className="flex-1 overflow-y-auto"
      >
        <SortableContext items={cards.map(c => c.id)} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <KanbanCard
              key={card.id}
              card={card}
              onRefresh={onRefresh}
              onSnooze={onSnooze}
              onClick={onCardClick}
              isSnoozed={String(columnKey).toLowerCase().includes('snooz')}
            />
          ))}
        </SortableContext>
        {cards.length === 0 && (
          <div className="mt-10 flex flex-col items-center justify-center">
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={id === 'snoozed' ? 'Drag cards here' : 'No items'}
              style={{ opacity: 0.5 }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default React.memo(KanbanColumn);
