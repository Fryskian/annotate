const DEFAULT_TITLE = 'Open annotate.js';

async function unavailable(tabId, message) {
  await Promise.all([
    chrome.action.setBadgeBackgroundColor({ tabId, color: '#dc2626' }),
    chrome.action.setBadgeText({ tabId, text: '!' }),
    chrome.action.setTitle({ tabId, title: `Annotate.js: ${message}` }),
  ]);
  console.warn(`Annotate.js: ${message}`);
}

chrome.action.onClicked.addListener(async tab => {
  if (!tab.id) return;
  const url = tab.url || '';
  const browserStore = /^https:\/\/(chromewebstore\.google\.com|chrome\.google\.com\/webstore|microsoftedge\.microsoft\.com\/addons)(\/|$)/;
  if (!/^(https?:|file:)/.test(url) || browserStore.test(url)) {
    await unavailable(tab.id, 'This browser page does not allow extension injection.');
    return;
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['annotate.js'],
      world: 'ISOLATED',
    });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'ISOLATED',
      func: () => {
        if (!window.Annotate) throw new Error('Annotate.js did not initialize');
        const enable = () => window.Annotate.enable();
        if (document.readyState === 'loading')
          document.addEventListener('DOMContentLoaded', enable, { once: true });
        else enable();
      },
    });
    await chrome.action.setBadgeText({ tabId: tab.id, text: '' });
    await chrome.action.setTitle({ tabId: tab.id, title: DEFAULT_TITLE });
  } catch (error) {
    const fileHint = url.startsWith('file:') ? ' Enable “Allow access to file URLs” for this extension.' : '';
    await unavailable(tab.id, `Could not open on this page.${fileHint}`);
  }
});
