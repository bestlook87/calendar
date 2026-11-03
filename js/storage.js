const Storage = {
  KEYS: { 
    MONTHS: 'csv-cal-months', 
    MEMOS: 'csv-cal-memos', 
    THEME: 'csv-cal-theme' 
  },
  _mem: {},

  _getItem(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return this._mem[key] || null;
    }
  },

  _setItem(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      this._mem[key] = value;
    }
  },

  _removeItem(key) {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      delete this._mem[key];
    }
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
    
    this._setItem(this.KEYS.MONTHS, JSON.stringify(allMonths));
    this._setItem(key, JSON.stringify(events));
  },
  
  getMonth(year, month) {
    const key = `${this.KEYS.MONTHS}-${year}-${month}`;
    const data = this._getItem(key);
    return data ? JSON.parse(data) : [];
  },
  
  getAllMonths() {
    const data = this._getItem(this.KEYS.MONTHS);
    return data ? JSON.parse(data) : [];
  },
  
  deleteMonth(year, month) {
    const key = `${this.KEYS.MONTHS}-${year}-${month}`;
    this._removeItem(key);
    
    let allMonths = this.getAllMonths();
    allMonths = allMonths.filter(m => m.year !== year || m.month !== month);
    this._setItem(this.KEYS.MONTHS, JSON.stringify(allMonths));
  },
  
  saveMemo(eventId, memoText) {
    const memos = this.getAllMemos();
    if (memoText.trim() === '') {
      delete memos[eventId];
    } else {
      memos[eventId] = memoText;
    }
    this._setItem(this.KEYS.MEMOS, JSON.stringify(memos));
  },
  
  getMemo(eventId) {
    const memos = this.getAllMemos();
    return memos[eventId] || '';
  },
  
  getAllMemos() {
    const data = this._getItem(this.KEYS.MEMOS);
    return data ? JSON.parse(data) : {};
  },
  
  saveTheme(theme) {
    this._setItem(this.KEYS.THEME, theme);
  },
  
  getTheme() {
    return this._getItem(this.KEYS.THEME) || 'light';
  }
};
