const API = {
  GAS_URL: 'https://script.google.com/macros/s/AKfycbw_mFpl1rQ8ryU4M6s9I56vntGiwf85zMlGwgf_-NZR57rcFHt3uEl59VZyqOQ7bM5ftQ/exec',
  STORAGE_KEY_NAME: 'calendar_secret_key',
  MAX_RETRIES: 2,

  getKey() {
    if (typeof window !== 'undefined' && window.location) {
      const urlParams = new URLSearchParams(window.location.search);
      const urlKey = urlParams.get('key');
      if (urlKey) {
        try {
          localStorage.setItem(this.STORAGE_KEY_NAME, urlKey);
        } catch (e) {}
        return urlKey;
      }
      try {
        const saved = localStorage.getItem(this.STORAGE_KEY_NAME);
        if (saved) return saved;
      } catch (e) {}
    }
    return '';
  },

  saveKey(keyStr) {
    try {
      localStorage.setItem(this.STORAGE_KEY_NAME, keyStr.trim());
    } catch (e) {}
  },

  clearKey() {
    try {
      localStorage.removeItem(this.STORAGE_KEY_NAME);
    } catch (e) {}
  },

  _decryptEvents(encBase64, keyStr, monthStr) {
    if (!keyStr) {
      const err = new Error('비밀번호 키가 필요합니다.');
      err.code = 'NEED_KEY';
      throw err;
    }

    const saltedKey = new TextEncoder().encode(`${keyStr}:${monthStr}`);
    const binStr = atob(encBase64);
    const data = new Uint8Array(binStr.length);
    for (let idx = 0; idx < binStr.length; idx++) {
      data[idx] = binStr.charCodeAt(idx);
    }

    const S = new Uint8Array(256);
    for (let idx = 0; idx < 256; idx++) S[idx] = idx;
    let j = 0;
    for (let idx = 0; idx < 256; idx++) {
      j = (j + S[idx] + saltedKey[idx % saltedKey.length]) & 0xff;
      const tmp = S[idx];
      S[idx] = S[j];
      S[j] = tmp;
    }

    let i = 0;
    j = 0;
    for (let step = 0; step < 1024; step++) {
      i = (i + 1) & 0xff;
      j = (j + S[i]) & 0xff;
      const tmp = S[i];
      S[i] = S[j];
      S[j] = tmp;
    }

    const out = new Uint8Array(data.length);
    for (let k = 0; k < data.length; k++) {
      i = (i + 1) & 0xff;
      j = (j + S[i]) & 0xff;
      const tmp = S[i];
      S[i] = S[j];
      S[j] = tmp;
      out[k] = data[k] ^ S[(S[i] + S[j]) & 0xff];
    }

    try {
      const jsonText = new TextDecoder('utf-8', { fatal: true }).decode(out);
      const parsed = JSON.parse(jsonText);
      if (!Array.isArray(parsed)) throw new Error('Invalid structure');
      return parsed;
    } catch (e) {
      const err = new Error('비밀번호가 올바르지 않습니다.');
      err.code = 'INVALID_KEY';
      throw err;
    }
  },

  async fetchMonth(year, month, onBackgroundUpdate = null) {
    const monthStr = `${year}-${String(month).padStart(2, '0')}`;
    const staticUrl = `data/${monthStr}.json?t=${Date.now()}`;
    const key = this.getKey();

    if (!key) {
      const err = new Error('비밀번호 키가 필요합니다.');
      err.code = 'NEED_KEY';
      throw err;
    }

    let staticData = null;
    try {
      const staticRes = await fetch(staticUrl, { cache: 'no-store' });
      if (staticRes.ok) {
        const rawJson = await staticRes.json();
        if (rawJson && typeof rawJson.enc === 'string') {
          rawJson.events = this._decryptEvents(rawJson.enc, key, monthStr);
        }
        staticData = rawJson;
      }
    } catch (err) {
      if (err.code === 'NEED_KEY' || err.code === 'INVALID_KEY') {
        throw err;
      }
      console.warn('[API] 암호화 정적 데이터 로드 실패, GAS 폴백 시도:', err);
    }

    if (staticData && Array.isArray(staticData.events)) {
      if (this.GAS_URL && typeof onBackgroundUpdate === 'function') {
        this._fetchFromGas(monthStr, key)
          .then((liveData) => {
            if (
              liveData &&
              Array.isArray(liveData.events) &&
              JSON.stringify(liveData.events) !== JSON.stringify(staticData.events)
            ) {
              onBackgroundUpdate(liveData);
            }
          })
          .catch(() => {});
      }
      return staticData;
    }

    try {
      return await this._fetchFromGas(monthStr, key);
    } catch (err) {
      return { year, month, events: [] };
    }
  },

  async _fetchFromGas(monthStr, key) {
    const url = `${this.GAS_URL}?month=${monthStr}&key=${encodeURIComponent(key)}`;

    let lastError = null;
    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(url, { method: 'GET', mode: 'cors' });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: 데이터를 불러오는데 실패했습니다.`);
        }
        const text = await response.text();
        return JSON.parse(text);
      } catch (error) {
        lastError = error;
        if (attempt < this.MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, 1000 * attempt));
        }
      }
    }
    throw lastError;
  }
};
