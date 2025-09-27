import * as ui from './ui.js';
import * as storage from './storage.js';
import { brandConfig, GMAIL_URL } from './config.js';
import * as tabManager from './tab-manager.js';

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

  // Add event listeners for the new "Load Vouchers" buttons
  document.querySelectorAll('.load-vouchers-btn').forEach(button => {
    button.addEventListener('click', async () => {
      const actionContainer = button.closest('.action-container');
      const brand = actionContainer.dataset.category;

      const tab = await tabManager.getActiveTab();

      if (!tab) {
        return; // Error message is handled by getActiveTab
      }

      if (!tab.url || !tab.url.startsWith(brandConfig[brand].url)) {
        ui.displayMessage(`Please navigate to the ${brand} website and try again.`, 'error');
        return;
      }

      if (!tab.url.startsWith(brandConfig[brand].loadUrl)) {
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
          await tabManager.reloadTabAndWait(tab.id);
        } catch (error) {
          console.error('Failed to reload tab:', error);
          ui.displayMessage('The page failed to reload correctly. Please try again.', 'error');
          button.disabled = false;
          button.textContent = 'Load Vouchers';
          return;
        }
        ui.displayMessage(`Starting to load ${vouchersToLoad.length} available vouchers for ${brand}...`, 'info');
        const loadLogic = brandConfig[brand].loadLogic;
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
          await tabManager.reloadTabAndWait(tab.id);
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
});