const App = {
  init() {
    // 1. Load theme
    const theme = Storage.getTheme();
    document.documentElement.setAttribute('data-theme', theme);
    this._updateThemeIcon(theme);
    
    // 2. DOM Elements
    this.loadingView = document.getElementById('loadingView');
    this.calendarView = document.getElementById('calendarView');
    this.loadingText = document.getElementById('loadingText');
    
    // Bind listeners
    this.bindEvents();
    
    // Initial state
    this.renderFilterPills();
    
    // 3. Parse URL for ?month=YYYY-MM
    const urlParams = new URLSearchParams(window.location.search);
    const monthParam = urlParams.get('month');
    
    // Notion 등 iframe 임베드 모드 (header 컴팩트 뷰 적용)
    if (urlParams.get('embed') === 'true') {
      document.body.classList.add('is-embed');
    }
    
    // 4. Fetch Data
    this.loadData(monthParam);
  },
  
  bindEvents() {
    // Header actions
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    if(themeToggleBtn) themeToggleBtn.addEventListener('click', () => this.toggleDarkMode());
    
    // Search toggle
    const searchToggle = document.getElementById('searchToggle');
    if(searchToggle) searchToggle.addEventListener('click', () => this.toggleSearch());
    
    const searchInput = document.getElementById('searchInput');
    if(searchInput) {
      searchInput.addEventListener('input', (e) => {
        Calendar.searchTerm = e.target.value;
        Calendar.render();
      });
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          searchInput.value = '';
          Calendar.searchTerm = '';
          Calendar.render();
          this.toggleSearch();
        }
      });
    }
    
    // Filter toggle
    const filterToggle = document.getElementById('filterToggle');
    if(filterToggle) filterToggle.addEventListener('click', () => this.toggleFilter());
    
    // Modal controls
    document.getElementById('modalClose').addEventListener('click', () => Modal.closeMain());
    document.getElementById('dayModalClose').addEventListener('click', () => Modal.closeDay());
    document.getElementById('modalOverlay').addEventListener('click', (e) => {
      if (e.target === document.getElementById('modalOverlay')) Modal.closeMain();
    });
    document.getElementById('dayModalOverlay').addEventListener('click', (e) => {
      if (e.target === document.getElementById('dayModalOverlay')) Modal.closeDay();
    });
    
    document.getElementById('saveMemoBtn').addEventListener('click', () => Modal.saveMemo());
    
    // Month navigation buttons
    const prevMonthBtn = document.getElementById('prevMonthBtn');
    if (prevMonthBtn) {
      prevMonthBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.navigateMonth(-1);
      });
    }
    const nextMonthBtn = document.getElementById('nextMonthBtn');
    if (nextMonthBtn) {
      nextMonthBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.navigateMonth(1);
      });
    }
    
    // Browser history back/forward navigation
    window.addEventListener('popstate', () => {
      const urlParams = new URLSearchParams(window.location.search);
      this.loadData(urlParams.get('month'));
    });
    
    // Keyboard
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!document.getElementById('modalOverlay').classList.contains('hidden')) {
          Modal.closeMain();
        } else if (!document.getElementById('dayModalOverlay').classList.contains('hidden')) {
          Modal.closeDay();
        }
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        // Only navigate if user is not typing in an input and no modal is open
        const isInputFocused = document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName);
        const isModalOpen = !document.getElementById('modalOverlay').classList.contains('hidden') ||
                            !document.getElementById('dayModalOverlay').classList.contains('hidden');
        if (!isInputFocused && !isModalOpen) {
          this.navigateMonth(e.key === 'ArrowLeft' ? -1 : 1);
        }
      }
    });
  },
  
  navigateMonth(delta) {
    let year = Calendar.currentYear || new Date().getFullYear();
    let month = (Calendar.currentMonth || (new Date().getMonth() + 1)) + delta;
    
    if (month < 1) {
      month = 12;
      year -= 1;
    } else if (month > 12) {
      month = 1;
      year += 1;
    }
    
    const targetMonthStr = `${year}-${String(month).padStart(2, '0')}`;
    
    // 노션 및 iframe 임베드 호환:
    // iframe sandbox 환경에서는 window.history.pushState가 SecurityError / DOMException을 일으킬 수 있으므로 try-catch로 보호합니다.
    try {
      if (window.history && window.history.pushState) {
        const url = new URL(window.location.href);
        url.searchParams.set('month', targetMonthStr);
        window.history.pushState({}, '', url.toString());
      }
    } catch (e) {
      console.warn('history.pushState blocked in embedded iframe:', e);
    }
    
    this.loadData(targetMonthStr);
  },
  
  async loadData(monthParam) {
    this.showLoading();
    
    let year = new Date().getFullYear();
    let month = new Date().getMonth() + 1;
    
    if (monthParam) {
      const parts = monthParam.split('-');
      if (parts.length === 2) {
        year = parseInt(parts[0], 10);
        month = parseInt(parts[1], 10);
      }
    }
    
    if (!API.GAS_URL) {
      this.loadingText.textContent = "URL이 설정되지 않았습니다.";
      this.showToast('api.js 파일에 구글 스크립트 URL을 입력해주세요.', 'error');
      return;
    }
    
    try {
      // 헤더의 월 표시도 즉시 업데이트 (이전 달이 보이지 않도록)
      const monthLabel = document.getElementById('currentMonthLabel');
      if (monthLabel) monthLabel.textContent = `${year}년 ${month}월`;
      
      this.loadingText.textContent = `${year}년 ${month}월 동기화 중...`;
      const data = await API.fetchMonth(year, month, (liveData) => {
        Calendar.init(liveData.year, liveData.month, liveData.events);
      });
      
      Calendar.init(data.year, data.month, data.events);
      this.showCalendar();
      this.showToast('구글 캘린더 연동 완료!', 'success');
    } catch (err) {
      if (err && (err.code === 'NEED_KEY' || err.code === 'INVALID_KEY')) {
        if (err.code === 'INVALID_KEY') API.clearKey();
        this.showKeyPrompt(monthParam, err.code === 'INVALID_KEY');
        return;
      }
      console.error(err);
      this.loadingText.textContent = "연동 실패";
      this.showToast('데이터를 불러오지 못했습니다.', 'error');
    }
  },
  
  showKeyPrompt(monthParam, isRetry = false) {
    this.loadingView.style.display = 'flex';
    this.calendarView.style.display = 'none';
    const content = this.loadingView.querySelector('.upload-content');
    if (!content) return;
    content.innerHTML = `
      <div class="upload-icon">🔒</div>
      <h2 id="loadingText">${isRetry ? '비밀번호가 일치하지 않습니다' : '비공개 캘린더 잠금 해제'}</h2>
      <p style="margin-bottom: 12px;">최초 1회 비밀번호를 입력하면 이 기기에서 자동으로 유지됩니다.</p>
      <div style="display:flex; gap:8px; justify-content:center; margin-top:8px;">
        <input type="password" id="secretKeyInput" placeholder="비밀번호 입력..." style="padding:8px 12px; border:1px solid #d1d5db; border-radius:6px; font-size:14px; outline:none;" />
        <button id="secretKeySubmit" style="padding:8px 16px; background:#2383e2; color:#fff; border:none; border-radius:6px; font-size:14px; cursor:pointer; font-weight:600;">확인</button>
      </div>
    `;
    const input = document.getElementById('secretKeyInput');
    const btn = document.getElementById('secretKeySubmit');
    const submit = () => {
      const val = input.value.trim();
      if (!val) return;
      API.saveKey(val);
      content.innerHTML = `
        <div class="upload-icon" style="animation: spin 2s linear infinite;">⏳</div>
        <h2 id="loadingText">캘린더 동기화 중...</h2>
        <p>구글 캘린더에서 최신 일정을 실시간으로 불러오고 있습니다.</p>
      `;
      this.loadingText = document.getElementById('loadingText');
      this.loadData(monthParam);
    };
    btn.addEventListener('click', submit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
    });
    setTimeout(() => input.focus(), 50);
  },
  
  showLoading() {
    this.loadingView.style.display = 'flex';
    this.calendarView.style.display = 'none';
  },
  
  showCalendar() {
    this.loadingView.style.display = 'none';
    this.calendarView.style.display = 'block';
  },
  
  toggleDarkMode() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    Storage.saveTheme(next);
    this._updateThemeIcon(next);
    Calendar.render();
  },
  
  _updateThemeIcon(theme) {
    const btn = document.getElementById('themeToggleBtn');
    if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
  },
  
  toggleSearch() {
    const container = document.getElementById('searchContainer');
    container.classList.toggle('active');
    if (container.classList.contains('active')) {
      document.getElementById('searchInput').focus();
    } else {
      document.getElementById('searchInput').value = '';
      Calendar.searchTerm = '';
      Calendar.render();
    }
  },
  
  toggleFilter() {
    const bar = document.getElementById('filterBar');
    bar.classList.toggle('hidden');
  },
  
  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    
    const container = document.getElementById('toastContainer');
    container.appendChild(toast);
    
    requestAnimationFrame(() => toast.classList.add('show'));
    
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  },
  
  renderFilterPills() {
    const container = document.getElementById('filterContainer');
    if (!container) return;
    container.innerHTML = '';
    
    const cats = Categories.getAll();
    cats.forEach(cat => {
      const pill = document.createElement('button');
      pill.className = 'filter-pill';
      if (Categories.isActive(cat)) pill.classList.add('active');
      
      const colors = Categories.getColor(cat);
      pill.textContent = Categories.definitions[cat].label;
      pill.style.borderColor = colors.bg;
      
      if (Categories.isActive(cat)) {
        pill.style.backgroundColor = colors.bg;
        pill.style.color = colors.text;
      }
      
      pill.addEventListener('click', () => {
        Categories.toggle(cat);
        const active = Categories.isActive(cat);
        pill.classList.toggle('active', active);
        if (active) {
          pill.style.backgroundColor = colors.bg;
          pill.style.color = colors.text;
        } else {
          pill.style.backgroundColor = '';
          pill.style.color = '';
        }
        Calendar.render();
      });
      
      container.appendChild(pill);
    });
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
