import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import KanbanCard from './KanbanCard';
import { KanbanCardType } from '@/services/kanbanService';
import { 
  InboxOutlined, 
  ThunderboltFilled, 
  CheckSquareFilled,
  ClockCircleOutlined,
  ProjectOutlined,
  TagOutlined
} from '@ant-design/icons';
import { Empty } from 'antd';

interface KanbanColumnProps {
  id: string;
  label: string;
  color?: string;
  cards: KanbanCardType[];
  onRefresh: () => void;
  onCardClick: (card: KanbanCardType) => void;
}

const getColumnConfig = (id: string, label: string) => {
  const lowerId = id.toLowerCase();
  
  if (lowerId.includes('inbox') || label.toLowerCase().includes('inbox')) {
     return { bg: 'bg-white', icon: <InboxOutlined />, iconColor: 'text-blue-500', badgeColor: 'bg-blue-50 text-blue-600' };
  }
  if (lowerId.includes('todo') || lowerId.includes('to do')) {
     return { bg: 'bg-white', icon: <ThunderboltFilled />, iconColor: 'text-orange-500', badgeColor: 'bg-orange-50 text-orange-600' };
  }
  if (lowerId.includes('process')) {
     return { bg: 'bg-white', icon: <ProjectOutlined />, iconColor: 'text-purple-500', badgeColor: 'bg-purple-50 text-purple-600' };
  }
  if (lowerId.includes('snoozed')) {
     return { bg: 'bg-white', icon: <ClockCircleOutlined />, iconColor: 'text-indigo-400', badgeColor: 'bg-indigo-50 text-indigo-600' };
  }
  if (lowerId.includes('done')) {
     return { bg: 'bg-white', icon: <CheckSquareFilled />, iconColor: 'text-green-500', badgeColor: 'bg-green-50 text-green-600' };
  }

  // Default for custom columns
  return { bg: 'bg-white', icon: <TagOutlined />, iconColor: 'text-gray-500', badgeColor: 'bg-gray-100 text-gray-600' };
}

// ... imports remain the same

export default React.memo(KanbanColumn);

function KanbanColumn({ id, label, color, cards, onRefresh, onCardClick }: KanbanColumnProps) {
  const { setNodeRef } = useDroppable({ id });
  const config = getColumnConfig(id, label);
  
  // Use custom color if provided, otherwise use default
  const bgStyle = color ? { backgroundColor: color } : undefined;
  const bgClass = color ? '' : config.bg;

  return (
    <div 
      className={`relative flex h-full w-[380px] shrink-0 flex-col rounded-2xl px-4 py-5 border border-gray-100 shadow-[0_4px_20px_-10px_rgba(0,0,0,0.08)] transition-all ${bgClass}`} 
      style={bgStyle}
    >
      {/* Top Accent Border */}
      <div className={`absolute top-0 left-0 right-0 h-1 rounded-t-2xl ${config.iconColor.replace('text', 'bg')}`} />
      
      {/* Header */}
      <div className="mb-4 flex items-center justify-between px-2">
        <div className="flex items-center gap-2">
            <span className={`text-xl ${config.iconColor}`}>
               {config.icon}
            </span>
            <h3 className="text-lg font-bold text-gray-700 m-0">{label}</h3>
        </div>
        <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${config.badgeColor}`}>
            {cards.length}
        </span>
      </div>
      
      {/* Droppable Area */}
      <div
        ref={setNodeRef}
        className="flex-1 overflow-y-auto"
      >
        <SortableContext items={cards.map(c => c.id)} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <KanbanCard key={card.id} card={card} onRefresh={onRefresh} onClick={onCardClick} />
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
