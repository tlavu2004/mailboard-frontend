import React from 'react';
import { Modal, Typography, Space, Divider, Row, Col, Tag } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

interface ShortcutProps {
  keys: string[];
  description: string;
}

const ShortcutEntry: React.FC<ShortcutProps> = ({ keys, description }) => (
  <Row align="middle" style={{ marginBottom: '12px' }}>
    <Col span={10}>
      <Space size={4}>
        {keys.map((key, i) => (
          <React.Fragment key={key}>
            <Tag color="default" style={{ 
              backgroundColor: '#f5f5f5', 
              border: '1px solid #d9d9d9',
              borderRadius: '4px',
              padding: '0 8px',
              fontSize: '13px',
              fontWeight: 'bold',
              minWidth: '24px',
              textAlign: 'center',
              boxShadow: '0 2px 0 rgba(0,0,0,0.045)'
            }}>
              {key}
            </Tag>
            {i < keys.length - 1 && <Text type="secondary">+</Text>}
          </React.Fragment>
        ))}
      </Space>
    </Col>
    <Col span={14}>
      <Text style={{ fontSize: '14px' }}>{description}</Text>
    </Col>
  </Row>
);

interface KeyboardHelpModalProps {
  visible: boolean;
  onClose: () => void;
}

const KeyboardHelpModal: React.FC<KeyboardHelpModalProps> = ({ visible, onClose }) => {
  return (
    <Modal
      title={
        <Space>
          <QuestionCircleOutlined />
          <span>Keyboard Shortcuts</span>
        </Space>
      }
      open={visible}
      onCancel={onClose}
      footer={null}
      width={500}
      centered
      styles={{ body: { padding: '24px' } }}
    >
      <Title level={5} type="secondary" style={{ marginBottom: '16px' }}>Navigation</Title>
      <ShortcutEntry keys={['j']} description="Next email (down)" />
      <ShortcutEntry keys={['k']} description="Previous email (up)" />
      <ShortcutEntry keys={['Enter']} description="Open selected email" />
      <ShortcutEntry keys={['/']} description="Focus search box" />
      <ShortcutEntry keys={['Esc']} description="Cancel / Close current view" />

      <Divider style={{ margin: '16px 0' }} />

      <Title level={5} type="secondary" style={{ marginBottom: '16px' }}>Actions</Title>
      <ShortcutEntry keys={['c']} description="Compose new email" />
      <ShortcutEntry keys={['r']} description="Reply to email" />
      <ShortcutEntry keys={['f']} description="Forward email" />
      <ShortcutEntry keys={['#', 'Delete']} description="Delete email" />
      <ShortcutEntry keys={['?']} description="Show this help manual" />

      <div style={{ marginTop: '24px', textAlign: 'center' }}>
        <Text type="secondary" italic style={{ fontSize: '12px' }}>
          Tip: Shortcuts are disabled while you are typing in an input field.
        </Text>
      </div>
    </Modal>
  );
};

export default KeyboardHelpModal;
