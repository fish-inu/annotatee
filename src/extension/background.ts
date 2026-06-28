import { CONTEXT_MENU_ID } from './types';

registerContextMenu();

chrome.runtime.onInstalled.addListener(() => {
  registerContextMenu();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_ID || typeof tab?.id !== 'number') {
    return;
  }

  chrome.tabs.sendMessage(
    tab.id,
    {
      type: 'ANNOTATE_SELECTION',
      selectionText: info.selectionText
    },
    () => {
      void chrome.runtime.lastError;
    }
  );
});

function registerContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: CONTEXT_MENU_ID,
      title: 'Annotate selection',
      contexts: ['selection'],
      documentUrlPatterns: ['http://*/*', 'https://*/*']
    });
  });
}
