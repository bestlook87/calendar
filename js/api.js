const API = {
  // 사용자가 발급받을 GAS Web App URL (임시로 빈 값, 이후 사용자가 붙여넣기)
  GAS_URL: 'https://script.google.com/macros/s/AKfycbytFLstMUGupfLc6cnJVBIZjGk2Wpuu3BV6Nh_abk-KwwdZQkETDx6WzEoJ3Y9tRB3STg/exec',
  
  async fetchMonth(year, month) {
    if (!this.GAS_URL) {
      throw new Error('Google Apps Script URL이 설정되지 않았습니다. api.js에 URL을 입력해주세요.');
    }
    
    // YYYY-MM 형식
    const monthStr = `${year}-${String(month).padStart(2, '0')}`;
    const url = `${this.GAS_URL}?month=${monthStr}&key=${key}`; // <--- 이 줄을 이렇게 수정!
    
    try {
      // GAS에서 CORS 우회를 허용하도록 fetch 설정 (리디렉션 지원)
      const response = await fetch(url, {
        method: 'GET',
        mode: 'cors'
      });
      
      if (!response.ok) {
        throw new Error('데이터를 불러오는데 실패했습니다.');
      }
      
      const data = await response.json();
      return data; // { year, month, events }
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  }
};
