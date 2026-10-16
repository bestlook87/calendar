const Categories = {
  definitions: {
    '운동': { bg: '#d3e5ef', bgDark: '#28456a', text: '#2383e2', label: '운동' },
    'Work': { bg: '#e3e2e0', bgDark: '#454442', text: '#555555', label: 'Work' },
    'LOVE': { bg: '#f5e0e9', bgDark: '#6a2847', text: '#c4508f', label: 'LOVE' },
    'Investment': { bg: '#fadec9', bgDark: '#6a4528', text: '#d47219', label: 'Investment' },
    'Life': { bg: '#e8deee', bgDark: '#4a2868', text: '#8b5fc7', label: 'Life' },
    '일정': { bg: '#dcfce7', bgDark: '#14532d', text: '#15803d', label: '일정' },
    '목표': { bg: '#fef3c7', bgDark: '#6a5a28', text: '#b59418', label: '목표' }
  },
  
  activeFilters: new Set(['운동', 'Work', 'LOVE', 'Investment', 'Life', '일정', '목표']),
  
  getColor(category) {
    const def = this.definitions[category] || this.getDefault();
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    return {
      bg: isDark ? def.bgDark : def.bg,
      text: isDark ? '#ffffff' : def.text,
      label: def.label
    };
  },
  
  isActive(category) {
    // If the category is strictly not in definitions, we can optionally always show it,
    // but typically we only filter known ones. Here we filter if it's in definitions.
    if (!this.definitions[category]) return true;
    return this.activeFilters.has(category);
  },
  
  toggle(category) {
    if (this.activeFilters.has(category)) {
      this.activeFilters.delete(category);
    } else {
      this.activeFilters.add(category);
    }
  },
  
  getAll() {
    return Object.keys(this.definitions);
  },
  
  getDefault() {
    return { bg: '#f3f4f6', bgDark: '#374151', text: '#6b7280', label: '기타' };
  }
};
