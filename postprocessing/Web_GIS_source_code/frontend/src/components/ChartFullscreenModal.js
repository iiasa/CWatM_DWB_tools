import React, { useEffect, useRef, useId, useCallback } from 'react';
import ReactDOM from 'react-dom';
import './ChartFullscreenModal.css';

// Defensive counter so concurrent modals (none today, but cheap to support)
// don't trample each other's saved body style on close.
let scrollLockCount = 0;
let savedBodyOverflow = '';
let savedBodyPaddingRight = '';

const lockBodyScroll = () => {
  if (scrollLockCount === 0) {
    savedBodyOverflow = document.body.style.overflow;
    savedBodyPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
  }
  scrollLockCount += 1;
};

const unlockBodyScroll = () => {
  scrollLockCount = Math.max(0, scrollLockCount - 1);
  if (scrollLockCount === 0) {
    document.body.style.overflow = savedBodyOverflow;
    document.body.style.paddingRight = savedBodyPaddingRight;
  }
};

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

const ChartFullscreenModal = ({
  isOpen,
  onClose,
  titleId,
  openerRef,
  children,
  className = '',
}) => {
  const containerRef = useRef(null);
  const fallbackId = useId();
  const labelledBy = titleId || fallbackId;

  // mousedown (not click) so a Ctrl+drag pan that starts on the chart and
  // releases on the backdrop doesn't accidentally dismiss the modal.
  const handleBackdropMouseDown = useCallback((event) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return undefined;

    lockBodyScroll();
    const previouslyFocused = document.activeElement;
    // Capture the opener ref at effect start so cleanup uses a stable value
    // (eslint react-hooks/exhaustive-deps).
    const openerOnOpen = openerRef?.current || null;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const root = containerRef.current;
      if (!root) return;
      const focusables = root.querySelectorAll(FOCUSABLE_SELECTOR);
      if (focusables.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);

    const focusTimer = requestAnimationFrame(() => {
      const root = containerRef.current;
      if (!root) return;
      const firstFocusable = root.querySelector(FOCUSABLE_SELECTOR);
      (firstFocusable || root).focus?.();
    });

    return () => {
      cancelAnimationFrame(focusTimer);
      window.removeEventListener('keydown', handleKeyDown, true);
      unlockBodyScroll();
      const target = openerOnOpen || previouslyFocused;
      if (target && typeof target.focus === 'function') {
        target.focus();
      }
    };
  }, [isOpen, onClose, openerRef]);

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div className="chart-fs-backdrop" onMouseDown={handleBackdropMouseDown}>
      <div
        ref={containerRef}
        className={`chart-fs-container ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
      >
        <div className="chart-fs-content">{children}</div>
      </div>
    </div>,
    document.body,
  );
};

export default ChartFullscreenModal;
