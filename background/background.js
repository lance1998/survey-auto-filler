/**
 * 问卷自动填写助手 - 后台 Service Worker
 * 负责：右键菜单、初始化默认设置、消息中转
 */

chrome.runtime.onInstalled.addListener(async (details) => {
  chrome.contextMenus.create({
    id: 'qaf-fill-all',
    title: '一键填写问卷',
    contexts: ['page', 'frame'],
  });

  chrome.contextMenus.create({
    id: 'qaf-detect-fields',
    title: '检测问卷字段',
    contexts: ['page', 'frame'],
  });

  chrome.contextMenus.create({
    id: 'qaf-separator',
    type: 'separator',
    contexts: ['page', 'frame'],
  });

  chrome.contextMenus.create({
    id: 'qaf-fill-random',
    title: '随机填写问卷',
    contexts: ['page', 'frame'],
  });

  const data = await chrome.storage.local.get(['profiles', 'settings']);
  if (!data.profiles) {
    await chrome.storage.local.set({
      profiles: [
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
      ],
      activeProfile: '默认',
    });
  }

  if (!data.settings) {
    await chrome.storage.local.set({
      settings: {
        mode: 'profile',
        fillDelay: 50,
      },
    });
  }

  if (details.reason === 'install') {
    console.log('[问卷自动填写助手] 首次安装，已初始化默认配置');
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab || !tab.id) return;

  const data = await chrome.storage.local.get(['profiles', 'settings', 'activeProfile']);
  const profiles = data.profiles || [];
  const activeProfileName = data.activeProfile || profiles[0]?.name;
  const profile = profiles.find((p) => p.name === activeProfileName) || profiles[0];

  switch (info.menuItemId) {
    case 'qaf-fill-all':
      sendMessageToTab(tab.id, {
        action: 'fillAll',
        data: { profile, mode: 'profile' },
      });
      break;

    case 'qaf-fill-random':
      sendMessageToTab(tab.id, {
        action: 'fillAll',
        data: { profile, mode: 'random' },
      });
      break;

    case 'qaf-detect-fields':
      sendMessageToTab(tab.id, { action: 'detectFields' });
      break;
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_SETTINGS') {
    chrome.storage.local.get(['profiles', 'settings', 'activeProfile']).then((data) => {
      sendResponse(data);
    });
    return true;
  }
});

function sendMessageToTab(tabId, message) {
  chrome.tabs.sendMessage(tabId, message, (response) => {
    if (chrome.runtime.lastError) {
      console.warn('[问卷助手] 无法发送消息到标签页:', chrome.runtime.lastError.message);
    }
  });
}

chrome.commands?.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  const data = await chrome.storage.local.get(['profiles', 'activeProfile', 'settings']);
  const profiles = data.profiles || [];
  const activeProfileName = data.activeProfile || profiles[0]?.name;
  const profile = profiles.find((p) => p.name === activeProfileName) || profiles[0];
  const settings = data.settings || {};
  const mode = settings.mode || 'profile';

  switch (command) {
    case 'fill-form':
      sendMessageToTab(tab.id, {
        action: 'fillAll',
        data: { profile, mode },
      });
      break;

    case 'detect-form':
      sendMessageToTab(tab.id, { action: 'detectFields' });
      break;
  }
});
