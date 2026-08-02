const Modal = {
  currentEvent: null,
  
  openEvent(event) {
    this.currentEvent = event;
    
    document.getElementById('modalTitle').textContent = event.subject;
    
    const catEl = document.getElementById('modalCategory');
    const colors = Categories.getColor(event.category);
    catEl.textContent = event.category || '기타';
    catEl.style.backgroundColor = colors.bg;
    catEl.style.color = colors.text;
    
    document.getElementById('modalDate').textContent = this._formatDate(event);
    
    const timeEl = document.getElementById('modalTime');
    const timeContainer = document.getElementById('modalTimeContainer');
    if (event.isAllDay || !event.startTime) {
      timeContainer.style.display = 'none';
    } else {
      timeContainer.style.display = 'flex';
      timeEl.textContent = this._formatTime(event);
    }
    
    const locEl = document.getElementById('modalLocation');
    const locContainer = document.getElementById('modalLocationContainer');
    if (!event.location) {
      locContainer.style.display = 'none';
    } else {
      locContainer.style.display = 'flex';
      locEl.textContent = event.location;
    }
    
    const descEl = document.getElementById('modalDescription');
    const descContainer = document.getElementById('modalDescriptionContainer');
    if (!event.description) {
      descContainer.style.display = 'none';
    } else {
      descContainer.style.display = 'block';
      descEl.innerHTML = event.description.replace(/\n/g, '<br>');
    }
    
    // Load memo
    const memo = Storage.getMemo(event.id);
    document.getElementById('modalMemo').value = memo;
    
    // Show modal
    const overlay = document.getElementById('modalOverlay');
    overlay.classList.remove('hidden');
  },
  
  closeMain() {
    this.currentEvent = null;
    document.getElementById('modalOverlay').classList.add('hidden');
  },
  
  closeDay() {
    document.getElementById('dayModalOverlay').classList.add('hidden');
  },
  
  saveMemo() {
    if (!this.currentEvent) return;
    const text = document.getElementById('modalMemo').value;
    Storage.saveMemo(this.currentEvent.id, text);
    App.showToast('메모가 저장되었습니다.', 'success');
  },
  
  openDayDetail(dateStr, events) {
    const parsedDate = new Date(dateStr + 'T00:00:00');
    const dayStr = ['일', '월', '화', '수', '목', '금', '토'][parsedDate.getDay()];
    
    document.getElementById('dayModalTitle').textContent = 
      `${parsedDate.getFullYear()}년 ${parsedDate.getMonth() + 1}월 ${parsedDate.getDate()}일 (${dayStr})`;
      
    const eventsList = document.getElementById('dayModalEvents');
    eventsList.innerHTML = '';
    
    events.forEach(evt => {
      const item = document.createElement('div');
      item.className = 'day-event-item';
      
      const colors = Categories.getColor(evt.category);
      
      const card = document.createElement('div');
      card.className = 'event-card';
      card.style.backgroundColor = colors.bg;
      card.style.color = colors.text;
      
      let timeStr = '종일';
      if (!evt.isAllDay && evt.startTime) {
        timeStr = evt.startTime;
      }
      
      card.innerHTML = `<span class="event-time">${timeStr}</span> <span class="event-subject">${evt.subject}</span>`;
      
      card.addEventListener('click', () => {
        this.openEvent(evt);
      });
      
      item.appendChild(card);
      eventsList.appendChild(item);
    });
    
    document.getElementById('dayModalOverlay').classList.remove('hidden');
  },
  
  _formatDate(event) {
    const parse = (dStr) => {
      const d = new Date(dStr + 'T00:00:00');
      const days = ['일', '월', '화', '수', '목', '금', '토'];
      return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
    };
    
    if (event.isMultiDay && event.endDate) {
      return `${parse(event.startDate)} ~ ${parse(event.endDate)}`;
    }
    return parse(event.startDate);
  },
  
  _formatTime(event) {
    const format = (tStr) => {
      if (!tStr) return '';
      const [hStr, mStr] = tStr.split(':');
      let h = parseInt(hStr, 10);
      const ampm = h < 12 ? '오전' : '오후';
      if (h === 0) h = 12;
      else if (h > 12) h -= 12;
      return `${ampm} ${h}:${mStr}`;
    };
    
    if (event.startTime && event.endTime) {
      return `${format(event.startTime)} ~ ${format(event.endTime)}`;
    }
    return format(event.startTime);
  }
};
