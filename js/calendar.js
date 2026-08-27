const Calendar = {
  currentYear: null,
  currentMonth: null, // 1-12
  events: [],
  searchTerm: '',
  
  init(year, month, events) {
    this.currentYear = year;
    this.currentMonth = month;
    this.events = events;
    this._updateMonthLabel();
    this.render();
  },
  
  render() {
    const grid = document.getElementById('calendarGrid');
    if (!grid) return;
    
    grid.innerHTML = '';
    
    // Render day headers (월~일)
    const days = ['월', '화', '수', '목', '금', '토', '일'];
    days.forEach((day, index) => {
      const header = document.createElement('div');
      header.className = `calendar-header-day ${index >= 5 ? 'weekend' : ''}`;
      header.textContent = day;
      grid.appendChild(header);
    });
    
    this._generateGrid(grid);
  },
  
  navigateMonth(delta) {
    let m = this.currentMonth + delta;
    let y = this.currentYear;
    
    if (m > 12) {
      m = 1;
      y += 1;
    } else if (m < 1) {
      m = 12;
      y -= 1;
    }
    
    const events = Storage.getMonth(y, m);
    this.init(y, m, events);
    
    if (events.length === 0) {
      App.showToast(`${y}년 ${m}월 일정이 없습니다.`, 'info');
    }
  },
  
  _generateGrid(grid) {
    const firstDate = new Date(this.currentYear, this.currentMonth - 1, 1);
    let startDay = firstDate.getDay() - 1;
    if (startDay < 0) startDay = 6;
    
    const daysInMonth = new Date(this.currentYear, this.currentMonth, 0).getDate();
    const daysInPrevMonth = new Date(this.currentYear, this.currentMonth - 1, 0).getDate();
    
    const today = new Date();
    const isThisMonth = (today.getFullYear() === this.currentYear && today.getMonth() === this.currentMonth - 1);
    const todayDate = today.getDate();
    
    const allDates = [];
    
    // Prev month trailing days
    for (let i = startDay - 1; i >= 0; i--) {
      const dateNum = daysInPrevMonth - i;
      const d = new Date(this.currentYear, this.currentMonth - 2, dateNum);
      allDates.push({ date: d, isCurrentMonth: false, isToday: false });
    }
    
    // Current month days
    for (let i = 1; i <= daysInMonth; i++) {
      const isToday = isThisMonth && i === todayDate;
      const d = new Date(this.currentYear, this.currentMonth - 1, i);
      allDates.push({ date: d, isCurrentMonth: true, isToday });
    }
    
    // Next month leading days
    const totalCells = startDay + daysInMonth;
    const remainingCells = (7 - (totalCells % 7)) % 7;
    const targetGridSize = totalCells + remainingCells <= 35 ? 35 : 42;
    const fillCells = targetGridSize - totalCells;
    
    for (let i = 1; i <= fillCells; i++) {
      const d = new Date(this.currentYear, this.currentMonth, i);
      allDates.push({ date: d, isCurrentMonth: false, isToday: false });
    }
    
    const allEvents = this._getFilteredAllEvents();
    
    const totalWeeks = allDates.length / 7;
    for (let w = 0; w < totalWeeks; w++) {
      const weekDates = allDates.slice(w * 7, w * 7 + 7);
      const weekStartStr = this._formatDateString(weekDates[0].date);
      const weekEndStr = this._formatDateString(weekDates[6].date);
      
      const weekEvents = allEvents.filter(e => {
        const isMulti = e.isMultiDay && e.endDate;
        const start = e.startDate;
        const end = isMulti ? e.endDate : e.startDate;
        return start <= weekEndStr && end >= weekStartStr;
      });
      
      const topEvents = weekEvents.filter(e => (e.isMultiDay && e.endDate) || e.isAllDay);
      const timedEvents = weekEvents.filter(e => !((e.isMultiDay && e.endDate) || e.isAllDay));
      
      const slotAssignments = this._assignSlotsUnified(topEvents, weekStartStr, weekEndStr, weekDates);
      
      const maxSlots = slotAssignments.length > 0 ? Math.max(...slotAssignments.map(a => a.slot)) + 1 : 0;
      
      const weekRow = document.createElement('div');
      weekRow.className = 'week-row-grid';
      
      let rowTemplate = 'max-content'; // 1행: 날짜 숫자
      for (let i = 0; i < maxSlots; i++) {
        rowTemplate += ' min-content'; // 2행~: 상단 이벤트(종일/다중)
      }
      rowTemplate += ' 1fr'; // 마지막 행: 하단 이벤트(시간지정 일반일정)가 빈틈없이 쌓이는 공간
      weekRow.style.gridTemplateRows = rowTemplate;
      
      // 1. Background Cells, Date Headers & Timed Events
      weekDates.forEach((dateInfo, colIndex) => {
        const bgCell = document.createElement('div');
        bgCell.className = 'bg-cell';
        if (!dateInfo.isCurrentMonth) bgCell.classList.add('other-month');
        bgCell.style.gridColumn = colIndex + 1;
        bgCell.style.gridRow = '1 / -1';
        weekRow.appendChild(bgCell);
        
        const dateHeader = document.createElement('div');
        dateHeader.className = 'date-header';
        dateHeader.style.gridColumn = colIndex + 1;
        dateHeader.style.gridRow = '1';
        
        const dateNumber = document.createElement('span');
        dateNumber.className = 'date-number';
        if (dateInfo.isToday) dateNumber.classList.add('today');
        dateNumber.textContent = dateInfo.date.getDate();
        
        dateHeader.appendChild(dateNumber);
        weekRow.appendChild(dateHeader);
        
        // Timed Events Container for this day
        const timedContainer = document.createElement('div');
        timedContainer.className = 'timed-events-container';
        timedContainer.style.gridColumn = colIndex + 1;
        timedContainer.style.gridRow = maxSlots + 2; // 마지막 1fr 공간
        
        const dateStr = this._formatDateString(dateInfo.date);
        const dayTimedEvents = timedEvents.filter(e => e.startDate === dateStr);
        
        // 시간순 정렬
        dayTimedEvents.sort((a, b) => {
          const aTime = a.startTime || '24:00';
          const bTime = b.startTime || '24:00';
          return aTime < bTime ? -1 : 1;
        });
        
        // 렌더링 및 추가
        dayTimedEvents.forEach(e => {
          const eventEl = this._renderUnifiedEvent({
            event: e,
            slot: 0,
            startCol: colIndex,
            endCol: colIndex,
            isStartClamped: false,
            isEndClamped: false,
            isMulti: false
          });
          // 그리드 속성을 제거하여 컨테이너 내에서 빈틈없이 쌓이게 함
          eventEl.style.gridColumn = '';
          eventEl.style.gridRow = '';
          timedContainer.appendChild(eventEl);
        });
        
        weekRow.appendChild(timedContainer);
      });
      
      // 2. Top Events (Multi-day / All-day)
      slotAssignments.forEach(assignment => {
        const eventEl = this._renderUnifiedEvent(assignment);
        weekRow.appendChild(eventEl);
      });
      
      grid.appendChild(weekRow);
    }
  },
  
  _getFilteredAllEvents() {
    return this.events.filter(e => {
      if (!Categories.isActive(e.category)) return false;
      if (this.searchTerm) {
        const term = this.searchTerm.toLowerCase();
        const matchesSubject = e.subject.toLowerCase().includes(term);
        const matchesDesc = (e.description || '').toLowerCase().includes(term);
        if (!matchesSubject && !matchesDesc) return false;
      }
      return true;
    });
  },
  
  _assignSlotsUnified(events, weekStartStr, weekEndStr, weekDates) {
    if (events.length === 0) return [];
    
    // Sort logic
    const sorted = [...events].sort((a, b) => {
      const aIsMulti = a.isMultiDay && a.endDate;
      const bIsMulti = b.isMultiDay && b.endDate;
      
      // 1. Multi-day first
      if (aIsMulti !== bIsMulti) return aIsMulti ? -1 : 1;
      
      // 2. Earlier start date first
      if (a.startDate !== b.startDate) return a.startDate < b.startDate ? -1 : 1;
      
      // 3. Longer duration first
      const aDur = aIsMulti ? this._daysBetween(a.startDate, a.endDate) : 1;
      const bDur = bIsMulti ? this._daysBetween(b.startDate, b.endDate) : 1;
      if (aDur !== bDur) return bDur - aDur;
      
      // 4. Earlier start time for single day
      if (!aIsMulti && !bIsMulti) {
        const aTime = a.startTime || '24:00';
        const bTime = b.startTime || '24:00';
        if (aTime !== bTime) return aTime < bTime ? -1 : 1;
      }
      return 0;
    });
    
    const slotOccupancy = [];
    const assignments = [];
    
    sorted.forEach(event => {
      const isMulti = event.isMultiDay && event.endDate;
      const clampedStart = event.startDate < weekStartStr ? weekStartStr : event.startDate;
      const clampedEnd = isMulti ? (event.endDate > weekEndStr ? weekEndStr : event.endDate) : clampedStart;
      
      const startCol = this._dateToColumnIndex(clampedStart, weekDates);
      const endCol = this._dateToColumnIndex(clampedEnd, weekDates);
      
      if (startCol === -1 || endCol === -1) return;
      
      let slot = 0;
      while (true) {
        if (!slotOccupancy[slot]) slotOccupancy[slot] = new Set();
        let available = true;
        for (let c = startCol; c <= endCol; c++) {
          if (slotOccupancy[slot].has(c)) { available = false; break; }
        }
        if (available) break;
        slot++;
      }
      
      if (!slotOccupancy[slot]) slotOccupancy[slot] = new Set();
      for (let c = startCol; c <= endCol; c++) {
        slotOccupancy[slot].add(c);
      }
      
      assignments.push({
        event, slot, startCol, endCol,
        isStartClamped: event.startDate < weekStartStr,
        isEndClamped: isMulti && event.endDate > weekEndStr,
        isMulti
      });
    });
    
    return assignments;
  },
  
  _dateToColumnIndex(dateStr, weekDates) {
    for (let i = 0; i < weekDates.length; i++) {
      if (this._formatDateString(weekDates[i].date) === dateStr) return i;
    }
    return -1;
  },
  
  _daysBetween(startStr, endStr) {
    const s = new Date(startStr + 'T00:00:00');
    const e = new Date(endStr + 'T00:00:00');
    return Math.round((e - s) / (1000 * 60 * 60 * 24));
  },
  
  _renderUnifiedEvent(assignment) {
    const { event, slot, startCol, endCol, isStartClamped, isEndClamped, isMulti } = assignment;
    const span = endCol - startCol + 1;
    
    const wrapper = document.createElement('div');
    wrapper.className = 'event-wrapper';
    wrapper.style.gridColumn = `${startCol + 1} / span ${span}`;
    wrapper.style.gridRow = `${slot + 2}`; // Row 1 is reserved for date headers
    
    const card = document.createElement('div');
    card.className = isMulti ? 'event-card multiday' : 'event-card single-day';
    
    const colors = Categories.getColor(event.category);
    card.style.backgroundColor = colors.bg;
    card.style.color = colors.text;
    
    if (isMulti) {
      const r = '4px';
      const f = '0px';
      card.style.borderRadius = `${isStartClamped ? f : r} ${isEndClamped ? f : r} ${isEndClamped ? f : r} ${isStartClamped ? f : r}`;
    } else {
      card.style.borderRadius = '4px';
    }
    
    let displaySubject = event.subject;
    if (this.searchTerm) {
      const regex = new RegExp(`(${this.searchTerm})`, 'gi');
      displaySubject = displaySubject.replace(regex, '<span class="search-highlight">$1</span>');
    }
    
    let timeText = '';
    if (!isMulti && !event.isAllDay && event.startTime) {
      timeText = `<span class="event-time">${event.startTime}</span> `;
    }
    
    card.innerHTML = `${timeText}<span class="event-subject">${displaySubject}</span>`;
    
    card.addEventListener('click', () => {
      Modal.openEvent(event);
    });
    
    wrapper.appendChild(card);
    return wrapper;
  },
  
  _formatDateString(dateObj) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  },
  
  _updateMonthLabel() {
    const label = document.getElementById('currentMonthLabel');
    if (label) {
      label.textContent = `${this.currentYear}년 ${this.currentMonth}월`;
    }
  }
};
