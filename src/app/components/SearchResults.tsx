import React from 'react';
import { List, Card, Typography, Space, Button, Empty, Tag } from 'antd';
import { StarOutlined, PaperClipOutlined, ArrowLeftOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { Email } from '@/types/email';

const { Text, Title } = Typography;

interface SearchResultsProps {
  results: Email[];
  loading: boolean;
  onSelect: (email: Email) => void;
  onClose: () => void;
  searchQuery: string;
  onLoadMore: () => void;
  loadingMore: boolean;
  hasMore: boolean;
  totalEstimate?: number;
  /** Map of email.id -> semantic similarity score (0-1) */
  scores?: Record<string, number>;
  /** Label to show search mode */
  searchMode?: 'semantic' | 'text';
}

const HighlightText = React.memo(({ text, highlight }: { text: string, highlight: string }) => {
  const regex = React.useMemo(() => {
    if (!highlight.trim()) return null;
    const createFuzzyRegex = (query: string) => {
      const charMap: Record<string, string> = {
        'a': '[aàáạảãâầấậẩẫăằắặẳẵ]',
        'e': '[eèéẹẻẽêềếệểễ]',
        'i': '[iìíịỉĩ]',
        'o': '[oòóọỏõôồốộổỗơờớợởỡ]',
        'u': '[uùúụủũưừứựửữ]',
        'y': '[yỳýỵỷỹ]',
        'd': '[dđ]',
      };
      // Escape special regex chars in query to avoid crash
      // But we are mapping each char... so special chars like '.' need to be escaped IF they are not in charMap.
      // Actually split('') splits '.' separately.
      // If char is '.', map returns '.'. regex sees '.'. Matches any char.
      // We probably want to escape special chars that are NOT expanded.
      // Simple escape: 
      const escapeRegExp = (string: string) => {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      }

      return query.toLowerCase().split('').map(char => {
        // If char is in map, use map. Else escape it.
        return charMap[char] || escapeRegExp(char);
      }).join('');
    };
    const fuzzyPattern = createFuzzyRegex(highlight);
    try {
      return new RegExp(`(${fuzzyPattern})`, 'gi');
    } catch {
      return null;
    }
  }, [highlight]);

  if (!regex) return <span>{text}</span>;

  // split limit? No.
  const parts = text.split(regex);
  return (
    <span>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <span key={i} style={{ backgroundColor: '#ffbf00', fontWeight: 'bold' }}>{part}</span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </span>
  );
});
HighlightText.displayName = 'HighlightText';

const SearchResults: React.FC<SearchResultsProps> = ({
  results,
  loading,
  onSelect,
  onClose,
  searchQuery,
  onLoadMore,
  loadingMore,
  hasMore,
  totalEstimate,
  scores,
  searchMode = 'text'
}) => {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const safeResults = results || [];

  // Helper to render relevance badge
  const renderRelevance = (emailId: string) => {
    if (searchMode !== 'semantic' || !scores || scores[emailId] === undefined) return null;
    const score = scores[emailId];
    const percent = Math.round(score * 100);
    let color = 'default';
    if (percent >= 80) color = 'green';
    else if (percent >= 60) color = 'blue';
    else if (percent >= 40) color = 'orange';
    return (
      <Tag icon={<ThunderboltOutlined />} color={color}>
        {percent}% match
      </Tag>
    );
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#fff' }}>
      <div style={{ padding: '16px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={onClose}>Back</Button>
          <Title level={5} style={{ margin: 0 }}>
            Search results for &quot;{searchQuery}&quot;
          </Title>
          {searchMode === 'semantic' && (
            <Tag color="purple">AI Semantic</Tag>
          )}
        </Space>
        {totalEstimate !== undefined ? (
          <Text type="secondary">Showing {safeResults.length}/{totalEstimate}</Text>
        ) : (
          <Text type="secondary">{safeResults.length} found</Text>
        )}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
        {loading && safeResults.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px' }}>Loading...</div>
        ) : safeResults.length === 0 ? (
          <Empty 
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <div style={{ color: '#64748b' }}>
                <p style={{ fontSize: '16px', fontWeight: 500, marginBottom: '4px' }}>No matches found</p>
                <p style={{ fontSize: '14px' }}>We couldn&apos;t find any emails for &quot;{searchQuery}&quot;</p>
                <Button 
                  onClick={onClose} 
                  style={{ marginTop: '16px', borderRadius: '8px' }}
                >
                  Clear Search
                </Button>
              </div>
            }
          />
        ) : (
          <>
            <List
              dataSource={safeResults}
              renderItem={(email) => (
                <Card
                  hoverable
                  style={{ marginBottom: '8px', cursor: 'pointer' }}
                  onClick={() => onSelect(email)}
                  size="small"
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <Space>
                      <Text strong>
                        <HighlightText text={email.from.name || email.from.email} highlight={searchQuery} />
                      </Text>
                      {email.isStarred && <StarOutlined style={{ color: '#faad14' }} />}
                      {email.hasAttachments && <PaperClipOutlined />}
                      {renderRelevance(email.id)}
                    </Space>
                    <Text type="secondary" style={{ fontSize: '12px' }}>{formatDate(email.receivedAt)}</Text>
                  </div>
                  <Text strong style={{ fontSize: '14px', display: 'block' }}>
                    <HighlightText text={email.subject} highlight={searchQuery} />
                  </Text>
                  <Text type="secondary" ellipsis>
                    <HighlightText text={email.preview || email.summary || ''} highlight={searchQuery} />
                  </Text>
                </Card>
              )}
            />
            {hasMore && (
              <div style={{ textAlign: 'center', marginTop: '16px', paddingBottom: '20px' }}>
                <Button onClick={onLoadMore} loading={loadingMore}>Load More</Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default SearchResults;
