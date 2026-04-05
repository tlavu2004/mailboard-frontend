import React, { useState, useEffect, useCallback, useRef } from 'react';
import { SearchOutlined, UserOutlined, TagOutlined } from '@ant-design/icons';
import { AutoComplete, Input } from 'antd';
import type { SelectProps } from 'antd';
import { searchService, Suggestion } from '@/services/searchService';

interface SearchInputProps {
  onSearch: (query: string) => void;
  defaultValue?: string;
}

// Debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

const SearchInput = React.forwardRef<any, SearchInputProps>(({ onSearch, defaultValue = '' }, ref) => {
  const [value, setValue] = useState(defaultValue);
  const [options, setOptions] = useState<SelectProps['options']>([]);
  const [loading, setLoading] = useState(false);
  const debouncedValue = useDebounce(value, 300);
  const isMounted = useRef(true);
  const inputRef = useRef<any>(null);

  // Expose focus method to parent via ref
  React.useImperativeHandle(ref, () => ({
    focus: () => {
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }
  }));

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  // Fetch suggestions when debounced value changes
  useEffect(() => {
    if (!debouncedValue || debouncedValue.trim().length < 2) {
      setOptions([]);
      return;
    }

    const fetchSuggestions = async () => {
      setLoading(true);
      try {
        const suggestions = await searchService.getSuggestions(debouncedValue);
        if (!isMounted.current) return;
        
        const mappedOptions = suggestions.map((s: Suggestion) => ({
          value: s.text,
          label: (
            <div className="flex items-center gap-2">
              {s.type === 'sender' ? (
                <UserOutlined className="text-blue-500" />
              ) : (
                <TagOutlined className="text-green-500" />
              )}
              <span>{s.text}</span>
              <span className="ml-auto text-xs text-gray-400">{s.type}</span>
            </div>
          ),
        }));
        setOptions(mappedOptions);
      } catch (error) {
        console.error('Failed to fetch suggestions:', error);
        setOptions([]);
      } finally {
        if (isMounted.current) setLoading(false);
      }
    };

    fetchSuggestions();
  }, [debouncedValue]);

  const handleSelect = useCallback((selectedValue: string) => {
    setValue(selectedValue);
    onSearch(selectedValue);
  }, [onSearch]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      onSearch(value);
    }
  }, [onSearch, value]);

  return (
    <div className="header-search" style={{ flex: 1, maxWidth: '600px', minWidth: '200px' }}>
      <AutoComplete
        value={value}
        options={options}
        onSelect={handleSelect}
        onChange={setValue}
        style={{ width: '100%' }}
        popupMatchSelectWidth={true}
      >
        <Input
          ref={inputRef}
          placeholder="Search emails..."
          prefix={<SearchOutlined style={{ color: loading ? '#1890ff' : '#999' }} />}
          onKeyDown={handleKeyDown}
          style={{
            height: '40px',
            borderRadius: '20px',
            paddingLeft: '12px',
          }}
          allowClear
        />
      </AutoComplete>
    </div>
  );
});

export default SearchInput;
