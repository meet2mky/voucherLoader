import { myntraLoadLogic } from './load/myntra-load.js';
import { amazonLoadLogic } from './load/amazon-load.js';
import { myntraScrapeLogic } from './scrape/myntra-scrape.js';
import { amazonScrapeLogic } from './scrape/amazon-scrape.js';
import * as ui from './ui.js';
import * as storage from './storage.js';

document.addEventListener('DOMContentLoaded', function() {
  // DOM Elements
  const categoryItems = document.querySelectorAll('.category-item');
  const actionContainers = document.querySelectorAll('.action-container');
  const appContainer = document.getElementById('app-container');

  // Create a new container for messages and append it to the app container
  const messageContainer = document.createElement('div');
  messageContainer.id = 'popup-message-container';
  appContainer.appendChild(messageContainer);

  // State
  let activeCategory = null;

  // A centralized map for brand-specific loading voucher page information
  const BRAND_LOAD_URL_MAP = {
    myntra: 'https://www.myntra.com/my/myntracredit',
    amazon: 'https://www.amazon.in/gp/aw/ya/gcb'
  };
  // A centralized map for brand-specific website information
  const BRAND_URL_MAP = {
    myntra: 'https://www.myntra.com/',
    amazon: 'https://www.amazon.in/'
  };
  const GMAIL_URL = 'https://mail.google.com/';

  /**
   * A map of injectable functions that contain the logic for adding a voucher on each brand's website.
   * These functions are imported from separate files and executed in the context of the web page.
   */
  const BRAND_LOAD_LOGIC = {
    myntra: myntraLoadLogic,
    amazon: amazonLoadLogic
  };

  /**
   * A map of injectable functions that contain the logic for scraping vouchers from Gmail for each brand.
   * These functions are imported from separate files and executed in the context of the Gmail page.
   */
  const BRAND_SCRAPE_LOGIC = {
    myntra: myntraScrapeLogic,
    amazon: amazonScrapeLogic
  };

  /**
   * Reloads a given tab and waits for it to be completely loaded.
   * @param {number} tabId The ID of the tab to reload.
   * @returns {Promise<void>} A promise that resolves when the tab has finished loading.
   */
  async function reloadTabAndWait(tabId) {
    return new Promise((resolve, reject) => {
      const listener = (updatedTabId, changeInfo) => {
        // Ensure the update is for the correct tab and it has finished loading
        if (updatedTabId === tabId && changeInfo.status === 'complete') {
          // A small delay to ensure scripts on the reloaded page have initialized
          setTimeout(() => {
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
          }, 500); // 0.5s delay for safety
        }
      };

      chrome.tabs.onUpdated.addListener(listener);
      chrome.tabs.reload(tabId);
    });
  }

  // Add event listeners for the new "Load Vouchers" buttons
  document.querySelectorAll('.load-vouchers-btn').forEach(button => {
    button.addEventListener('click', async () => {
      const actionContainer = button.closest('.action-container');
      const brand = actionContainer.dataset.category;

      let tab;
      try {
        // When used as a side panel or popup, we must query for the active tab.
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tabs || tabs.length === 0) {
          ui.displayMessage('Could not find the active tab.', 'error');
          return;
        }
        tab = tabs[0];
      } catch (error) {
        ui.displayMessage('Could not get tab details. The tab may have been closed.', 'error');
        return;
      }

      if (!tab) {
        ui.displayMessage('Could not get tab details. The tab may have been closed.', 'error');
        return;
      }

      if (!tab.url || !tab.url.startsWith(BRAND_URL_MAP[brand])) {
        ui.displayMessage(`Please navigate to the ${brand} website and try again.`, 'error');
        return;
      }

      if (!tab.url.startsWith(BRAND_LOAD_URL_MAP[brand])) {
        ui.displayMessage(`Please open the correct voucher loading page for ${brand} and try again.`, 'error');
        return;
      }

      try {
        const allVouchers = await storage.getVouchers(brand);
        const vouchersToLoad = allVouchers.filter(v => v.status !== 'REDEEMED');

        if (vouchersToLoad.length === 0) {
          ui.displayMessage(`No available vouchers to load for ${brand}.`, 'info');
          return;
        }
        // Disable button immediately to give user feedback
        button.disabled = true;
        button.textContent = 'Reloading page...';

        try {
          // --- RELOAD Active TAB BEFORE Loading vouchers ---
          await reloadTabAndWait(tab.id);
        } catch (error) {
          console.error('Failed to reload tab:', error);
          ui.displayMessage('The page failed to reload correctly. Please try again.', 'error');
          button.disabled = false;
          button.textContent = 'Load Vouchers';
          return;
        }
        ui.displayMessage(`Starting to load ${vouchersToLoad.length} available vouchers for ${brand}...`, 'info');
        const loadLogic = BRAND_LOAD_LOGIC[brand];
        if (!loadLogic) {
          ui.displayMessage(`No loading logic defined for ${brand}.`, 'error');
          button.disabled = false;
          button.textContent = 'Load Vouchers';
          return;
        }

        let successfulLoads = 0;
        let failedLoads = 0;

        button.textContent = 'Loading...';

        let i = 0;
        for (const voucher of vouchersToLoad) {
          try {
            const [injectionResult] = await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              func: loadLogic,
              args: [voucher.VoucherCode, voucher.VoucherPin],
            });

            const result = injectionResult.result;
            if (result && result.success) {
              successfulLoads++;
              voucher.status = 'REDEEMED';
            } else {
              failedLoads++;
              voucher.status = 'ERROR';
              const errorMessage = result ? result.message : 'An unknown error occurred.';
              ui.displayMessage(`Failed on voucher ${voucher.VoucherCode}: ${errorMessage}`, 'error', 6000);
              console.error(`Voucher loading failed for ${voucher.VoucherCode}:`, result);
            }

            await new Promise(resolve => setTimeout(resolve, 4000));
          } catch (error) {
            failedLoads++;
            voucher.status = 'ERROR'; // Also set status on critical error
            console.error(`Error injecting script for voucher ${voucher.VoucherCode}:`, error);
            ui.displayMessage(`A critical error occurred while loading voucher ${voucher.VoucherCode}. Aborting.`, 'error', 8000);
            break;
          }
          i++;
          button.textContent = `Loading... (${i}/${vouchersToLoad.length})`;
          await reloadTabAndWait(tab.id);
        }

        // Save all updated statuses back to storage
        await storage.saveVouchers(brand, allVouchers);
        ui.displayMessage(`Voucher loading complete. Success: ${successfulLoads}, Failed: ${failedLoads}`, 'info', 8000);

      } catch (error) {
        console.error('Error during voucher loading process:', error);
        ui.displayMessage('A critical error occurred during the loading process.', 'error');
      } finally {
        // Re-enable the button
        button.disabled = false;
        button.textContent = 'Load Vouchers';
      }
    });
  });

  // Function to handle category selection
  function handleCategorySelection(event) {
    const selectedCategoryItem = event.currentTarget;
    const selectedCategory = selectedCategoryItem.dataset.category;

    // If the clicked item is already selected, deselect it and show all items.
    if (selectedCategoryItem.classList.contains('selected')) {
      selectedCategoryItem.classList.remove('selected');
      activeCategory = null;
      // Hide all action containers
      actionContainers.forEach(container => (container.style.display = 'none'));
      // Show all category items
      categoryItems.forEach(item => (item.style.display = 'flex'));
      return;
    }

    // A new item is being selected.
    activeCategory = selectedCategory;

    // Hide other items, remove their 'selected' class, and show the correct action container.
    categoryItems.forEach(item => {
      item.style.display = item === selectedCategoryItem ? 'flex' : 'none';
      item.classList.remove('selected');
    });
    selectedCategoryItem.classList.add('selected');

    actionContainers.forEach(container => {
      container.style.display = container.dataset.category === selectedCategory ? 'block' : 'none';
    });
  }

  // Add click listeners to each category item
  categoryItems.forEach(item => item.addEventListener('click', handleCategorySelection));

  // Use event delegation for action buttons for better performance and scalability
  appContainer.addEventListener('click', function(event) {
    if (!activeCategory) return; // Do nothing if no category is selected

    const target = event.target;

    if (target.matches('.show-vouchers-btn')) {
      console.log(`Show vouchers for ${activeCategory} triggered.`);
      storage.getVouchers(activeCategory).then(vouchers => {
        ui.showVoucherView(activeCategory, vouchers);
      });
    }

    if (target.matches('.clear-vouchers-btn')) {
      console.log(`Clear vouchers for ${activeCategory} triggered.`);
      const confirmation = confirm(`Are you sure you want to delete all vouchers for ${activeCategory}? This action cannot be undone.`);
      if (confirmation) {
        storage.clearVouchers(activeCategory);
      }
    }

    if (target.matches('.gmail-btn')) {
      console.log(`Gmail load for ${activeCategory} triggered.`);
      handleGmailImport(activeCategory);
    }

    if (target.matches('.back-btn')) {
      ui.showMainView();
    }
  });

  /**
   * Handles fetching vouchers from Gmail.
   * @param {string} category The currently active category.
   */
  async function handleGmailImport(category) {
    let tab;
    try {
      // When used as a side panel or popup, we must query for the active tab.
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabs || tabs.length === 0) {
        ui.displayMessage('Could not find the active tab.', 'error');
        return;
      }
      tab = tabs[0];
    } catch (error) {
      ui.displayMessage('Could not get tab details. The tab may have been closed.', 'error');
      return;
    }

    if (!tab) {
      ui.displayMessage('Could not get tab details. The tab may have been closed.', 'error');
      return;
    }

    if (!tab.url || !tab.url.startsWith(GMAIL_URL)) {
      ui.displayMessage('Please navigate to Gmail and try again, current url is: ' + tab.url,  'error');
      return;
    }

    try {
      const [injectionResult] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: isEmailOpenByURL,
      });

      if (injectionResult && injectionResult.result) {
        // Email is open, now scrape it using brand-specific logic.
        const scrapeLogic = BRAND_SCRAPE_LOGIC[category];
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
          storage.addVouchers(category, vouchers);
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

  /**
   * Injected function to check if an email is open by looking at the URL.
   * @returns {boolean} True if an email is open, false otherwise.
   */
  function isEmailOpenByURL() {
    // The hash for an open email is typically longer than just '#inbox', '#sent', etc.
    // and contains a slash.
    const hash = window.location.hash;
    return hash.includes('/') && hash.split('/')[1].length > 20;
  }
});