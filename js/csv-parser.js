const CSVParser = {
  parse(file) {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          try {
            const events = [];
            for (const row of results.data) {
              if (!row.Subject || !row.Date) continue;
              
              const dateInfo = this.parseDate(row.Date);
              let cleanedDesc = this.cleanDescription(row.Description || '');
              let category = (row.Category || '').trim();
              
              // Extract category using bulletproof includes() method for the first 30 characters
              const knownCategories = ['운동', 'Work', 'LOVE', 'Investment', 'Life', '일정', '목표'];
              for (const cat of knownCategories) {
                const prefix = cleanedDesc.substring(0, 30);
                if (prefix.includes(cat)) {
                  category = cat;
                  cleanedDesc = cleanedDesc.replace(cat, '').trim();
                  if (cleanedDesc.startsWith('SMH')) {
                    cleanedDesc = cleanedDesc.substring(3).trim();
                  }
                  break;
                }
              }
              
              const event = {
                subject: row.Subject.trim(),
                description: cleanedDesc,
                location: (row.Location || '').trim(),
                category: category,
                ...dateInfo
              };
              
              event.id = this.generateId(event);
              events.push(event);
            }
            
            if (events.length === 0) {
              reject(new Error('유효한 일정을 찾을 수 없습니다.'));
              return;
            }
            
            events.sort((a, b) => a.startDate.localeCompare(b.startDate) || 
                                 (a.startTime || '').localeCompare(b.startTime || ''));
                                 
            const { year, month } = this.detectMonth(events);
            resolve({ year, month, events });
          } catch (err) {
            reject(err);
          }
        },
        error: (err) => {
          reject(err);
        }
      });
    });
  },
  
  parseDate(dateStr) {
    let isAllDay = false;
    let isMultiDay = false;
    let startDate = null;
    let endDate = null;
    let startTime = null;
    let endTime = null;
    
    const parts = dateStr.split(' → ');
    
    const parsePart = (str) => {
      const p = str.trim().split(' ');
      return {
        date: p[0],
        time: p[1] || null
      };
    };
    
    const startPart = parsePart(parts[0]);
    startDate = startPart.date;
    startTime = startPart.time;
    
    if (parts.length > 1) {
      const endPart = parsePart(parts[1]);
      endDate = endPart.date;
      endTime = endPart.time;
      
      if (startDate !== endDate) {
        isMultiDay = true;
      }
      if (!startTime && !endTime) {
        isAllDay = true;
      }
    } else {
      isAllDay = true;
      endDate = startDate;
    }
    
    return {
      startDate,
      endDate,
      startTime,
      endTime,
      isAllDay,
      isMultiDay
    };
  },
  
  cleanDescription(desc) {
    let cleaned = desc.trim();
    
    // Remove trailing junk pattern: "일정 목표 운동 중요 대한민국의 휴일" + trailing category text
    cleaned = cleaned.replace(/\s*일정\s+목표\s+운동\s+중요\s+대한민국의\s+휴일[\s\S]*$/, '');
    
    // Also strip generic trailing commas pattern
    cleaned = cleaned.replace(/\s*,\s*,\s*,\s*,\s*Investment\s*,\s*Life\s*,\s*LOVE\s*,\s*Work\s*,?\s*$/, '');
    
    return cleaned.trim();
  },
  
  detectMonth(events) {
    const counts = {};
    for (const e of events) {
      const ym = e.startDate.substring(0, 7);
      counts[ym] = (counts[ym] || 0) + 1;
    }
    
    let max = 0;
    let bestYM = null;
    for (const [ym, count] of Object.entries(counts)) {
      if (count > max) {
        max = count;
        bestYM = ym;
      }
    }
    
    if (bestYM) {
      const [year, month] = bestYM.split('-');
      return { year: parseInt(year, 10), month: parseInt(month, 10) };
    }
    
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  },
  
  generateId(event) {
    const rawId = `${event.startDate}-${event.subject}-${event.startTime || 'allday'}`;
    return encodeURIComponent(rawId).replace(/%/g, '');
  }
};
