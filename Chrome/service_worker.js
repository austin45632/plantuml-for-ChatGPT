// =====================================================================
// PlantUML for ChatGPT - Chrome tab coordination
// =====================================================================

// Chrome 155+ exposes the native Split View API through tabs.create with
// splitWithTabId. The content script cannot call tabs.create directly, so
// this small service worker performs the tab operation using sender.tab.id.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== 'PLANTUML_OPEN_SPLIT_VIEWER') {
    return false;
  }

  const currentTab = sender.tab;
  if (!currentTab || typeof currentTab.id !== 'number') {
    sendResponse({ ok: false, mode: 'fallback', reason: 'missing-current-tab' });
    return false;
  }

  // A tab already in a split view cannot be paired with another tab without
  // changing the user's existing layout. Leave it intact and let the caller
  // show a useful message instead.
  if (typeof currentTab.splitViewId === 'number' && currentTab.splitViewId !== -1) {
    sendResponse({ ok: false, mode: 'already-split' });
    return false;
  }

  // Feature-detect the API so Chrome 154 falls back before creating a normal
  // tab with an ignored splitWithTabId field.
  if (!chrome.tabs || typeof chrome.tabs.createSplit !== 'function') {
    sendResponse({ ok: false, mode: 'fallback', reason: 'split-view-unavailable' });
    return false;
  }

  if (typeof message.requestId !== 'string' || !message.requestId) {
    sendResponse({ ok: false, mode: 'fallback', reason: 'invalid-request' });
    return false;
  }

  const viewerUrl = `${chrome.runtime.getURL('viewer.html')}#requestId=${encodeURIComponent(message.requestId)}`;
  chrome.tabs.create({
    url: viewerUrl,
    splitWithTabId: currentTab.id,
    // Keep the ChatGPT tab as the focused side after the split is created.
    active: false
  }, (viewerTab) => {
    const error = chrome.runtime.lastError;
    if (error) {
      sendResponse({ ok: false, mode: 'fallback', reason: error.message });
      return;
    }

    if (!viewerTab || typeof viewerTab.id !== 'number' ||
        typeof viewerTab.splitViewId !== 'number' || viewerTab.splitViewId === -1) {
      if (viewerTab && typeof viewerTab.id === 'number') {
        chrome.tabs.remove(viewerTab.id, () => {
          void chrome.runtime.lastError;
        });
      }
      sendResponse({ ok: false, mode: 'fallback', reason: 'split-view-not-created' });
      return;
    }

    sendResponse({ ok: true, mode: 'split', tabId: viewerTab.id });
  });

  return true;
});
