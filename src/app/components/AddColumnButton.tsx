'use client';

import React from 'react';
import { Plus } from 'lucide-react';

interface AddColumnButtonProps {
  onClick: () => void;
}

const AddColumnButton: React.FC<AddColumnButtonProps> = ({ onClick }) => {
  return (
    <div className="flex-shrink-0 w-80 h-full flex items-start pt-4 px-2">
      <button
        onClick={onClick}
        className="w-full flex items-center justify-center gap-2 py-3 bg-white/50 border-2 border-dashed border-gray-200 rounded-xl text-gray-400 hover:text-blue-500 hover:border-blue-300 hover:bg-white transition-all group"
      >
        <Plus size={18} className="group-hover:scale-110 transition-transform" />
        <span className="font-semibold text-sm">Add New Column</span>
      </button>
    </div>
  );
};

export default AddColumnButton;
