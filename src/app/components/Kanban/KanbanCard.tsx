import React, { useState, useEffect } from 'react';
import { RobotOutlined, ClockCircleOutlined, PaperClipOutlined, LoadingOutlined } from '@ant-design/icons';
import { Popover } from 'antd';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import dayjs from 'dayjs';
import { KanbanCardType, kanbanService } from '@/services/kanbanService';

interface KanbanCardProps {
  card: KanbanCardType;
  onRefresh: () => void;
  onClick: (card: KanbanCardType) => void;
}

import SnoozePopover from '../SnoozePopover';

// ... imports remain the same

// Export memoized component
export default React.memo(KanbanCard);

function KanbanCard({ card, onRefresh, onClick }: KanbanCardProps) {
  // ... implementation remains the same
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: card.id });

  const [loadingSummary, setLoadingSummary] = useState(false);
  const [summary, setSummary] = useState(card.summary);
  const [showSnooze, setShowSnooze] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const [isRead, setIsRead] = useState(card.isRead);

  // Sync with prop if it changes
  useEffect(() => {
    setIsRead(card.isRead);
  }, [card.isRead]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    cursor: 'move',
  };

  const handleCardClick = () => {
    setIsRead(true);
    onClick(card);
  };

  const handleSummarize = async (e: React.MouseEvent) => {
    e.stopPropagation();

    // If currently showing summary, switch to original view
    if (summary && !showOriginal) {
      setShowOriginal(true);
      return;
    }

    // Otherwise (No summary OR Showing Original), fetch summary (Refresh or Create)
    setLoadingSummary(true);
    try {
      const res = await kanbanService.summarizeEmail(card.id);
      if (res.ok) {
        setSummary(res.summary);
        setShowOriginal(false); // Show the new summary
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingSummary(false);
    }
  };

  const handleSnooze = async (until: string) => {
    try {
      await kanbanService.snoozeCard(card.id, until);
      setShowSnooze(false);
      onRefresh();
    } catch (err) {
      console.error(err);
    }
  };

  // Extract date formatted
  const senderName = card.sender || "Unknown";

  const dateObj = dayjs(card.receivedAt);
  const now = dayjs();
  let timeStr = dateObj.format('DD/MM/YYYY');

  // Custom date formatting logic to match "26/10/2023" style or similar short format
  if (dateObj.isSame(now, 'day')) {
    timeStr = dateObj.format('h:mm A');
  } else if (dateObj.isSame(now, 'year')) {
    timeStr = dateObj.format('DD/MM/YYYY');
  }

  const isShowingSummary = summary && !showOriginal;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      // Use local isRead for immediate feedback
      className={`group relative mb-3 w-full rounded-xl bg-white p-4 shadow-sm hover:shadow-md transition-all border border-gray-100 select-none cursor-grab active:cursor-grabbing border-l-[4px] ${isRead ? 'border-l-gray-300' : 'border-l-blue-500'}`}
    >
      {/* Header: Sender Name & Date */}
      <div className="mb-2 flex items-center justify-between">
        <h4 className={`text-sm font-bold text-black leading-tight truncate pr-2 ${!isRead ? 'text-black' : 'text-gray-800'}`}>
          {senderName}
        </h4>
        <span className="text-xs text-gray-400 whitespace-nowrap">{timeStr}</span>
      </div>

      {/* Subject */}
      <div className="mb-2">
        <h3 className={`text-base font-bold mb-1 leading-snug truncate ${!isRead ? 'text-black' : 'text-gray-800'}`}>
          {card.subject}
        </h3>
        <div className="text-xs text-gray-500 leading-relaxed line-clamp-3">
          {isShowingSummary ? (
            <>
              <span className="text-blue-600 font-semibold mr-1">✨ AI Summary:</span>
              {summary}
            </>
          ) : (
            card.preview || "No content"
          )}
        </div>
      </div>

      {/* Footer Actions */}
      <div className="flex items-center justify-between mt-3 pt-2">
        <div className="flex items-center gap-2">
          {/* Attachment Badge */}
          {card.hasAttachments && (
            <div className="flex items-center gap-1 bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs font-medium">
              <PaperClipOutlined /> File
            </div>
          )}

          {/* Functional Buttons - Minimalist */}
          <div className="flex items-center gap-1">
            <button
              onClick={handleSummarize}
              disabled={loadingSummary}
              className={`p-1.5 rounded transition-colors text-xs ${loadingSummary ? 'bg-blue-100 text-blue-600 cursor-wait' : isShowingSummary ? 'bg-green-100 text-green-700' : 'text-gray-400 hover:text-blue-600 hover:bg-blue-50'}`}
              title={loadingSummary ? 'Generating summary...' : 'Summarize'}
            >
              {loadingSummary ? <LoadingOutlined spin /> : <RobotOutlined />}
            </button>
            <div className="relative" onPointerDown={(e) => e.stopPropagation()}>
              <Popover
                content={<SnoozePopover onConfirm={handleSnooze} />}
                trigger="click"
                open={showSnooze}
                onOpenChange={setShowSnooze}
                placement="bottomRight"
                styles={{ body: { padding: 0 } }}
                destroyOnHidden
              >
                <button
                  className="p-1.5 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                  title="Snooze"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ClockCircleOutlined />
                </button>
              </Popover>
            </div>
          </div>
        </div>

        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleCardClick();
          }}
          className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline transition-colors"
        >
          View details
        </button>
      </div>
    </div>
  );
}
