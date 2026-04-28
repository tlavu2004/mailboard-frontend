'use client';

import React, { useState, useEffect } from 'react';
import { Modal, Input, Select, message, Spin, Tooltip, ColorPicker } from 'antd';
import { 
  Plus, 
  Trash2, 
  GripVertical, 
  Save, 
  Tag, 
  ChevronRight,
  Edit2,
  Palette,
  Settings
} from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { kanbanService, KanbanColumn, GmailLabel } from '@/services/kanbanService';

interface KanbanSettingsModalProps {
  open: boolean;
  onClose: () => void;
  onColumnsChanged: () => void;
  initialSelectedColumnId?: string;
  triggerAddOnOpen?: boolean;
  columnCounts?: Record<string, number>;
}

// Sortable item wrapper with new design
const SortableColumnItem: React.FC<{
  column: KanbanColumn;
  isSelected: boolean;
  onSelect: (col: KanbanColumn) => void;
}> = ({ column, isSelected, onSelect }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: column.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <button
      ref={setNodeRef}
      style={style}
      onClick={() => onSelect(column)}
      className={`w-full flex items-center gap-3 p-3 md:p-4 rounded-xl md:rounded-2xl transition-all border ${
        isSelected 
        ? 'bg-white border-blue-100 shadow-md ring-2 md:ring-4 ring-blue-500/10' 
        : 'border-transparent hover:bg-white hover:shadow-sm'
      }`}
    >
      <div {...attributes} {...listeners} className="cursor-grab text-gray-400 hover:text-gray-600">
        <GripVertical size={16} />
      </div>
      <div 
        className="w-3 h-3 rounded-full flex-shrink-0" 
        style={{ backgroundColor: column.color || '#64748b' }}
      />
      <div className="text-left flex-1 overflow-hidden min-w-0">
        <p className={`text-sm font-semibold truncate ${isSelected ? 'text-blue-600' : 'text-gray-700'}`}>
          {column.label}
        </p>
        <p className="text-xs text-gray-400 truncate">
          {column.gmailLabel || 'No Label'}
        </p>
      </div>
      <ChevronRight size={14} className={`flex-shrink-0 ${isSelected ? 'text-blue-500' : 'text-gray-300'}`} />
    </button>
  );
};

const KanbanSettingsModal: React.FC<KanbanSettingsModalProps> = ({ 
  open, 
  onClose, 
  onColumnsChanged, 
  initialSelectedColumnId,
  triggerAddOnOpen,
  columnCounts = {}
}) => {
  const [columns, setColumns] = useState<KanbanColumn[]>([]);
  const [gmailLabels, setGmailLabels] = useState<GmailLabel[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Edit state
  const [editingColumn, setEditingColumn] = useState<KanbanColumn | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [editForm, setEditForm] = useState({ label: '', gmailLabel: '', color: '#f1f5f9' });

  // Mobile view state
  const [showEditPanel, setShowEditPanel] = useState(false);

  // New Label Modal state
  const [newLabelModalOpen, setNewLabelModalOpen] = useState(false);
  const [newLabelName, setNewLabelName] = useState('');
  const [creatingLabel, setCreatingLabel] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Check for duplicate Gmail labels
  const getDuplicateLabelWarning = (gmailLabel: string, excludeColumnId?: string) => {
    if (!gmailLabel) return null;
    const duplicateColumns = columns.filter(col => 
      col.gmailLabel === gmailLabel && col.id !== excludeColumnId
    );
    if (duplicateColumns.length > 0) {
      return `Warning: Label "${gmailLabel}" is already used by column "${duplicateColumns[0].label}".`;
    }
    return null;
  };

  useEffect(() => {
    if (open) {
      fetchData();
      setShowEditPanel(false);
      setEditingColumn(null);
      
      // NEW: Auto-trigger add if prompted from board
      if (triggerAddOnOpen) {
        handleAddColumn();
      }
    }
  }, [open, triggerAddOnOpen]);

  // Handle initial column selection when columns are loaded
  useEffect(() => {
    if (open && initialSelectedColumnId && columns.length > 0) {
      const col = columns.find(c => c.id === initialSelectedColumnId);
      if (col) {
        startEdit(col);
      }
    }
  }, [open, initialSelectedColumnId, columns]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [cols, labels] = await Promise.all([
        kanbanService.getColumns(),
        kanbanService.getGmailLabels(),
      ]);
      setColumns(cols.sort((a, b) => a.order - b.order));
      setGmailLabels(labels);
    } catch (error) {
      console.error('Failed to load settings:', error);
      message.error('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = columns.findIndex(c => c.id === active.id);
    const newIndex = columns.findIndex(c => c.id === over.id);
    const newOrder = arrayMove(columns, oldIndex, newIndex);
    setColumns(newOrder);

    try {
      const updatedColumns = await kanbanService.reorderColumns(newOrder.map(c => c.id));
      setColumns(updatedColumns.sort((a, b) => a.order - b.order));
      onColumnsChanged();
    } catch (error) {
      console.error('Failed to reorder:', error);
      message.error('Failed to reorder');
      fetchData();
    }
  };

  const handleAddColumn = () => {
    // Stage 1: Just enter draft mode, do not sync with backend or modify list yet
    setIsCreating(true);
    setEditingColumn(null);
    setEditForm({ 
      label: 'New Column', 
      gmailLabel: '', 
      color: '#f1f5f9' 
    });
    setShowEditPanel(true);
  };

  const handleUpdateColumn = async () => {
    if (!editForm.label.trim()) {
      message.warning('Label is required');
      return;
    }
    setSaving(true);
    try {
      if (isCreating) {
        // Create new column
        const updatedColumns = await kanbanService.createColumn({
          label: editForm.label,
          gmailLabel: editForm.gmailLabel,
          color: editForm.color,
        });
        message.success('Column created');
        
        const sorted = updatedColumns.sort((a, b) => a.order - b.order);
        setColumns(sorted);
        
        // Find the newly created one to continue editing if desired
        const newCol = sorted.find(c => c.label === editForm.label) || sorted[sorted.length - 1];
        if (newCol) {
          setEditingColumn(newCol);
          setIsCreating(false);
        }
      } else if (editingColumn) {
        // Update existing column
        const updatedColumns = await kanbanService.updateColumn(editingColumn.id, {
          label: editForm.label,
          gmailLabel: editForm.gmailLabel,
          color: editForm.color,
        });
        message.success('Column updated');
        
        const sorted = updatedColumns.sort((a, b) => a.order - b.order);
        setColumns(sorted);
        
        const updatedCol = sorted.find(c => c.id === editingColumn.id);
        if (updatedCol) {
          setEditingColumn(updatedCol);
        }
      }
      onColumnsChanged();
    } catch (error) {
      console.error('Failed to save column:', error);
      message.error('Failed to save column');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteColumn = async () => {
    if (!editingColumn) return;
    if (editingColumn.isDefault) {
      message.warning('Cannot delete default columns');
      return;
    }
    
    // Check if column is empty
    const count = columnCounts[editingColumn.key] || 0;
    if (count > 0) {
      message.warning(`Cannot delete column "${editingColumn.label}" because it still contains ${count} emails. Please move or delete the emails first.`);
      return;
    }
    
    const backup = columns;
    setColumns(prev => prev.filter(col => col.id !== editingColumn.id));
    setEditingColumn(null);
    setShowEditPanel(false);

    try {
      const remainingColumns = await kanbanService.deleteColumn(editingColumn.id);
      message.success('Column deleted');
      setColumns(remainingColumns.sort((a, b) => a.order - b.order));
      onColumnsChanged();
    } catch (error) {
      console.error('Failed to delete column:', error);
      message.error('Failed to delete column');
      setColumns(backup);
    }
  };

  const startEdit = (col: KanbanColumn) => {
    setIsCreating(false);
    setEditingColumn(col);
    setEditForm({ label: col.label, gmailLabel: col.gmailLabel || '', color: col.color || '#64748b' });
    setShowEditPanel(true);
  };

  const handleBackToList = () => {
    setShowEditPanel(false);
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={900}
      centered
      closable={false}
      styles={{
        content: {
          padding: 0,
          borderRadius: '16px',
          overflow: 'hidden',
        },
        body: {
          padding: 0,
        }
      }}
      destroyOnHidden
    >
      {loading ? (
        <div className="flex justify-center items-center h-[400px] md:h-[500px]">
          <Spin size="large" />
        </div>
      ) : (
        <div className="flex flex-col md:flex-row h-[80vh] md:h-[70vh] max-h-[600px]">
          {/* Left side: List of Columns - Hidden on mobile when editing */}
          <div className={`${showEditPanel ? 'hidden md:flex' : 'flex'} w-full md:w-80 border-b md:border-b-0 md:border-r border-gray-100 flex-col bg-gray-50/50`}>
            <div className="p-6 md:p-8 pb-4">
              <div className="flex items-center gap-2 mb-1">
                <Settings size={18} className="text-blue-600" />
                <h2 className="text-lg md:text-xl font-bold text-gray-800">Column Settings</h2>
              </div>
              <p className="text-xs text-gray-400 font-medium mt-1">Manage workflow columns</p>
            </div>
            
            <div className="flex-1 overflow-y-auto p-3 md:p-4 space-y-1 md:space-y-2">
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={columns.map(c => c.id)} strategy={verticalListSortingStrategy}>
                  {columns.map((col) => (
                    <SortableColumnItem
                      key={col.id}
                      column={col}
                      isSelected={editingColumn?.id === col.id}
                      onSelect={startEdit}
                    />
                  ))}
                </SortableContext>
              </DndContext>
              
              <button 
                onClick={handleAddColumn}
                disabled={saving}
                className="w-full py-3 md:py-4 border-2 border-dashed border-gray-200 rounded-xl md:rounded-2xl text-gray-400 font-medium text-xs hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Plus size={16} /> Add New Column
              </button>
            </div>
            
            <div className="p-4 md:p-6 bg-white border-t border-gray-100 mt-auto">
              {(() => {
                const count = columnCounts[editingColumn?.key || ''] || 0;
                const isDeletable = editingColumn && !isCreating && !editingColumn.isDefault && count === 0;
                let tooltip = "Select a column to delete";
                if (isCreating) tooltip = "Save current column before deleting others";
                else if (editingColumn?.isDefault) tooltip = "Safety: Default columns cannot be deleted";
                else if (count > 0) tooltip = `Cannot delete: Column has ${count} emails. Empty it first.`;
                else if (editingColumn) tooltip = "Delete this column permanently";

                return (
                  <Tooltip title={tooltip}>
                    <button 
                      onClick={handleDeleteColumn}
                      disabled={!isDeletable}
                      className={`w-full py-3 md:py-3.5 text-sm font-bold rounded-xl shadow-sm flex items-center justify-center gap-2 transition-all border ${
                        !isDeletable
                          ? 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed'
                          : 'bg-red-50 text-red-600 border-red-100 hover:bg-red-600 hover:text-white hover:border-red-600'
                      }`}
                    >
                      <Trash2 size={16} /> Delete Column
                    </button>
                  </Tooltip>
                );
              })()}
            </div>
          </div>

          {/* Right side: Editing Panel - Full width on mobile when editing */}
          <div className={`${showEditPanel ? 'flex' : 'hidden md:flex'} flex-1 flex-col bg-white overflow-hidden relative`}>
            {/* Permanent Close Button (X) */}
            <button 
              onClick={onClose}
              className="absolute top-4 right-4 z-10 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-all"
              title="Close Settings"
            >
              <Plus size={24} className="rotate-45" />
            </button>

            {editingColumn || isCreating ? (
              <>
                <div className="flex-1 flex flex-col p-6 md:p-12 overflow-y-auto">
                {/* Mobile back button */}
                <button 
                  onClick={handleBackToList}
                  className="md:hidden flex items-center gap-2 text-gray-500 text-sm mb-4 hover:text-gray-700"
                >
                  <ChevronRight size={16} className="rotate-180" /> Back to list
                </button>
 
                <div className="flex flex-col md:flex-row justify-between items-start gap-4 mb-8 md:mb-10 pr-8">
                  <div>
                    <span className="text-xs font-semibold text-blue-500 uppercase tracking-wide mb-1 block">
                      {isCreating ? 'New Column' : 'Editing'}
                    </span>
                    <h3 className="text-2xl md:text-3xl font-bold text-gray-800">
                      {isCreating ? 'New Column' : editingColumn?.label}
                    </h3>
                  </div>
                </div>

                <div className="space-y-6 md:space-y-8">
                  {/* Title Input */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-2">
                      <Edit2 size={12} /> Display Label
                    </label>
                    <Input 
                      size="large"
                      value={editForm.label}
                      onChange={(e) => setEditForm(prev => ({ ...prev, label: e.target.value }))}
                      disabled={editingColumn?.isDefault}
                      className="!rounded-lg !border-gray-200"
                    />
                  </div>

                  {/* Gmail Label Mapping */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-2">
                      <Tag size={12} /> Gmail Label Mapping
                    </label>
                    <Select
                      size="large"
                      placeholder="Select Gmail Label (optional)"
                      value={editForm.gmailLabel || undefined}
                      onChange={(val) => {
                        setEditForm(prev => ({ ...prev, gmailLabel: val || '' }));
                        if (val === '__CREATE_NEW__') {
                          setNewLabelName('');
                          setNewLabelModalOpen(true);
                        }
                      }}
                      allowClear
                      className="w-full"
                      disabled={editingColumn?.isDefault}
                      status={getDuplicateLabelWarning(editForm.gmailLabel, editingColumn?.id) ? 'warning' : undefined}
                      options={[
                        { value: '', label: '🚫 No Label Mapping' },
                        ...gmailLabels.map(l => ({ value: l.id, label: `${l.name} (${l.type})` })),
                        { value: '__CREATE_NEW__', label: '➕ Create new Gmail label...' },
                      ]}
                    />
                    {getDuplicateLabelWarning(editForm.gmailLabel, editingColumn?.id) && (
                      <div className="text-amber-600 text-xs mt-1 bg-amber-50 p-2 rounded-lg">
                        ⚠️ {getDuplicateLabelWarning(editForm.gmailLabel, editingColumn?.id)}
                      </div>
                    )}
                    <p className="text-xs text-gray-400">This maps the column to a Gmail label for synchronization.</p>
                  </div>

                  {/* Color Picker */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-2">
                      <Palette size={12} /> Column Color
                    </label>
                    <div className="flex items-center gap-3">
                      <ColorPicker
                        value={editForm.color || '#64748b'}
                        onChange={(_, hex) => setEditForm(prev => ({ ...prev, color: hex }))}
                        showText
                        disabled={editingColumn?.isDefault}
                      />
                      <span className="text-sm text-gray-500">Choose any color</span>
                    </div>
                  </div>
                  </div>
                </div>

                {/* Footer Save Button (Fixed) */}
                <div className="p-6 md:px-12 md:py-8 bg-gray-50/50 border-t border-gray-100 flex justify-end">
                  <button
                    onClick={handleUpdateColumn}
                    disabled={saving || (editingColumn?.isDefault && !isCreating)}
                    className="flex items-center gap-2 px-8 py-3 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-all shadow-md shadow-blue-500/20 disabled:opacity-50"
                  >
                    {saving ? <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" /> : <Save size={16} />} 
                    {saving ? 'Creating...' : (isCreating ? 'Create Column' : 'Save Changes')}
                  </button>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8 md:p-12">
                <div className="w-16 h-16 md:w-24 md:h-24 bg-gray-50 rounded-2xl md:rounded-3xl flex items-center justify-center text-gray-200 mb-4 md:mb-6">
                  <Edit2 size={32} className="md:hidden" />
                  <Edit2 size={40} className="hidden md:block" />
                </div>
                <h3 className="text-lg md:text-xl font-bold text-gray-800">Select a Column to Edit</h3>
                <p className="text-sm text-gray-400 mt-2 max-w-xs">Change the name, color, and Gmail sync rules for your workflow columns.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sub-modal for creating a new Gmail label */}
      <Modal
        title={
          <div className="flex items-center gap-2">
            <Tag size={18} className="text-blue-500" />
            <span>Create New Gmail Label</span>
          </div>
        }
        open={newLabelModalOpen}
        onCancel={() => {
          if (!creatingLabel) {
            setNewLabelModalOpen(false);
            // Revert the selection in the main dropdown if they cancelled
            setEditForm(prev => ({ 
              ...prev, 
              gmailLabel: editingColumn?.gmailLabel || '' 
            }));
          }
        }}
        onOk={async () => {
          if (!newLabelName.trim()) {
            message.warning('Please enter a label name');
            return;
          }
          setCreatingLabel(true);
          try {
            const newLabel = await kanbanService.createGmailLabel(newLabelName.trim());
            setGmailLabels(prev => [...prev, newLabel]);
            setEditForm(prev => ({ ...prev, gmailLabel: newLabel.id }));
            message.success(`Gmail label "${newLabelName}" created!`);
            setNewLabelModalOpen(false);
          } catch (err) {
            message.error('Failed to create Gmail label');
            console.error(err);
          } finally {
            setCreatingLabel(false);
          }
        }}
        okText={creatingLabel ? 'Creating...' : 'Create Label'}
        confirmLoading={creatingLabel}
        destroyOnClose
        centered
        width={400}
        styles={{
          content: { borderRadius: '12px' }
        }}
      >
        <div className="py-4">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">
            Label Name
          </label>
          <Input 
            autoFocus
            placeholder="e.g. Finance, Projects" 
            value={newLabelName}
            onChange={e => setNewLabelName(e.target.value)}
            onPressEnter={async () => {
              // Trigger OK logic manually for convenience
              if (newLabelName.trim()) {
                setCreatingLabel(true);
                try {
                  const newLabel = await kanbanService.createGmailLabel(newLabelName.trim());
                  setGmailLabels(prev => [...prev, newLabel]);
                  setEditForm(prev => ({ ...prev, gmailLabel: newLabel.id }));
                  message.success(`Gmail label "${newLabelName}" created!`);
                  setNewLabelModalOpen(false);
                } catch (err) {
                  message.error('Failed to create Gmail label');
                  console.error(err);
                } finally {
                  setCreatingLabel(false);
                }
              }
            }}
          />
          <p className="text-[11px] text-gray-400 mt-2">
            This label will be created in your actual Gmail account and can be used to synchronize emails.
          </p>
        </div>
      </Modal>
    </Modal>
  );
};

export default KanbanSettingsModal;
