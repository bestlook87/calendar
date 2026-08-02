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
    
    // Notion 임베드용 깔끔한 뷰 (header 숨김)
    if (urlParams.get('embed') === 'true') {
      const header = document.querySelector('.header');
      if (header) header.style.display = 'none';
      
      // 임베드 뷰일 경우 body의 마진/패딩 최소화
      document.body.style.padding = '0';
      const main = document.querySelector('main');
      if (main) main.style.padding = '0';
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
    
    // Keyboard
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!document.getElementById('modalOverlay').classList.contains('hidden')) {
          Modal.closeMain();
        } else if (!document.getElementById('dayModalOverlay').classList.contains('hidden')) {
          Modal.closeDay();
        }
      }
    });
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
      this.loadingText.textContent = `${year}년 ${month}월 동기화 중...`;
      const data = await API.fetchMonth(year, month);
      
      Calendar.init(data.year, data.month, data.events);
      this.showCalendar();
      this.showToast('구글 캘린더 연동 완료!', 'success');
    } catch (err) {
      console.error(err);
      this.loadingText.textContent = "연동 실패";
      this.showToast('데이터를 불러오지 못했습니다.', 'error');
    }
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
