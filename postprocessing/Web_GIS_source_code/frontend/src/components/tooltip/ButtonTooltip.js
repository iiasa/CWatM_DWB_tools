import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { getTooltipLabel } from './tooltipLabels';
import './ButtonTooltip.css';

const TOOLTIP_GAP = 15;
const EDGE_PADDING = 8;

/**
 * Global, app-wide hover tooltip for icon/tool buttons.
 *
 * Mounted once at the app root. It listens at the document level and shows a
 * small black tooltip whenever the pointer (or keyboard focus) lands on any
 * element carrying a `data-tooltip="<key>"` attribute. The key is resolved to
 * display text via tooltipLabels.js (translation-ready).
 *
 * Positioning mirrors InfoIcon: the tooltip sits above the cursor by default,
 * flips below when near the top of the viewport, and clamps to the left/right/
 * bottom edges so it always stays fully on screen. Rendered via a portal to
 * document.body so panel `overflow:hidden` cannot clip it.
 */
const ButtonTooltip = () => {
  const tooltipRef = useRef(null);
  const anchorRef = useRef(null); // { x, y } in viewport coordinates

  const [label, setLabel] = useState('');
  const [position, setPosition] = useState(null);

  const isOpen = label !== '';

  const computePosition = useCallback((anchor) => {
    const tooltipEl = tooltipRef.current;
    if (!tooltipEl || !anchor) return null;

    const rect = tooltipEl.getBoundingClientRect();
    const { width, height } = rect;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = anchor.x - width / 2;
    let top = anchor.y - height - TOOLTIP_GAP;

    // Flip below the cursor when too close to the top
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

    // Clamp the bottom as a safety net (flipped-below near the bottom edge)
    if (top + height > vh - EDGE_PADDING) {
      top = vh - height - EDGE_PADDING;
    }

    return { left, top };
  }, []);

  const updatePosition = useCallback(() => {
    const next = computePosition(anchorRef.current);
    if (next) setPosition(next);
  }, [computePosition]);

  const showFor = useCallback((target, anchor) => {
    const text = getTooltipLabel(target.dataset.tooltip);
    if (!text) return;
    anchorRef.current = anchor;
    setLabel(text);
  }, []);

  const hide = useCallback(() => {
    setLabel('');
    setPosition(null);
    anchorRef.current = null;
  }, []);

  // Document-level listeners: pointer hover, pointer movement, and keyboard
  // focus all drive the same tooltip. We resolve the nearest [data-tooltip]
  // ancestor so the attribute can sit on the <button> while the cursor is over
  // an inner <svg>/<span>.
  useEffect(() => {
    const handleMouseOver = (event) => {
      const target = event.target.closest?.('[data-tooltip]');
      if (!target) return;
      showFor(target, { x: event.clientX, y: event.clientY });
    };

    const handleMouseMove = (event) => {
      if (!anchorRef.current) return;
      anchorRef.current = { x: event.clientX, y: event.clientY };
      updatePosition();
    };

    const handleMouseOut = (event) => {
      const from = event.target.closest?.('[data-tooltip]');
      if (!from) return;
      // Ignore moves that stay within the same tooltip target
      const to = event.relatedTarget?.closest?.('[data-tooltip]');
      if (to === from) return;
      hide();
    };

    const handleFocusIn = (event) => {
      const target = event.target.closest?.('[data-tooltip]');
      if (!target) return;
      const rect = target.getBoundingClientRect();
      showFor(target, { x: rect.left + rect.width / 2, y: rect.top });
    };

    const handleFocusOut = (event) => {
      if (event.target.closest?.('[data-tooltip]')) hide();
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') hide();
    };

    document.addEventListener('mouseover', handleMouseOver);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseout', handleMouseOut);
    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mouseover', handleMouseOver);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseout', handleMouseOut);
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showFor, hide, updatePosition]);

  // After the tooltip mounts and measures, position it correctly
  useEffect(() => {
    if (!isOpen) return undefined;
    const frame = requestAnimationFrame(updatePosition);
    return () => cancelAnimationFrame(frame);
  }, [isOpen, updatePosition]);

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div
      ref={tooltipRef}
      role="tooltip"
      className="button-tooltip"
      style={{
        left: position ? `${position.left}px` : '-9999px',
        top: position ? `${position.top}px` : '-9999px',
        visibility: position ? 'visible' : 'hidden',
      }}
    >
      {label}
    </div>,
    document.body,
  );
};

export default ButtonTooltip;
