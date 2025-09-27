/**
 * This module provides utility functions for interacting with browser tabs,
 * abstracting away the details of the chrome.tabs and chrome.scripting APIs.
 */
import * as ui from './ui.js';

/**
 * Retrieves the currently active tab in the current window.
 * Displays an error message via the UI if no tab is found.
 * @returns {Promise<chrome.tabs.Tab|null>} A promise that resolves with the tab object or null if not found.
 */
export async function getActiveTab() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs || tabs.length === 0) {
      ui.displayMessage('Could not find the active tab.', 'error');
      return null;
    }
    return tabs[0];
  } catch (error) {
    console.error('Error getting active tab:', error);
    ui.displayMessage('Could not get tab details. The tab may have been closed.', 'error');
    return null;
  }
}

/**
 * Reloads a given tab and waits for it to be completely loaded.
 * @param {number} tabId The ID of the tab to reload.
 * @returns {Promise<void>} A promise that resolves when the tab has finished loading.
 */
export async function reloadTabAndWait(tabId) {
  return new Promise((resolve) => {
    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        setTimeout(() => {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }, 500);
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.reload(tabId);
  });
}

/**
 * Injected function to check if an email is open by looking at the URL.
 * This function is intended to be executed in the context of a Gmail tab.
 * @returns {boolean} True if an email is open, false otherwise.
 */
export function isEmailOpenByURL() {
  const hash = window.location.hash;
  // An open email URL in Gmail has a long, unique ID as the last part of its hash.
  // e.g., #inbox/some-long-id or #label/some-label/some-long-id
  // We check if the hash contains a '/' and if the last segment is long enough
  // to be considered an email ID.
  const parts = hash.split('/');
  const lastPart = parts[parts.length - 1];

  return hash.includes('/') && lastPart.length > 20;
}