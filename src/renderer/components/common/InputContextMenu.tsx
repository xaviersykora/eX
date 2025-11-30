import React, { useRef, useEffect, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { Scissors, Copy, Clipboard } from 'lucide-react';
import './InputContextMenu.css';

interface InputContextMenuProps {
  x: number;
  y: number;
  inputElement: HTMLInputElement | HTMLTextAreaElement;
  onClose: () => void;
}

export const InputContextMenu: React.FC<InputContextMenuProps> = ({
  x,
  y,
  inputElement,
  onClose,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [canPaste, setCanPaste] = useState(false);

  // Check clipboard on mount
  useEffect(() => {
    navigator.clipboard.readText()
      .then((text) => setCanPaste(text.length > 0))
      .catch(() => setCanPaste(true)); // Assume true if we can't check
  }, []);

  // Close on click outside or escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  // Adjust position to keep menu in viewport
  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let adjustedX = x;
      let adjustedY = y;

      if (x + rect.width > viewportWidth) {
        adjustedX = viewportWidth - rect.width - 8;
      }
      if (y + rect.height > viewportHeight) {
        adjustedY = viewportHeight - rect.height - 8;
      }

      menuRef.current.style.left = `${Math.max(8, adjustedX)}px`;
      menuRef.current.style.top = `${Math.max(8, adjustedY)}px`;
    }
  }, [x, y]);

  const hasSelection = inputElement.selectionStart !== inputElement.selectionEnd;
  const hasText = inputElement.value.length > 0;

  const handleCut = useCallback(async () => {
    if (hasSelection) {
      const start = inputElement.selectionStart || 0;
      const end = inputElement.selectionEnd || 0;
      const selectedText = inputElement.value.substring(start, end);

      await navigator.clipboard.writeText(selectedText);

      // Remove selected text
      const newValue = inputElement.value.substring(0, start) + inputElement.value.substring(end);

      // Trigger change event
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )?.set || Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value'
      )?.set;

      if (nativeInputValueSetter) {
        nativeInputValueSetter.call(inputElement, newValue);
        inputElement.dispatchEvent(new Event('input', { bubbles: true }));
      }

      inputElement.setSelectionRange(start, start);
    }
    onClose();
  }, [inputElement, hasSelection, onClose]);

  const handleCopy = useCallback(async () => {
    if (hasSelection) {
      const start = inputElement.selectionStart || 0;
      const end = inputElement.selectionEnd || 0;
      const selectedText = inputElement.value.substring(start, end);
      await navigator.clipboard.writeText(selectedText);
    }
    onClose();
  }, [inputElement, hasSelection, onClose]);

  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      const start = inputElement.selectionStart || 0;
      const end = inputElement.selectionEnd || 0;

      const newValue = inputElement.value.substring(0, start) + text + inputElement.value.substring(end);

      // Trigger change event
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )?.set || Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value'
      )?.set;

      if (nativeInputValueSetter) {
        nativeInputValueSetter.call(inputElement, newValue);
        inputElement.dispatchEvent(new Event('input', { bubbles: true }));
      }

      inputElement.setSelectionRange(start + text.length, start + text.length);
    } catch (error) {
      console.error('Failed to paste:', error);
    }
    onClose();
  }, [inputElement, onClose]);

  const menuItems = [
    { id: 'cut', label: 'Cut', icon: <Scissors size={16} />, disabled: !hasSelection, action: handleCut },
    { id: 'copy', label: 'Copy', icon: <Copy size={16} />, disabled: !hasSelection, action: handleCopy },
    { id: 'paste', label: 'Paste', icon: <Clipboard size={16} />, disabled: !canPaste, action: handlePaste },
  ];

  // Use portal to render at document.body level
  // This avoids stacking context issues with backdrop-filter in glass mode
  return createPortal(
    <div ref={menuRef} className="input-context-menu" style={{ left: x, top: y }}>
      {menuItems.map((item) => (
        <button
          key={item.id}
          className={`input-context-menu-item ${item.disabled ? 'disabled' : ''}`}
          onClick={item.action}
          disabled={item.disabled}
        >
          <span className="input-context-menu-icon">{item.icon}</span>
          <span>{item.label}</span>
        </button>
      ))}
    </div>,
    document.body
  );
};

// Hook to add context menu support to an input element
export function useInputContextMenu() {
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    element: HTMLInputElement | HTMLTextAreaElement;
  } | null>(null);

  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      element: e.currentTarget,
    });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  return {
    contextMenu,
    handleContextMenu,
    closeContextMenu,
  };
}
