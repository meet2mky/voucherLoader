import * as ui from './ui.js';
import * as storage from './storage.js';
import { brandConfig } from './config.js';
import * as tabManager from './tab-manager.js';
import * as emailImporter from './email-importer.js';
import * as voucherLoader from './voucher-loader.js';

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

  /**
   * Fetches the latest voucher data for a category and updates the stats summary in the UI.
   * @param {string} category The brand category (e.g., 'myntra').
   */
  async function updateStatsDisplay(category) {
    if (!category) return;

    const container = document.querySelector(`.action-container[data-category="${category}"]`);
    if (!container) return;

    const statsEl = container.querySelector('.voucher-stats-details'); // Target the specific stats container
    if (!statsEl) return; // If stats aren't visible, do nothing.

    const vouchers = await storage.getVouchers(category);
    const stats = ui.calculateVoucherStats(vouchers);

    statsEl.innerHTML = `
      <p>Available: <span>₹${stats.availableValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></p>
      <p>Redeemed: <span>₹${stats.redeemedValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></p>
      <p>Failed: <span>₹${stats.failedValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></p>
    `;
  }

  /**
   * Checks the current tab's URL and shows or hides the balance display accordingly.
   * This function is the single source of truth for balance visibility.
   */
  async function updateBalanceVisibility() {
    if (!activeCategory) {
      ui.removeCurrentBalance(); // Remove all balance displays if no category is active
      return;
    }

    const tab = await tabManager.getActiveTab();
    const brand = brandConfig[activeCategory];

    if (tab && tab.url && tab.url.startsWith(brand.loadUrl)) {
      // We are on the correct page, try to fetch and display the balance.
      const balanceLogic = brand.balanceLogic;
      if (balanceLogic) {
        try {
          const [balanceResult] = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: balanceLogic,
          });

          if (balanceResult && balanceResult.result !== -1) {
            ui.displayCurrentBalance(activeCategory, balanceResult.result);
          } else {
            // If fetching fails (e.g., element not found), hide the display.
            ui.removeCurrentBalance(activeCategory);
          }
        } catch (e) {
          console.error(`Error fetching balance for ${activeCategory}:`, e);
          ui.removeCurrentBalance(activeCategory); // Hide on error
        }
      }
    } else {
      // We are not on the correct page, ensure the balance display is hidden.
      ui.removeCurrentBalance(activeCategory);
    }
  }

  // Add event listeners for the new "Load Vouchers" buttons
  document.querySelectorAll('.load-vouchers-btn').forEach(button => {
    button.addEventListener('click', async () => {
      const actionContainer = button.closest('.action-container');
      const brand = actionContainer.dataset.category;
      // Define a progress callback to update both stats and balance.
      const onProgress = async () => {
        await updateStatsDisplay(brand);
        await updateBalanceVisibility();
      };
      await voucherLoader.loadVouchersForBrand(brand, button, onProgress);
      // Final update after the process completes.
      await onProgress();
    });
  });

  // Function to handle category selection
  async function handleCategorySelection(event) {
    const selectedCategoryItem = event.currentTarget;
    const selectedCategory = selectedCategoryItem.dataset.category;

    // Always remove existing summaries on any click to prevent stale data
    document.querySelectorAll('.voucher-stats-summary').forEach(el => el.remove());

    // If the clicked item is already selected, deselect it and show all items.
    if (selectedCategoryItem.classList.contains('selected')) {
      selectedCategoryItem.classList.remove('selected');
      activeCategory = null;
      // Hide all action containers
      actionContainers.forEach(container => (container.style.display = 'none'));
      // Show all category items
      categoryItems.forEach(item => (item.style.display = 'flex'));
      await updateBalanceVisibility(); // This will clear any leftover balance display
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

    // The logic to show/hide balance is now centralized in updateBalanceVisibility
    await updateBalanceVisibility();

    // Fetch vouchers and calculate stats to display in the main view
    const vouchers = await storage.getVouchers(activeCategory);
    const stats = ui.calculateVoucherStats(vouchers);

    actionContainers.forEach(container => {
      if (container.dataset.category === selectedCategory) {
        container.style.display = 'block';
        // Create and inject stats element
        const statsEl = document.createElement('div'); // Add a more specific class for targeting
        statsEl.className = 'voucher-stats-summary voucher-stats-details';
        statsEl.innerHTML = `
          <p>Available: <span>₹${stats.availableValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></p>
          <p>Redeemed: <span>₹${stats.redeemedValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></p>
          <p>Failed: <span>₹${stats.failedValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></p>
        `;
        // Append to the action container so it appears at the bottom
        container.append(statsEl);
      } else {
        container.style.display = 'none';
      }
    });
  }

  // Add click listeners to each category item
  categoryItems.forEach(item => item.addEventListener('click', handleCategorySelection));

  // Use event delegation for action buttons for better performance and scalability
  appContainer.addEventListener('click', async function(event) {
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
        await storage.clearVouchers(activeCategory);
        await updateStatsDisplay(activeCategory); // Update stats after clearing
      }
    }

    if (target.matches('.gmail-btn')) {
      console.log(`Gmail load for ${activeCategory} triggered.`);
      await emailImporter.importFromGmail(activeCategory);
      await updateStatsDisplay(activeCategory);
    }

    if (target.matches('.back-btn')) {
      ui.showMainView();
    }
  });

  // Add listeners to keep the balance display in sync with the tab state.
  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
    // We only care about URL changes.
    if (changeInfo.url) {
      const activeTab = await tabManager.getActiveTab();
      // Only update if the changed tab is the one that's currently active.
      if (activeTab && tabId === activeTab.id) {
        await updateBalanceVisibility();
      }
    }
  });

  chrome.tabs.onActivated.addListener(async () => {
    // A new tab has become active, so we need to re-check.
    await updateBalanceVisibility();
  });
});