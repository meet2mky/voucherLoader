/**
 * This module handles the logic for importing vouchers from Gmail.
 */
import * as ui from './ui.js';
import * as storage from './storage.js';
import { brandConfig, GMAIL_URL } from './config.js';
import * as tabManager from './tab-manager.js';

/**
 * Handles the entire process of importing vouchers from an open email in Gmail.
 * @param {string} category The brand category to scrape for.
 */
export async function importFromGmail(category) {
  const tab = await tabManager.getActiveTab();

  if (!tab) {
    return; // Error message is handled by getActiveTab
  }

  if (!tab.url || !tab.url.startsWith(GMAIL_URL)) {
    ui.displayMessage('Please navigate to Gmail and try again', 'error');
    return;
  }

  try {
    const [injectionResult] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: tabManager.isEmailOpenByURL,
    });

    if (injectionResult && injectionResult.result) {
      // Email is open, now scrape it using brand-specific logic.
      const scrapeLogic = brandConfig[category].scrapeLogic;
      if (!scrapeLogic) {
        ui.displayMessage(`No scraping logic defined for ${category}.`, 'error');
        return;
      }

      const [scrapeInjectionResult] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: scrapeLogic,
      });

      if (!scrapeInjectionResult || !scrapeInjectionResult.result) {
        ui.displayMessage('Scraping failed: Did not get a result from the page.', 'error');
        return;
      }

      const { vouchers, error } = scrapeInjectionResult.result;

      if (error) {
        ui.displayMessage(`Scraping failed: ${error}`, 'error');
      } else if (vouchers && vouchers.length > 0) {
        console.log('Scraped vouchers:', vouchers);
        await storage.addVouchers(category, vouchers);
      } else {
        ui.displayMessage('No vouchers were found in the email.', 'error');
      }
    } else {
      ui.displayMessage('No email is currently open for reading. Please open an email and try again.', 'error');
    }
  } catch (error) {
    console.error('Failed to inject script:', error);
    ui.displayMessage('Could not check the Gmail tab. Please reload the tab and try again.', 'error');
  }
}