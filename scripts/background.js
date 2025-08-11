chrome.action.onClicked.addListener((tab) => {
  chrome.windows.create({
    url: `popup.html?tabId=${tab.id}`,
    type: 'popup',
    width: 400,
    height: 600
  });
});