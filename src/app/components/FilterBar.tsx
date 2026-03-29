'use client';

import React from 'react';
import { Button, Space, Select, Divider, Tooltip } from 'antd';
import { 
  ReloadOutlined, 
  SettingOutlined, 
  CloudSyncOutlined,
  FilterOutlined,
  SortAscendingOutlined,
  ToolOutlined
} from '@ant-design/icons';

export interface FilterState {
  unread: boolean;
  hasAttachment: boolean;
}

export type SortMode = 'date-desc' | 'date-asc' | 'sender';

interface FilterBarProps {
  filters: FilterState;
  sortMode: SortMode;
  onFilterChange: (filters: FilterState) => void;
  onSortChange: (sortMode: SortMode) => void;
  onSync?: () => void;
  onRepair?: () => void;
  onRefresh?: () => void;
  onSettings?: () => void;
  syncLoading?: boolean;
  refreshLoading?: boolean;
}

export default function FilterBar({
  filters,
  sortMode,
  onFilterChange,
  onSortChange,
  onSync,
  onRepair,
  onRefresh,
  onSettings,
  syncLoading = false,
  refreshLoading = false,
}: FilterBarProps) {
  
  const toggleUnread = () => {
    onFilterChange({ ...filters, unread: !filters.unread });
  };

  const toggleHasAttachment = () => {
    onFilterChange({ ...filters, hasAttachment: !filters.hasAttachment });
  };

  return (
    <div className="mb-4 flex flex-wrap items-center gap-4 bg-white p-2 px-4 rounded-xl border border-gray-100 shadow-sm w-full">
      {/* Filter Section */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-gray-500 font-medium">
          <FilterOutlined />
          <span>Filter:</span>
        </div>

        <button
          onClick={toggleUnread}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition-all cursor-pointer ${
            filters.unread 
              ? 'border-blue-200 bg-blue-50 text-blue-700 font-medium' 
              : 'border-gray-200 text-gray-600 hover:border-gray-300 bg-white'
          }`}
        >
          <div className={`w-4 h-4 rounded border flex items-center justify-center ${
            filters.unread ? 'bg-blue-600 border-blue-600' : 'border-gray-300 bg-white'
          }`}>
            {filters.unread && (
              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>
          Unread
        </button>

        <button
          onClick={toggleHasAttachment}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition-all cursor-pointer ${
            filters.hasAttachment 
              ? 'border-blue-200 bg-blue-50 text-blue-700 font-medium' 
              : 'border-gray-200 text-gray-600 hover:border-gray-300 bg-white'
          }`}
        >
          <div className={`w-4 h-4 rounded border flex items-center justify-center ${
            filters.hasAttachment ? 'bg-blue-600 border-blue-600' : 'border-gray-300 bg-white'
          }`}>
            {filters.hasAttachment && (
              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>
          Has attachment
        </button>
      </div>

      <Divider type="vertical" style={{ height: '24px' }} className="mx-0 hidden sm:block" />

      {/* Sort Section */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-gray-500 font-medium">
          <SortAscendingOutlined />
          <span>Sort:</span>
        </div>

        <Select
          value={sortMode}
          onChange={onSortChange}
          style={{ width: 140 }}
          variant="outlined"
          className="hover:border-gray-300"
          options={[
            { value: 'date-desc', label: 'Newest First' },
            { value: 'date-asc', label: 'Oldest First' },
            { value: 'sender', label: 'By Sender' },
          ]}
        />
      </div>

      {/* Actions Section */}
      <div className="ml-auto flex items-center gap-1 sm:gap-2">
        {onSettings && (
          <Tooltip title="Settings">
            <Button 
              type="text" 
              icon={<SettingOutlined />} 
              onClick={onSettings}
              className="text-gray-400 hover:text-blue-600"
            />
          </Tooltip>
        )}
        
        {onSync && (
          <Tooltip title="Sync with Gmail">
            <Button 
              type="text" 
              icon={<CloudSyncOutlined spin={syncLoading} />} 
              onClick={onSync}
              loading={syncLoading}
              className="text-gray-400 hover:text-blue-600"
            />
          </Tooltip>
        )}

        {onRepair && (
          <Tooltip title="Repair email content">
            <Button 
              type="text" 
              icon={<ToolOutlined />} 
              onClick={onRepair}
              className="text-gray-400 hover:text-orange-600"
            />
          </Tooltip>
        )}

        {onRefresh && (
          <Tooltip title="Refresh view">
            <Button 
              type="text" 
              icon={<ReloadOutlined spin={refreshLoading} />} 
              onClick={onRefresh}
              className="text-gray-400 hover:text-blue-600"
            />
          </Tooltip>
        )}
      </div>
    </div>
  );
}
