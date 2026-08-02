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
    
    // Clear previous cells (keep headers if they exist, but easier to recreate)
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
    // Calculate first day (0=Sun, 1=Mon...6=Sat)
    // We want Mon=0, Tue=1...Sun=6
    const firstDate = new Date(this.currentYear, this.currentMonth - 1, 1);
    let startDay = firstDate.getDay() - 1;
    if (startDay < 0) startDay = 6; // Sunday becomes 6
    
    const daysInMonth = new Date(this.currentYear, this.currentMonth, 0).getDate();
    const daysInPrevMonth = new Date(this.currentYear, this.currentMonth - 1, 0).getDate();
    
    const today = new Date();
    const isThisMonth = (today.getFullYear() === this.currentYear && today.getMonth() === this.currentMonth - 1);
    const todayDate = today.getDate();
    
    // Add trailing days from prev month
    for (let i = startDay - 1; i >= 0; i--) {
      const dateNum = daysInPrevMonth - i;
      const d = new Date(this.currentYear, this.currentMonth - 2, dateNum);
      this._appendDateCell(grid, d, false, false, this._getEventsForDate(this._formatDateString(d)));
    }
    
    // Add days of current month
    for (let i = 1; i <= daysInMonth; i++) {
      const isToday = isThisMonth && i === todayDate;
      const d = new Date(this.currentYear, this.currentMonth - 1, i);
      this._appendDateCell(grid, d, true, isToday, this._getEventsForDate(this._formatDateString(d)));
    }
    
    // Add leading days of next month to fill grid (total 42 cells typically, or calculate remainder)
    const totalCells = startDay + daysInMonth;
    const remainingCells = (7 - (totalCells % 7)) % 7;
    const targetGridSize = totalCells + remainingCells <= 35 ? 35 : 42;
    const fillCells = targetGridSize - totalCells;
    
    for (let i = 1; i <= fillCells; i++) {
      const d = new Date(this.currentYear, this.currentMonth, i);
      this._appendDateCell(grid, d, false, false, this._getEventsForDate(this._formatDateString(d)));
    }
  },
  
  _appendDateCell(grid, dateObj, isCurrentMonth, isToday, events) {
    const cell = document.createElement('div');
    cell.className = 'date-cell';
    
    if (!isCurrentMonth) cell.classList.add('other-month');
    
    const dayOfWeek = dateObj.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) cell.classList.add('weekend');
    
    // Date header
    const dateHeader = document.createElement('div');
    dateHeader.className = 'date-header';
    
    const dateNumber = document.createElement('span');
    dateNumber.className = 'date-number';
    if (isToday) dateNumber.classList.add('today');
    dateNumber.textContent = dateObj.getDate();
    
    dateHeader.appendChild(dateNumber);
    cell.appendChild(dateHeader);
    
    // Events container
    const eventsContainer = document.createElement('div');
    eventsContainer.className = 'events-container';
    
    events.forEach(evt => {
      eventsContainer.appendChild(this._renderEventCard(evt));
    });
    
    cell.appendChild(eventsContainer);
    grid.appendChild(cell);
  },
  
  _renderEventCard(event) {
    const card = document.createElement('div');
    card.className = 'event-card';
    
    const colors = Categories.getColor(event.category);
    card.style.backgroundColor = colors.bg;
    card.style.color = colors.text;
    
    // Subject with optional highlight for search
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
  
  _getEventsForDate(dateStr) {
    return this.events.filter(e => {
      // Check active filters
      if (!Categories.isActive(e.category)) return false;
      
      // Check search term
      if (this.searchTerm) {
        const term = this.searchTerm.toLowerCase();
        const matchesSubject = e.subject.toLowerCase().includes(term);
        const matchesDesc = (e.description || '').toLowerCase().includes(term);
        if (!matchesSubject && !matchesDesc) return false;
      }
      
      // Check date bounds
      if (e.isMultiDay && e.endDate) {
        return dateStr >= e.startDate && dateStr <= e.endDate;
      } else {
        return dateStr === e.startDate;
      }
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
