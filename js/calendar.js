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
    
    // Build flat array of all dates in the grid
    const allDates = [];
    
    for (let i = startDay - 1; i >= 0; i--) {
      const dateNum = daysInPrevMonth - i;
      const d = new Date(this.currentYear, this.currentMonth - 2, dateNum);
      allDates.push({ date: d, isCurrentMonth: false, isToday: false });
    }
    
    for (let i = 1; i <= daysInMonth; i++) {
      const isToday = isThisMonth && i === todayDate;
      const d = new Date(this.currentYear, this.currentMonth - 1, i);
      allDates.push({ date: d, isCurrentMonth: true, isToday });
    }
    
    const totalCells = startDay + daysInMonth;
    const remainingCells = (7 - (totalCells % 7)) % 7;
    const targetGridSize = totalCells + remainingCells <= 35 ? 35 : 42;
    const fillCells = targetGridSize - totalCells;
    
    for (let i = 1; i <= fillCells; i++) {
      const d = new Date(this.currentYear, this.currentMonth, i);
      allDates.push({ date: d, isCurrentMonth: false, isToday: false });
    }
    
    // Get all filtered multi-day events
    const multiDayEvents = this._getFilteredMultiDayEvents();
    
    // Process each week
    const totalWeeks = allDates.length / 7;
    for (let w = 0; w < totalWeeks; w++) {
      const weekDates = allDates.slice(w * 7, w * 7 + 7);
      const weekStartStr = this._formatDateString(weekDates[0].date);
      const weekEndStr = this._formatDateString(weekDates[6].date);
      
      // Find multi-day events that overlap this week
      const weekMultiDay = multiDayEvents.filter(e => {
        return e.startDate <= weekEndStr && e.endDate >= weekStartStr;
      });
      
      // Assign vertical slots
      const slotAssignments = this._assignSlots(weekMultiDay, weekStartStr, weekEndStr, weekDates);
      const maxSlots = slotAssignments.length > 0 ? Math.max(...slotAssignments.map(a => a.slot)) + 1 : 0;
      
      // Create week container
      const weekRow = document.createElement('div');
      weekRow.className = 'week-row';
      
      // Multi-day event layer
      if (maxSlots > 0) {
        const multiLayer = document.createElement('div');
        multiLayer.className = 'multiday-layer';
        multiLayer.style.gridTemplateRows = `repeat(${maxSlots}, 20px)`;
        
        slotAssignments.forEach(assignment => {
          const bar = this._renderMultiDayBar(assignment, weekDates);
          multiLayer.appendChild(bar);
        });
        
        weekRow.appendChild(multiLayer);
      }
      
      // Day cells row
      const daysRow = document.createElement('div');
      daysRow.className = 'days-row';
      
      weekDates.forEach(dateInfo => {
        const dateStr = this._formatDateString(dateInfo.date);
        const singleDayEvents = this._getSingleDayEventsForDate(dateStr);
        this._appendDateCell(daysRow, dateInfo.date, dateInfo.isCurrentMonth, dateInfo.isToday, singleDayEvents);
      });
      
      weekRow.appendChild(daysRow);
      grid.appendChild(weekRow);
    }
  },
  
  _getFilteredMultiDayEvents() {
    return this.events.filter(e => {
      if (!e.isMultiDay || !e.endDate) return false;
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
  
  _assignSlots(events, weekStartStr, weekEndStr, weekDates) {
    if (events.length === 0) return [];
    
    const sorted = [...events].sort((a, b) => {
      if (a.startDate !== b.startDate) return a.startDate < b.startDate ? -1 : 1;
      const aDur = this._daysBetween(a.startDate, a.endDate);
      const bDur = this._daysBetween(b.startDate, b.endDate);
      return bDur - aDur;
    });
    
    const slotOccupancy = [];
    const assignments = [];
    
    sorted.forEach(event => {
      const clampedStart = event.startDate < weekStartStr ? weekStartStr : event.startDate;
      const clampedEnd = event.endDate > weekEndStr ? weekEndStr : event.endDate;
      
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
        isEndClamped: event.endDate > weekEndStr
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
  
  _renderMultiDayBar(assignment, weekDates) {
    const { event, slot, startCol, endCol, isStartClamped, isEndClamped } = assignment;
    const span = endCol - startCol + 1;
    
    const bar = document.createElement('div');
    bar.className = 'multiday-bar';
    
    const colors = Categories.getColor(event.category);
    bar.style.backgroundColor = colors.bg;
    bar.style.color = colors.text;
    
    bar.style.gridColumn = `${startCol + 1} / span ${span}`;
    bar.style.gridRow = `${slot + 1}`;
    
    const r = '4px';
    const f = '0px';
    bar.style.borderRadius = `${isStartClamped ? f : r} ${isEndClamped ? f : r} ${isEndClamped ? f : r} ${isStartClamped ? f : r}`;
    
    let displaySubject = event.subject;
    if (this.searchTerm) {
      const regex = new RegExp(`(${this.searchTerm})`, 'gi');
      displaySubject = displaySubject.replace(regex, '<span class="search-highlight">$1</span>');
    }
    
    bar.innerHTML = `<span class="event-subject">${displaySubject}</span>`;
    
    bar.addEventListener('click', () => {
      Modal.openEvent(event);
    });
    
    return bar;
  },
  
  _appendDateCell(container, dateObj, isCurrentMonth, isToday, events) {
    const cell = document.createElement('div');
    cell.className = 'date-cell';
    
    if (!isCurrentMonth) cell.classList.add('other-month');
    
    const dayOfWeek = dateObj.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) cell.classList.add('weekend');
    
    const dateHeader = document.createElement('div');
    dateHeader.className = 'date-header';
    
    const dateNumber = document.createElement('span');
    dateNumber.className = 'date-number';
    if (isToday) dateNumber.classList.add('today');
    dateNumber.textContent = dateObj.getDate();
    
    dateHeader.appendChild(dateNumber);
    cell.appendChild(dateHeader);
    
    const eventsContainer = document.createElement('div');
    eventsContainer.className = 'events-container';
    
    events.forEach(evt => {
      eventsContainer.appendChild(this._renderEventCard(evt));
    });
    
    cell.appendChild(eventsContainer);
    container.appendChild(cell);
  },
  
  _renderEventCard(event) {
    const card = document.createElement('div');
    card.className = 'event-card';
    
    const colors = Categories.getColor(event.category);
    card.style.backgroundColor = colors.bg;
    card.style.color = colors.text;
    
    let displaySubject = event.subject;
    if (this.searchTerm) {
      const regex = new RegExp(`(${this.searchTerm})`, 'gi');
      displaySubject = displaySubject.replace(regex, '<span class="search-highlight">$1</span>');
    }
    
    let timeText = '';
    if (!event.isAllDay && event.startTime) {
      timeText = `<span class="event-time">${event.startTime}</span> `;
    }
    
    card.innerHTML = `${timeText}<span class="event-subject">${displaySubject}</span>`;
    
    card.addEventListener('click', () => {
      Modal.openEvent(event);
    });
    
    return card;
  },
  
  _getSingleDayEventsForDate(dateStr) {
    return this.events.filter(e => {
      if (!Categories.isActive(e.category)) return false;
      
      if (this.searchTerm) {
        const term = this.searchTerm.toLowerCase();
        const matchesSubject = e.subject.toLowerCase().includes(term);
        const matchesDesc = (e.description || '').toLowerCase().includes(term);
        if (!matchesSubject && !matchesDesc) return false;
      }
      
      // Only single-day events (multi-day rendered as bars above)
      if (e.isMultiDay && e.endDate) return false;
      
      return dateStr === e.startDate;
    });
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
