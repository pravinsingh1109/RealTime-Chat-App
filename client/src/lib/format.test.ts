import { conversationTitle, initials, lastMessagePreview } from './format';
import type { Conversation } from '../types/chat';

describe('format helpers', () => {
  const direct: Conversation = {
    id: 'conversation-1',
    type: 'direct',
    participants: [
      { id: 'me', name: 'Me' },
      { id: 'alex', name: 'Alex Morgan' },
    ],
    unreadCount: 0,
    updatedAt: '2025-01-01T00:00:00.000Z',
  };

  it('uses the other participant as a direct-message title', () => {
    expect(conversationTitle(direct, 'me')).toBe('Alex Morgan');
  });

  it('creates compact initials and image previews', () => {
    expect(initials('Alex Morgan')).toBe('AM');
    expect(lastMessagePreview({
      id: 'message-1',
      conversationId: 'conversation-1',
      senderId: 'me',
      type: 'image',
      content: '',
      createdAt: '2025-01-01T00:00:00.000Z',
      status: 'sent',
      seenBy: [],
    }, 'me')).toBe('You: 📷 Photo');
  });
});
