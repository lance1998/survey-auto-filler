(function () {
  'use strict';

  let currentMode = 'profile';
  let currentProfile = null;
  let fieldsExpanded = false;

  const $ = (id) => document.getElementById(id);
  const platformName = $('platform-name');
  const profileName = $('profile-name');
  const profileInfo = $('profile-info');
  const btnFill = $('btn-fill');
  const btnDetect = $('btn-detect');
  const btnSettings = $('btn-settings');
  const detectResult = $('detect-result');
  const fieldCount = $('field-count');
  const fieldList = $('field-list');
  const btnToggleFields = $('btn-toggle-fields');
  const fillStatus = $('fill-status');
  const statusIcon = $('status-icon');
  const statusText = $('status-text');
  const statusDetail = $('status-detail');
  const modeBtns = document.querySelectorAll('.mode-btn');
  const autoFillSwitch = $('auto-fill-switch');

  init();

  async function init() {
    await loadSettings();
    await detectPlatform();
    bindEvents();
  }

  async function loadSettings() {
    const data = await chrome.storage.local.get(['profiles', 'settings', 'activeProfile']);
    const settings = data.settings || { mode: 'profile', fillDelay: 50 };
    currentMode = settings.mode || 'profile';
    modeBtns.forEach((btn) => btn.classList.toggle('active', btn.dataset.mode === currentMode));
    autoFillSwitch.checked = settings.autoFill === true;
    const profiles = data.profiles || [getDefaultProfile()];
    const activeProfileName = data.activeProfile || profiles[0]?.name || '默认';
    currentProfile = profiles.find((p) => p.name === activeProfileName) || profiles[0] || getDefaultProfile();
    profileName.textContent = currentProfile.name;
    const info = [];
    if (currentProfile.name_field) info.push(currentProfile.name_field);
    if (currentProfile.phone) info.push(maskPhone(currentProfile.phone));
    profileInfo.textContent = info.join(' | ') || '点击设置配置资料';
  }

  function maskPhone(phone) {
    if (!phone || phone.length < 7) return phone;
    return phone.slice(0, 3) + '****' + phone.slice(-4);
  }

  function getDefaultProfile() {
    return { name: '默认', name_field: '张三', gender: '男', age: '25', phone: '13800138000', email: 'zhangsan@example.com', idCard: '110101199001011234', address: '北京市朝阳区某某街道123号', school: '北京大学', company: '某科技有限公司', occupation: '软件工程师', city: '北京', birthday: '1990-01-01', suggestions: '无', income: '10000', marital: '未婚', ethnicity: '汉族', political: '群众', department: '研发部', staffId: '10001', emergencyContact: '张三' };
  }

  async function detectPlatform() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) { platformName.textContent = '无法获取当前页面'; return; }
      chrome.tabs.sendMessage(tab.id, { action: 'getPlatform' }, (response) => {
        if (chrome.runtime.lastError || !response) {
          const host = new URL(tab.url).hostname;
          platformName.textContent = host || '未知页面';
          return;
        }
        platformName.textContent = response.name || '通用网页';
      });
    } catch (e) { platformName.textContent = '检测失败'; }
  }

  function bindEvents() {
    modeBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        currentMode = btn.dataset.mode;
        modeBtns.forEach((b) => b.classList.toggle('active', b === btn));
        saveSettings();
      });
    });
    btnFill.addEventListener('click', handleFill);
    btnDetect.addEventListener('click', handleDetect);
    btnToggleFields.addEventListener('click', toggleFields);
    btnSettings.addEventListener('click', () => chrome.runtime.openOptionsPage());
    autoFillSwitch.addEventListener('change', async () => {
      const enabled = autoFillSwitch.checked;
      await saveAutoFillSetting(enabled);
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) { chrome.tabs.sendMessage(tab.id, { action: 'setAutoFill', data: { enabled } }, () => { if (chrome.runtime.lastError) return; }); }
    });
  }

  async function saveAutoFillSetting(enabled) {
    const data = await chrome.storage.local.get(['settings']);
    const settings = data.settings || {};
    settings.autoFill = enabled;
    await chrome.storage.local.set({ settings });
  }

  async function saveSettings() {
    const data = await chrome.storage.local.get(['settings']);
    const settings = data.settings || {};
    settings.mode = currentMode;
    await chrome.storage.local.set({ settings });
  }

  async function handleFill() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;
    btnFill.disabled = true;
    btnFill.innerHTML = '<span class="loading-spinner"></span> 填写中...';
    document.body.classList.add('loading');
    fillStatus.style.display = 'none';
    chrome.tabs.sendMessage(tab.id, { action: 'fillAll', data: { profile: currentProfile, mode: currentMode } }, (response) => {
      btnFill.disabled = false;
      btnFill.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> 一键填写';
      document.body.classList.remove('loading');
      if (chrome.runtime.lastError) { showStatus('error', '填写失败', '无法连接到页面，请确保在问卷页面使用'); return; }
      if (response && response.error) { showStatus('error', '填写出错', response.error); return; }
      if (response && response.success) {
        const pct = response.total > 0 ? Math.round((response.filled / response.total) * 100) : 0;
        if (response.emptyRequired && response.emptyRequired.length > 0) {
          const items = response.emptyRequired.slice(0, 3).map((r) => r.label).join('、');
          const more = response.emptyRequired.length > 3 ? ` 等${response.emptyRequired.length}项` : '';
          showStatus('warning', '填写完成，有必填项未填', `平台：${response.platform || '通用'} | ${response.filled}/${response.total} 字段 (${pct}%) | 未填：${items}${more}`);
        } else {
          showStatus('success', '填写完成！', `平台：${response.platform || '通用'} | 已填写 ${response.filled}/${response.total} 个字段 (${pct}%)`);
        }
      } else {
        showStatus('warning', '未检测到字段', '当前页面可能不是问卷页面，或问卷使用特殊框架');
      }
    });
  }

  async function handleDetect() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;
    btnDetect.disabled = true;
    btnDetect.innerHTML = '<span class="loading-spinner" style="border-color: rgba(74,144,217,0.3); border-top-color: #4A90D9;"></span> 检测中...';
    fillStatus.style.display = 'none';
    chrome.tabs.sendMessage(tab.id, { action: 'detectFields' }, (response) => {
      btnDetect.disabled = false;
      btnDetect.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> 检测字段';
      if (chrome.runtime.lastError || !response) { showStatus('error', '检测失败', '无法连接到页面，请确保在问卷页面使用'); return; }
      if (response.success && response.count > 0) {
        detectResult.style.display = 'block';
        fieldCount.textContent = `${response.count} 个`;
        if (response.requiredCount > 0) fieldCount.textContent += `（${response.requiredCount} 个必填）`;
        renderFieldList(response.fields);
        fieldsExpanded = false;
        fieldList.style.display = 'none';
        btnToggleFields.textContent = '展开';
      } else {
        detectResult.style.display = 'none';
        showStatus('warning', '未检测到字段', '当前页面没有可填写的表单字段');
      }
    });
  }

  function renderFieldList(fields) {
    const typeLabels = { text: '文本', textarea: '文本域', radio: '单选', 'checkbox-group': '多选', checkbox: '勾选', select: '下拉', range: '滑块', star: '星级', matrix: '矩阵', file: '文件' };
    fieldList.innerHTML = fields.map((f) => {
      const typeLabel = typeLabels[f.type] || f.type;
      const requiredMark = f.required ? '<span style="color:#F44336;margin-left:4px;">*</span>' : '';
      const optionsText = f.options && f.options.length > 0 ? ` (${f.options.slice(0, 3).join(', ')}${f.options.length > 3 ? '...' : ''})` : '';
      return `<div class="field-item"><span class="field-type ${f.type}">${typeLabel}</span><span class="field-label" title="${escapeHtml(f.label)}${escapeHtml(optionsText)}">${escapeHtml(f.label)}${requiredMark}${escapeHtml(optionsText)}</span></div>`;
    }).join('');
  }

  function escapeHtml(text) { const div = document.createElement('div'); div.textContent = text; return div.innerHTML; }

  function toggleFields() {
    fieldsExpanded = !fieldsExpanded;
    fieldList.style.display = fieldsExpanded ? 'block' : 'none';
    btnToggleFields.textContent = fieldsExpanded ? '收起' : '展开';
  }

  function showStatus(type, title, detail) {
    fillStatus.style.display = 'block';
    const icons = { success: '✅', error: '❌', warning: '⚠️', loading: '⏳' };
    statusIcon.textContent = icons[type] || 'ℹ️';
    statusText.textContent = title;
    statusDetail.textContent = detail || '';
  }
})();
