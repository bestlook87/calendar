const API = {
  GAS_URL: 'https://script.google.com/macros/s/AKfycbyncY1TNDmMz4md2OrYT27qF6PeDnX5Mi5cMF6fRxy3kEoOEec7Ny6-FBFkMr9vGMWzUA/exec',
  API_KEY: 'assmh0808',  // 하드코딩된 API 키 (URL 파라미터 없어도 무조건 작동)
  MAX_RETRIES: 3,
  
  async fetchMonth(year, month) {
    if (!this.GAS_URL) {
      throw new Error('Google Apps Script URL이 설정되지 않았습니다.');
    }
    
    const monthStr = `${year}-${String(month).padStart(2, '0')}`;
    
    // URL 파라미터에서 key를 먼저 찾고, 없으면 하드코딩된 키 사용
    const urlParams = new URLSearchParams(window.location.search);
    const key = urlParams.get('key') || this.API_KEY;
    
    const url = `${this.GAS_URL}?month=${monthStr}&key=${key}`;
    
    // 재시도 로직 (네트워크 일시 장애 대비)
    let lastError = null;
    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(url, {
          method: 'GET',
          mode: 'cors'
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: 데이터를 불러오는데 실패했습니다.`);
        }
        
        const text = await response.text();
        
        // GAS 권한 만료 시 JSON이 아닌 텍스트가 올 수 있음
        try {
          const data = JSON.parse(text);
          return data;
        } catch (parseErr) {
          throw new Error(`GAS 응답 파싱 실패 (권한 만료 가능성): ${text.substring(0, 100)}`);
        }
      } catch (error) {
        lastError = error;
        console.warn(`[API] 시도 ${attempt}/${this.MAX_RETRIES} 실패:`, error.message);
        if (attempt < this.MAX_RETRIES) {
          // 재시도 전 대기 (1초, 2초, 4초...)
          await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
        }
      }
    }
    
    console.error('[API] 모든 재시도 실패:', lastError);
    throw lastError;
  }
};
