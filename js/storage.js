const Storage = {
  KEYS: { 
    MONTHS: 'csv-cal-months', 
    MEMOS: 'csv-cal-memos', 
    THEME: 'csv-cal-theme' 
  },
  
  saveMonth(year, month, events) {
    const key = `${this.KEYS.MONTHS}-${year}-${month}`;
    const allMonths = this.getAllMonths();
    const existingIndex = allMonths.findIndex(m => m.year === year && m.month === month);
    
    if (existingIndex === -1) {
      allMonths.push({ year, month, label: `${year}년 ${month}월`, eventCount: events.length });
    } else {
      allMonths[existingIndex].eventCount = events.length;
    }
    
    // Sort by most recent
    allMonths.sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.month - a.month;
    });
    
    localStorage.setItem(this.KEYS.MONTHS, JSON.stringify(allMonths));
    localStorage.setItem(key, JSON.stringify(events));
  },
  
  getMonth(year, month) {
    const key = `${this.KEYS.MONTHS}-${year}-${month}`;
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : [];
  },
  
  getAllMonths() {
    const data = localStorage.getItem(this.KEYS.MONTHS);
    return data ? JSON.parse(data) : [];
  },
  
  deleteMonth(year, month) {
    const key = `${this.KEYS.MONTHS}-${year}-${month}`;
    localStorage.removeItem(key);
    
    let allMonths = this.getAllMonths();
    allMonths = allMonths.filter(m => m.year !== year || m.month !== month);
    localStorage.setItem(this.KEYS.MONTHS, JSON.stringify(allMonths));
  },
  
  saveMemo(eventId, memoText) {
    const memos = this.getAllMemos();
    if (memoText.trim() === '') {
      delete memos[eventId];
    } else {
      memos[eventId] = memoText;
    }
    localStorage.setItem(this.KEYS.MEMOS, JSON.stringify(memos));
  },
  
  getMemo(eventId) {
    const memos = this.getAllMemos();
    return memos[eventId] || '';
  },
  
  getAllMemos() {
    const data = localStorage.getItem(this.KEYS.MEMOS);
    return data ? JSON.parse(data) : {};
  },
  
  saveTheme(theme) {
    localStorage.setItem(this.KEYS.THEME, theme);
  },
  
  getTheme() {
    return localStorage.getItem(this.KEYS.THEME) || 'light';
  }
};
