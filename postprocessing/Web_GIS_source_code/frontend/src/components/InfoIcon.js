import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { DEFAULT_LAYER_INFO_PLACEHOLDER } from '../config/layerLegendConfig';
import './InfoIcon.css';

const TOOLTIP_GAP = 15;
const EDGE_PADDING = 8;

/**
 * Small "i" button that opens a dark semi-transparent tooltip on hover/focus.
 *
 * The tooltip follows the mouse cursor with edge detection: it sits above the
 * cursor by default, flips below when near the top of the viewport, and clamps
 * horizontally when near the left/right edges so it always stays fully on
 * screen. Keyboard focus anchors the tooltip to the icon instead.
 *
 * Rendered via a portal to document.body so the layers panel's overflow:hidden
 * + fixed width cannot clip it.
 */
const InfoIcon = ({
  title,
  description,
  ariaLabel,
}) => {
  const tooltipId = useId();
  const buttonRef = useRef(null);
  const tooltipRef = useRef(null);
  const cursorRef = useRef(null);

  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState(null);

  const body = (description && description.trim()) || DEFAULT_LAYER_INFO_PLACEHOLDER;

  const computePosition = useCallback((anchor) => {
    const tooltipEl = tooltipRef.current;
    if (!tooltipEl || !anchor) return null;

    const rect = tooltipEl.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = anchor.x - width / 2;
    let top = anchor.y - height - TOOLTIP_GAP;

    // Flip below when too close to the top
    if (top < EDGE_PADDING) {
      top = anchor.y + TOOLTIP_GAP;
    }

    // Clamp horizontally to the viewport
    if (left < EDGE_PADDING) {
      left = EDGE_PADDING;
    }
    if (left + width > vw - EDGE_PADDING) {
      left = vw - width - EDGE_PADDING;
    }

    // Clamp bottom as a safety net (when flipped below near the bottom-right)
    if (top + height > vh - EDGE_PADDING) {
      top = vh - height - EDGE_PADDING;
    }

    return { left, top };
  }, []);

  const updatePositionFromCursor = useCallback(() => {
    const next = computePosition(cursorRef.current);
    if (next) setPosition(next);
  }, [computePosition]);

  const handleMouseEnter = useCallback((event) => {
    cursorRef.current = { x: event.clientX, y: event.clientY };
    setIsOpen(true);
  }, []);

  const handleMouseMove = useCallback((event) => {
    cursorRef.current = { x: event.clientX, y: event.clientY };
    if (tooltipRef.current) {
      const next = computePosition(cursorRef.current);
      if (next) setPosition(next);
    }
  }, [computePosition]);

  const handleMouseLeave = useCallback(() => {
    setIsOpen(false);
    setPosition(null);
  }, []);

  const handleFocus = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    cursorRef.current = { x: rect.left + rect.width / 2, y: rect.top };
    setIsOpen(true);
  }, []);

  const handleBlur = useCallback(() => {
    setIsOpen(false);
    setPosition(null);
  }, []);

  // Prevent clicks on the icon from toggling the wrapping checkbox label
  const handleClick = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

  // Close on Escape while open and focused
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        setPosition(null);
        buttonRef.current?.blur();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen]);

  // After the tooltip mounts and lays out, measure it and position correctly
  useEffect(() => {
    if (!isOpen) return undefined;
    const frame = requestAnimationFrame(updatePositionFromCursor);
    return () => cancelAnimationFrame(frame);
  }, [isOpen, updatePositionFromCursor]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="info-icon-btn"
        aria-label={ariaLabel || title || 'More information'}
        aria-describedby={isOpen ? tooltipId : undefined}
        data-hover-ignore
        onMouseEnter={handleMouseEnter}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onClick={handleClick}
      >
        <svg
          className="info-icon-svg"
          viewBox="0 0 16 16"
          width="14"
          height="14"
          aria-hidden="true"
          focusable="false"
        >
          <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <circle cx="8" cy="4.6" r="0.95" fill="currentColor" />
          <rect x="7.25" y="6.8" width="1.5" height="5.2" rx="0.5" fill="currentColor" />
        </svg>
      </button>

      {isOpen && ReactDOM.createPortal(
        <div
          ref={tooltipRef}
          id={tooltipId}
          role="tooltip"
          className="info-tooltip"
          style={{
            left: position ? `${position.left}px` : '-9999px',
            top: position ? `${position.top}px` : '-9999px',
            visibility: position ? 'visible' : 'hidden',
          }}
        >
          {title && <div className="info-tooltip-title">{title}</div>}
          <div className="info-tooltip-body">{body}</div>
        </div>,
        document.body,
      )}
    </>
  );
};

export default InfoIcon;
