/**
 * 问卷自动填写助手 - 设置页逻辑
 */
(function () {
  'use strict';

  const DEFAULT_PROFILES = [
    {
      name: '默认',
      name_field: '张三',
      gender: '男',
      age: '25',
      phone: '13800138000',
      email: 'zhangsan@example.com',
      idCard: '110101199001011234',
      address: '北京市朝阳区某某街道123号',
      school: '北京大学',
      company: '某科技有限公司',
      occupation: '软件工程师',
      city: '北京',
      birthday: '1990-01-01',
      suggestions: '无',
      income: '10000',
      marital: '未婚',
      ethnicity: '汉族',
      political: '群众',
      department: '研发部',
      staffId: '10001',
      emergencyContact: '张三',
    },
  ];

  const DEFAULT_SETTINGS = { mode: 'profile', fillDelay: 50 };

  let profiles = [];
  let activeProfileIndex = 0;
  let hasUnsavedChanges = false;

  const $ = (id) => document.getElementById(id);

  const FIELDS = [
    'f-profile-name', 'f-name', 'f-gender', 'f-age', 'f-birthday', 'f-city',
    'f-phone', 'f-email', 'f-idCard', 'f-address',
    'f-school', 'f-company', 'f-occupation', 'f-department', 'f-staffId', 'f-income',
    'f-marital', 'f-ethnicity', 'f-political', 'f-emergencyContact',
    'f-suggestions',
  ];

  const FIELD_KEYS = {
    'f-profile-name': 'name',
    'f-name': 'name_field',
    'f-gender': 'gender',
    'f-age': 'age',
    'f-birthday': 'birthday',
    'f-city': 'city',
    'f-phone': 'phone',
    'f-email': 'email',
    'f-idCard': 'idCard',
    'f-address': 'address',
    'f-school': 'school',
    'f-company': 'company',
    'f-occupation': 'occupation',
    'f-department': 'department',
    'f-staffId': 'staffId',
    'f-income': 'income',
    'f-marital': 'marital',
    'f-ethnicity': 'ethnicity',
    'f-political': 'political',
    'f-emergencyContact': 'emergencyContact',
    'f-suggestions': 'suggestions',
  };

  init();

  async function init() {
    await loadData();
    renderProfileSelector();
    selectProfile(0);
    bindEvents();
  }

  async function loadData() {
    const data = await chrome.storage.local.get(['profiles', 'settings', 'activeProfile']);
    profiles = data.profiles || DEFAULT_PROFILES;
    if (profiles.length === 0) profiles = [...DEFAULT_PROFILES];
    const settings = data.settings || DEFAULT_SETTINGS;
    const activeName = data.activeProfile;
    if (activeName) {
      const idx = profiles.findIndex((p) => p.name === activeName);
      activeProfileIndex = idx >= 0 ? idx : 0;
    }
  }

  function renderProfileSelector() {
    const selector = $('profile-selector');
    if (!selector) return;
    selector.innerHTML = profiles
      .map((p, i) => `<option value="${i}" ${i === activeProfileIndex ? 'selected' : ''}>${escapeHtml(p.name || '未命名')}</option>`)
      .join('');
  }

  function selectProfile(index) {
    if (index < 0 || index >= profiles.length) return;
    activeProfileIndex = index;
    const profile = profiles[index];
    FIELDS.forEach((fieldId) => {
      const key = FIELD_KEYS[fieldId];
      const el = $(fieldId);
      if (el) el.value = profile[key] || '';
    });
    renderProfileSelector();
    const btnDelete = $('btn-delete-profile');
    if (btnDelete) btnDelete.style.display = profiles.length > 1 ? 'block' : 'none';
    hasUnsavedChanges = false;
  }

  function bindEvents() {
    FIELDS.forEach((fieldId) => {
      const el = $(fieldId);
      if (el) el.addEventListener('input', () => { hasUnsavedChanges = true; });
    });
    const selector = $('profile-selector');
    if (selector) selector.addEventListener('change', () => selectProfile(parseInt(selector.value)));
    const form = $('profile-form');
    if (form) form.addEventListener('submit', saveProfile);
    const btnNew = $('btn-new-profile');
    if (btnNew) btnNew.addEventListener('click', addProfile);
    const btnDelete = $('btn-delete-profile');
    if (btnDelete) btnDelete.addEventListener('click', deleteProfile);
    const btnReset = $('btn-reset');
    if (btnReset) btnReset.addEventListener('click', resetToDefault);
  }

  async function saveProfile(e) {
    if (e) e.preventDefault();
    const profile = { ...profiles[activeProfileIndex] };
    FIELDS.forEach((fieldId) => {
      const key = FIELD_KEYS[fieldId];
      const el = $(fieldId);
      if (el) profile[key] = el.value.trim();
    });
    if (!profile.name) { showToast('请填写资料名称', 'error'); return; }
    profiles[activeProfileIndex] = profile;
    await chrome.storage.local.set({ profiles: profiles, activeProfile: profile.name });
    hasUnsavedChanges = false;
    renderProfileSelector();
    showToast('保存成功！');
  }

  async function addProfile() {
    const newProfile = {
      name: `资料${profiles.length + 1}`, name_field: '', gender: '男', age: '',
      phone: '', email: '', idCard: '', address: '', school: '', company: '',
      occupation: '', city: '', birthday: '', suggestions: '', income: '',
      marital: '未婚', ethnicity: '', political: '群众', department: '',
      staffId: '', emergencyContact: '',
    };
    profiles.push(newProfile);
    activeProfileIndex = profiles.length - 1;
    await chrome.storage.local.set({ profiles: profiles });
    renderProfileSelector();
    selectProfile(activeProfileIndex);
    showToast('已添加新资料，请填写信息');
  }

  async function deleteProfile() {
    if (profiles.length <= 1) { showToast('至少需要保留一个资料', 'error'); return; }
    if (!confirm(`确定删除资料"${profiles[activeProfileIndex].name}"吗？`)) return;
    profiles.splice(activeProfileIndex, 1);
    activeProfileIndex = Math.max(0, activeProfileIndex - 1);
    await chrome.storage.local.set({ profiles: profiles, activeProfile: profiles[0].name });
    renderProfileSelector();
    selectProfile(activeProfileIndex);
    showToast('资料已删除');
  }

  async function resetToDefault() {
    if (!confirm('确定恢复默认设置吗？所有自定义资料将被清除。')) return;
    profiles = JSON.parse(JSON.stringify(DEFAULT_PROFILES));
    activeProfileIndex = 0;
    await chrome.storage.local.set({ profiles: profiles, settings: DEFAULT_SETTINGS, activeProfile: profiles[0].name });
    renderProfileSelector();
    selectProfile(0);
    showToast('已恢复默认设置');
  }

  let toastTimer = null;
  function showToast(message, type = 'success') {
    let toast = document.querySelector('.toast');
    if (toast) toast.remove();
    toast = document.createElement('div');
    toast.className = `toast ${type === 'error' ? 'error' : ''}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
})();
