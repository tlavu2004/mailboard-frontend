import React, { useState, useEffect, useMemo } from 'react';
import { Typography, Select, DatePicker, TimePicker, Button, Space, Alert } from 'antd';
import dayjs, { Dayjs } from 'dayjs';

const { Text } = Typography;

interface SnoozePopoverProps {
  onConfirm: (date: string) => void;
}

const SnoozePopover: React.FC<SnoozePopoverProps> = ({ onConfirm }) => {
  const [mode, setMode] = useState<string>('later_today');
  const [customDate, setCustomDate] = useState<Dayjs | null>(dayjs());
  const [customTime, setCustomTime] = useState<Dayjs | null>(dayjs().add(1, 'hour').startOf('hour'));
  const [loading, setLoading] = useState(false);
  
  const calculatedDate = useMemo(() => {
    let date = dayjs();
    if (mode === 'later_today') date = date.add(4, 'hour');
    else if (mode === 'tomorrow') date = date.add(1, 'day').startOf('day').add(9, 'hour');
    else if (mode === 'next_week') date = date.add(1, 'week').startOf('week').add(9, 'hour');
    else if (mode === 'custom' && customDate && customTime) {
      date = customDate.hour(customTime.hour()).minute(customTime.minute()).second(0);
    }
    return date;
  }, [mode, customDate, customTime]);

  const isInvalid = calculatedDate.isBefore(dayjs().subtract(1, 'minute'));

  const handleConfirm = async () => {
    console.log('[Snooze] Confirm clicked');
    console.log('[Snooze] Mode:', mode);
    console.log('[Snooze] Now:', dayjs().format('HH:mm:ss'));
    console.log('[Snooze] Selected Date (Local):', calculatedDate.format('YYYY-MM-DD HH:mm:ss'));
    console.log('[Snooze] isInvalid:', isInvalid);

    if (isInvalid) {
      console.warn('[Snooze] Confirmation blocked: Selected time is in the past.');
      return;
    }

    try {
      setLoading(true);
      await onConfirm(calculatedDate.toISOString());
      console.log('[Snooze] Confirmation success');
    } catch (err) {
      console.error('[Snooze] Confirmation error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ width: 260, padding: '16px' }}>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Text strong>Snooze Until</Text>
        
        <Select
          style={{ width: '100%' }}
          value={mode}
          onChange={setMode}
          options={[
            { value: 'later_today', label: 'Later Today (+4h)' },
            { value: 'tomorrow', label: 'Tomorrow morning' },
            { value: 'next_week', label: 'Next Week' },
            { value: 'custom', label: 'Custom...' },
          ]}
        />

        {mode === 'custom' && (
          <Space direction="vertical" style={{ width: '100%' }}>
            <DatePicker 
              style={{ width: '100%' }} 
              value={customDate} 
              onChange={setCustomDate}
              disabledDate={(current) => current && current < dayjs().startOf('day')}
            />
            <TimePicker 
              style={{ width: '100%' }} 
              value={customTime} 
              onChange={setCustomTime}
              format="HH:mm"
              hideDisabledOptions
            />
          </Space>
        )}

        {isInvalid && (
          <Alert
            message="Time must be in the future"
            type="error"
            showIcon
            style={{ fontSize: '12px', padding: '4px 8px' }}
          />
        )}

        <Button
          type="primary"
          block
          onClick={handleConfirm}
          loading={loading}
          disabled={isInvalid || (mode === 'custom' && (!customDate || !customTime))}
        >
          Confirm
        </Button>
      </Space>
    </div>
  );
};

export default SnoozePopover;
