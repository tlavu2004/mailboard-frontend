import { Button, Divider, Select, Tag, Dropdown, Menu, Space, Tooltip, Popconfirm } from 'antd';
import {
  ReloadOutlined,
  SettingOutlined,
  CloudSyncOutlined,
  FilterOutlined,
  SortAscendingOutlined,
  ClearOutlined,
  PlusOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  CloseOutlined,
  HolderOutlined,
  DeleteOutlined
} from '@ant-design/icons';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

export interface FilterState {
  unread: boolean;
  hasAttachment: boolean;
}

interface SortLayer {
  field: string;
  order: 'asc' | 'desc';
}

interface FilterBarProps {
  filters: FilterState;
  sortLayers: SortLayer[];
  onFilterChange: (filters: FilterState) => void;
  onSortLayersChange: (layers: SortLayer[]) => void;
  onSync?: () => void;
  onRefresh?: () => void;
  onSettings?: () => void;
  onReset?: () => void;
  onEmptyTrash?: () => void;
  syncLoading?: boolean;
  refreshLoading?: boolean;
}

const FIELD_LABELS: Record<string, string> = {
  receivedDate: 'Date',
  fromName: 'Sender',
  subject: 'Subject'
};

function SortableTag({ 
  layer, 
  index, 
  onToggleOrder, 
  onRemove, 
  canRemove 
}: { 
  layer: SortLayer, 
  index: number, 
  onToggleOrder: (field: string) => void, 
  onRemove: (field: string) => void,
  canRemove: boolean
}) {
  const isPrimary = index === 0;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: layer.field });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 100 : 'auto',
    opacity: isDragging ? 0.5 : 1,
  };

  const getPriorityLabel = (idx: number) => {
    if (idx === 0) return "Primary Priority";
    if (idx === 1) return "Secondary Priority";
    if (idx === 2) return "Tertiary Priority";
    return `Priority ${idx + 1}`;
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center">
      <Tag
        className={`m-0 flex items-center gap-1 px-2 py-1 rounded-lg transition-colors ${
          isPrimary ? 'border-blue-200 bg-blue-50 text-blue-700 shadow-sm' : 'border-gray-200 bg-gray-50 text-gray-600'
        }`}
        style={{ borderStyle: isPrimary ? 'solid' : 'dashed' }}
      >
        <span 
          {...attributes} 
          {...listeners} 
          className="cursor-grab active:cursor-grabbing mr-1 text-gray-400 hover:text-blue-500"
        >
          <HolderOutlined />
        </span>
        
        <Tooltip title={getPriorityLabel(index)}>
          <span 
            className="cursor-pointer hover:underline font-medium select-none"
            onClick={() => onToggleOrder(layer.field)}
          >
            {FIELD_LABELS[layer.field]} 
            {layer.order === 'asc' ? <ArrowUpOutlined className="ml-1 text-[10px]" /> : <ArrowDownOutlined className="ml-1 text-[10px]" />}
          </span>
        </Tooltip>

        {canRemove && (
          <CloseOutlined 
            className="ml-1 text-[10px] cursor-pointer hover:text-red-500 opacity-60 hover:opacity-100" 
            onClick={() => onRemove(layer.field)}
          />
        )}
      </Tag>
    </div>
  );
}

export default function FilterBar({
  filters,
  sortLayers,
  onFilterChange,
  onSortLayersChange,
  onSync,
  onRefresh,
  onSettings,
  onReset,
  onEmptyTrash,
  syncLoading = false,
  refreshLoading = false,
}: FilterBarProps) {

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const toggleUnread = () => onFilterChange({ ...filters, unread: !filters.unread });
  const toggleHasAttachment = () => onFilterChange({ ...filters, hasAttachment: !filters.hasAttachment });

  const addLayer = (field: string) => {
    if (sortLayers.find(l => l.field === field)) return;
    onSortLayersChange([...sortLayers, { field, order: 'desc' }]);
  };

  const removeLayer = (field: string) => {
    if (sortLayers.length <= 1) return;
    onSortLayersChange(sortLayers.filter(l => l.field !== field));
  };

  const toggleOrder = (field: string) => {
    onSortLayersChange(sortLayers.map(l => 
      l.field === field ? { ...l, order: l.order === 'asc' ? 'desc' : 'asc' } : l
    ));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = sortLayers.findIndex(l => l.field === active.id);
      const newIndex = sortLayers.findIndex(l => l.field === over.id);
      onSortLayersChange(arrayMove(sortLayers, oldIndex, newIndex));
    }
  };

  const availableFields = Object.keys(FIELD_LABELS).filter(
    f => !sortLayers.find(l => l.field === f)
  );

  const addMenu = (
    <Menu onClick={({ key }) => addLayer(key)}>
      {availableFields.map(f => (
        <Menu.Item key={f} icon={<PlusOutlined />}>{FIELD_LABELS[f]}</Menu.Item>
      ))}
    </Menu>
  );

  return (
    <div className="mb-2 flex flex-wrap items-center gap-4 bg-white p-2 px-4 rounded-xl border border-gray-100 shadow-sm w-full select-none">
      {/* Filter Section */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-gray-400 text-xs font-bold uppercase tracking-wider">
          <FilterOutlined />
          <span>Filter</span>
        </div>

        <button
          onClick={toggleUnread}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition-all cursor-pointer ${filters.unread
              ? 'border-blue-200 bg-blue-50 text-blue-700 font-medium shadow-sm'
              : 'border-gray-100 text-gray-500 hover:border-gray-300 bg-white'
            }`}
        >
          <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${filters.unread ? 'bg-blue-600 border-blue-600' : 'border-gray-200 bg-white'}`}>
            {filters.unread && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
          </div>
          Unread
        </button>

        <button
          onClick={toggleHasAttachment}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition-all cursor-pointer ${filters.hasAttachment
              ? 'border-blue-200 bg-blue-50 text-blue-700 font-medium shadow-sm'
              : 'border-gray-100 text-gray-500 hover:border-gray-300 bg-white'
            }`}
        >
          <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${filters.hasAttachment ? 'bg-blue-600 border-blue-600' : 'border-gray-200 bg-white'}`}>
            {filters.hasAttachment && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
          </div>
          Has attachment
        </button>
      </div>

      <Divider type="vertical" style={{ height: '24px', backgroundColor: '#f1f5f9' }} className="mx-1" />

      {/* Sort Section */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 text-gray-400 text-xs font-bold uppercase tracking-wider mr-1">
          <SortAscendingOutlined />
          <span>Sort</span>
        </div>

        <DndContext 
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext 
            items={sortLayers.map(l => l.field)}
            strategy={horizontalListSortingStrategy}
          >
            <div className="flex items-center gap-2">
              {sortLayers.map((layer, idx) => (
                <SortableTag
                  key={layer.field}
                  layer={layer}
                  index={idx}
                  onToggleOrder={toggleOrder}
                  onRemove={removeLayer}
                  canRemove={sortLayers.length > 1}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
        
        {availableFields.length > 0 && (
          <Dropdown overlay={addMenu} trigger={['click']}>
            <Button 
              type="dashed" 
              size="small" 
              shape="circle" 
              icon={<PlusOutlined />} 
              className="ml-1 text-gray-400 border-gray-200 hover:text-blue-500 hover:border-blue-500 transition-all"
            />
          </Dropdown>
        )}
      </div>

      <div className="ml-auto flex items-center gap-2">
        {onReset && (
          <Tooltip title="Reset filters & sorting">
            <Button
              type="text"
              icon={<ClearOutlined />}
              onClick={onReset}
              className="text-gray-400 hover:text-red-500 text-xs"
            >
              Reset
            </Button>
          </Tooltip>
        )}
        
        <Divider type="vertical" style={{ height: '20px' }} />
        
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

        {onRefresh && (
          <Tooltip title="Refresh">
            <Button
              type="text"
              icon={<ReloadOutlined spin={refreshLoading} />}
              onClick={onRefresh}
              className="text-gray-400 hover:text-blue-600"
            />
          </Tooltip>
        )}
        
        {onEmptyTrash && (
          <Button
            type="primary"
            danger
            size="small"
            icon={<DeleteOutlined />}
            onClick={onEmptyTrash}
            className="ml-2 shadow-sm rounded-lg"
          >
            Empty
          </Button>
        )}
      </div>
    </div>
  );
}
