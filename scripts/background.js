// This listener opens the side panel when the user clicks the extension's icon.
chrome.action.onClicked.addListener((tab) => {
  // This opens the side panel in the current window.
  chrome.sidePanel.open({ windowId: tab.windowId });
});