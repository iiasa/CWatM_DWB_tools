import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import './DateRangePicker.css';

const MIN_DATE = new Date(Date.UTC(1990, 0, 1));
const MAX_DATE = new Date(Date.UTC(2020, 0, 1));
const MIN_YEAR = MIN_DATE.getUTCFullYear();
const MAX_YEAR = MAX_DATE.getUTCFullYear();

const MONTH_NAMES_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

const formatDate = (d) =>
  `${MONTH_NAMES_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()}`;

const dateToString = (d) => {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
};

const parseInitialTime = (value) => {
  if (!value) return new Date(Date.UTC(2005, 0, 1));
  const [y, m] = value.split('-').map(Number);
  if (!y || !m) return new Date(Date.UTC(2005, 0, 1));
  return new Date(Date.UTC(y, m - 1, 1));
};

const clampToRange = (d, min, max) => {
  if (d < min) return new Date(min);
  if (d > max) return new Date(max);
  return d;
};

const isSameMonth = (a, b) =>
  a.getUTCFullYear() === b.getUTCFullYear() &&
  a.getUTCMonth() === b.getUTCMonth();

const PlayIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
    <path d="M8 5v14l11-7z" fill="currentColor" />
  </svg>
);

const PauseIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
    <rect x="6" y="5" width="4" height="14" fill="currentColor" />
    <rect x="14" y="5" width="4" height="14" fill="currentColor" />
  </svg>
);

const CalendarIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path
      d="M7 2v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2H7zM5 10h14v10H5V10z"
      fill="currentColor"
    />
  </svg>
);

const ChevronLeftIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
    <path
      d="M15 18l-6-6 6-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const ChevronRightIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
    <path
      d="M9 18l6-6-6-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const DateRangePicker = ({
  onTimeChange,
  onRangeChange,
  initialTime = '2005-01-01',
  className = '',
  disabled = false
}) => {
  const [startDate, setStartDate] = useState(MIN_DATE);
  const [endDate, setEndDate] = useState(MAX_DATE);
  const [currentDate, setCurrentDate] = useState(() =>
    clampToRange(parseInitialTime(initialTime), MIN_DATE, MAX_DATE)
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('current');
  const [viewYear, setViewYear] = useState(() =>
    clampToRange(parseInitialTime(initialTime), MIN_DATE, MAX_DATE).getUTCFullYear()
  );
  const [focusedMonth, setFocusedMonth] = useState(
    () => clampToRange(parseInitialTime(initialTime), MIN_DATE, MAX_DATE).getUTCMonth()
  );
  const [yearInputValue, setYearInputValue] = useState(String(viewYear));

  const monthDebounceTimer = useRef(null);
  const rangeDebounceTimer = useRef(null);
  const playIntervalRef = useRef(null);
  const isFirstRender = useRef(true);
  const popoverRef = useRef(null);
  const calendarBtnRef = useRef(null);
  const monthRefs = useRef([]);

  useEffect(() => {
    if (currentDate < startDate) setCurrentDate(new Date(startDate));
    else if (currentDate > endDate) setCurrentDate(new Date(endDate));
  }, [startDate, endDate, currentDate]);

  useEffect(() => {
    if (!onTimeChange) return;
    clearTimeout(monthDebounceTimer.current);
    monthDebounceTimer.current = setTimeout(() => {
      onTimeChange(dateToString(currentDate));
    }, 300);
    return () => clearTimeout(monthDebounceTimer.current);
  }, [currentDate, onTimeChange]);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (!onRangeChange) return;
    clearTimeout(rangeDebounceTimer.current);
    rangeDebounceTimer.current = setTimeout(() => {
      onRangeChange({
        start: dateToString(startDate),
        end: dateToString(endDate)
      });
    }, 2000);
    return () => clearTimeout(rangeDebounceTimer.current);
  }, [startDate, endDate, onRangeChange]);

  const handlePlayPause = useCallback(() => {
    setIsPlaying((prev) => !prev);
  }, []);

  const handleStepMonth = useCallback(
    (delta) => {
      setIsPlaying(false);
      setCurrentDate((prev) => {
        const next = new Date(prev);
        next.setUTCMonth(next.getUTCMonth() + delta);
        return clampToRange(next, startDate, endDate);
      });
    },
    [startDate, endDate]
  );

  useEffect(() => {
    if (!isPlaying) {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
        playIntervalRef.current = null;
      }
      return;
    }
    playIntervalRef.current = setInterval(() => {
      setCurrentDate((prev) => {
        const next = new Date(prev);
        next.setUTCMonth(next.getUTCMonth() + 1);
        if (next > endDate) return new Date(startDate);
        return next;
      });
    }, 2000);
    return () => {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
        playIntervalRef.current = null;
      }
    };
  }, [isPlaying, startDate, endDate]);

  useEffect(() => {
    return () => {
      clearTimeout(monthDebounceTimer.current);
      clearTimeout(rangeDebounceTimer.current);
      if (playIntervalRef.current) clearInterval(playIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleDocMouseDown = (e) => {
      if (popoverRef.current && popoverRef.current.contains(e.target)) return;
      if (calendarBtnRef.current && calendarBtnRef.current.contains(e.target)) return;
      setIsOpen(false);
    };
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        calendarBtnRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', handleDocMouseDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleDocMouseDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [isOpen]);

  const handleOpenPopover = () => {
    const anchorDate =
      activeTab === 'start' ? startDate
      : activeTab === 'end' ? endDate
      : currentDate;
    setViewYear(anchorDate.getUTCFullYear());
    setYearInputValue(String(anchorDate.getUTCFullYear()));
    setFocusedMonth(anchorDate.getUTCMonth());
    setIsOpen(true);
  };

  const handleToggleCalendar = () => {
    if (isOpen) setIsOpen(false);
    else handleOpenPopover();
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    const anchorDate =
      tab === 'start' ? startDate
      : tab === 'end' ? endDate
      : currentDate;
    setViewYear(anchorDate.getUTCFullYear());
    setYearInputValue(String(anchorDate.getUTCFullYear()));
    setFocusedMonth(anchorDate.getUTCMonth());
  };

  const isMonthDisabled = useCallback(
    (year, monthIdx) => {
      const candidate = new Date(Date.UTC(year, monthIdx, 1));
      if (candidate < MIN_DATE || candidate > MAX_DATE) return true;
      if (activeTab === 'start') return candidate > endDate;
      if (activeTab === 'end') return candidate < startDate;
      return candidate < startDate || candidate > endDate;
    },
    [activeTab, startDate, endDate]
  );

  const handleMonthClick = (monthIdx) => {
    if (isMonthDisabled(viewYear, monthIdx)) return;
    const next = new Date(Date.UTC(viewYear, monthIdx, 1));
    if (activeTab === 'start') {
      setStartDate(next);
      if (currentDate < next) setCurrentDate(next);
    } else if (activeTab === 'end') {
      setEndDate(next);
      if (currentDate > next) setCurrentDate(next);
    } else {
      setCurrentDate(next);
    }
    setFocusedMonth(monthIdx);
  };

  const handleYearStep = (delta) => {
    setViewYear((prev) => {
      const next = Math.min(MAX_YEAR, Math.max(MIN_YEAR, prev + delta));
      setYearInputValue(String(next));
      return next;
    });
  };

  const handleYearInputChange = (e) => {
    setYearInputValue(e.target.value);
  };

  const handleYearInputKeyDown = (e) => {
    if (e.key !== 'Enter') return;
    const y = parseInt(yearInputValue, 10);
    if (Number.isNaN(y) || y < MIN_YEAR || y > MAX_YEAR) {
      setYearInputValue(String(viewYear));
      return;
    }
    setViewYear(y);
  };

  const handleYearInputBlur = () => {
    const y = parseInt(yearInputValue, 10);
    if (Number.isNaN(y) || y < MIN_YEAR || y > MAX_YEAR) {
      setYearInputValue(String(viewYear));
      return;
    }
    setViewYear(y);
  };

  const handleMonthKeyDown = (e, monthIdx) => {
    let nextMonth = monthIdx;
    let nextYear = viewYear;
    let consumed = true;
    if (e.key === 'ArrowLeft') {
      nextMonth -= 1;
      if (nextMonth < 0) { nextMonth = 11; nextYear -= 1; }
    } else if (e.key === 'ArrowRight') {
      nextMonth += 1;
      if (nextMonth > 11) { nextMonth = 0; nextYear += 1; }
    } else if (e.key === 'ArrowUp') {
      nextMonth -= 3;
      if (nextMonth < 0) { nextMonth += 12; nextYear -= 1; }
    } else if (e.key === 'ArrowDown') {
      nextMonth += 3;
      if (nextMonth > 11) { nextMonth -= 12; nextYear += 1; }
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleMonthClick(monthIdx);
      return;
    } else {
      consumed = false;
    }
    if (!consumed) return;
    e.preventDefault();
    if (nextYear < MIN_YEAR || nextYear > MAX_YEAR) return;
    if (nextYear !== viewYear) {
      setViewYear(nextYear);
      setYearInputValue(String(nextYear));
    }
    setFocusedMonth(nextMonth);
    requestAnimationFrame(() => {
      monthRefs.current[nextMonth]?.focus();
    });
  };

  const selectedMonthForTab = useMemo(() => {
    const selDate =
      activeTab === 'start' ? startDate
      : activeTab === 'end' ? endDate
      : currentDate;
    if (selDate.getUTCFullYear() !== viewYear) return -1;
    return selDate.getUTCMonth();
  }, [activeTab, startDate, endDate, currentDate, viewYear]);

  if (disabled) return null;

  const rangeChip = `${formatDate(startDate)} → ${formatDate(endDate)}`;
  const atStart = isSameMonth(currentDate, startDate);
  const atEnd = isSameMonth(currentDate, endDate);

  return (
    <div className={`date-range-picker ${className}`.trim()}>
      <div className="drp-panel" role="group" aria-label="Time controls">
        <div className="drp-info-col">
          <div className="drp-info-row">
            <button
              ref={calendarBtnRef}
              type="button"
              className={`drp-icon-btn drp-calendar-btn ${isOpen ? 'is-open' : ''}`}
              onClick={handleToggleCalendar}
              aria-haspopup="dialog"
              aria-expanded={isOpen}
              aria-label="Open month and year picker"
              data-tooltip="openCalendar"
            >
              <CalendarIcon />
            </button>

            <span className="drp-current-date" aria-live="polite" aria-atomic="true">
              {formatDate(currentDate)}
            </span>
          </div>

          <span className="drp-range-chip" title="Selected range">
            {rangeChip}
          </span>
        </div>

        <div className="drp-play-group" role="group" aria-label="Playback controls">
          <button
            type="button"
            className="drp-icon-btn drp-step-btn"
            onClick={() => handleStepMonth(-1)}
            disabled={atStart}
            aria-label="Previous month"
            data-tooltip="stepBack"
          >
            <ChevronLeftIcon />
          </button>

          <button
            type="button"
            className="drp-icon-btn drp-play-btn"
            onClick={handlePlayPause}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            data-tooltip={isPlaying ? 'pause' : 'play'}
          >
            {isPlaying ? <PauseIcon /> : <PlayIcon />}
          </button>

          <button
            type="button"
            className="drp-icon-btn drp-step-btn"
            onClick={() => handleStepMonth(1)}
            disabled={atEnd}
            aria-label="Next month"
            data-tooltip="stepForward"
          >
            <ChevronRightIcon />
          </button>
        </div>
      </div>

      <div
        ref={popoverRef}
        className={`drp-popover ${isOpen ? 'open' : ''}`}
        role="dialog"
        aria-modal="false"
        aria-label="Month and year picker"
        aria-hidden={!isOpen}
      >
        <div className="drp-tabs" role="tablist" aria-label="Date type">
          {['current', 'start', 'end'].map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              tabIndex={activeTab === tab ? 0 : -1}
              className={`drp-tab ${activeTab === tab ? 'active' : ''}`}
              onClick={() => handleTabChange(tab)}
            >
              {tab === 'current' ? 'Current' : tab === 'start' ? 'Start' : 'End'}
            </button>
          ))}
        </div>

        <div className="drp-year-nav">
          <button
            type="button"
            className="drp-year-step"
            onClick={() => handleYearStep(-1)}
            disabled={viewYear <= MIN_YEAR}
            aria-label="Previous year"
          >
            ◀
          </button>
          <input
            type="number"
            className="drp-year-input"
            value={yearInputValue}
            min={MIN_YEAR}
            max={MAX_YEAR}
            onChange={handleYearInputChange}
            onKeyDown={handleYearInputKeyDown}
            onBlur={handleYearInputBlur}
            aria-label="Year (type to search, press Enter)"
          />
          <button
            type="button"
            className="drp-year-step"
            onClick={() => handleYearStep(1)}
            disabled={viewYear >= MAX_YEAR}
            aria-label="Next year"
          >
            ▶
          </button>
        </div>

        <div className="drp-month-grid" role="grid">
          {MONTH_NAMES_SHORT.map((label, idx) => {
            const disabledCell = isMonthDisabled(viewYear, idx);
            const selected = selectedMonthForTab === idx;
            const currentMonthMarker =
              isSameMonth(currentDate, new Date(Date.UTC(viewYear, idx, 1)));
            return (
              <button
                key={label}
                ref={(el) => (monthRefs.current[idx] = el)}
                type="button"
                role="gridcell"
                aria-selected={selected}
                aria-disabled={disabledCell}
                disabled={disabledCell}
                tabIndex={focusedMonth === idx ? 0 : -1}
                className={[
                  'drp-month-cell',
                  selected ? 'selected' : '',
                  currentMonthMarker ? 'is-current' : '',
                  disabledCell ? 'disabled' : ''
                ].filter(Boolean).join(' ')}
                onClick={() => handleMonthClick(idx)}
                onKeyDown={(e) => handleMonthKeyDown(e, idx)}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div className="drp-popover-footer">
          <button
            type="button"
            className="drp-done"
            onClick={() => {
              setIsOpen(false);
              calendarBtnRef.current?.focus();
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

export default DateRangePicker;
