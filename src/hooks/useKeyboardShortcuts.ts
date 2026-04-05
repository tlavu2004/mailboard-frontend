import { useEffect } from 'react';

type KeyHandler = (event: KeyboardEvent) => void;

interface ShortcutMap {
  [key: string]: KeyHandler;
}

export const useKeyboardShortcuts = (shortcuts: ShortcutMap, isActive: boolean = true) => {
  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore if user is typing in an input, textarea or contenteditable element
      const target = event.target as HTMLElement;
      const isTyping = 
        target.tagName === 'INPUT' || 
        target.tagName === 'TEXTAREA' || 
        target.isContentEditable;

      if (isTyping && event.key !== 'Escape') {
        return;
      }

      // Check if we have a handler for this key
      const handler = shortcuts[event.key.toLowerCase()] || shortcuts[event.key];
      if (handler) {
        handler(event);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [shortcuts, isActive]);
};
