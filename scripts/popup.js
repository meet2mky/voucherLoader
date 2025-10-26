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

    const statsEl = container.querySelector('.voucher-stats-summary');
    if (!statsEl) return; // If stats aren't visible, do nothing.

    const vouchers = await storage.getVouchers(category);
    const stats = ui.calculateVoucherStats(vouchers);

    statsEl.innerHTML = `
      <p>Available: <span>₹${stats.availableValue.toFixed(2)}</span></p>
      <p>Redeemed: <span>₹${stats.redeemedValue.toFixed(2)}</span></p>
      <p>Failed: <span>₹${stats.failedValue.toFixed(2)}</span></p>
    `;
  }

  // Add event listeners for the new "Load Vouchers" buttons
  document.querySelectorAll('.load-vouchers-btn').forEach(button => {
    button.addEventListener('click', async () => {
      const actionContainer = button.closest('.action-container');
      const brand = actionContainer.dataset.category;
      // Pass a callback to update stats during the loading process.
      await voucherLoader.loadVouchersForBrand(brand, button, () => updateStatsDisplay(brand));
      await updateStatsDisplay(brand); // Update stats after the process completes
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

    // Fetch vouchers and calculate stats to display in the main view
    const vouchers = await storage.getVouchers(activeCategory);
    const stats = ui.calculateVoucherStats(vouchers);

    actionContainers.forEach(container => {
      if (container.dataset.category === selectedCategory) {
        container.style.display = 'block';
        // Create and inject stats element
        const statsEl = document.createElement('div');
        statsEl.className = 'voucher-stats-summary';
        statsEl.innerHTML = `
          <p>Available: <span>₹${stats.availableValue.toFixed(2)}</span></p>
          <p>Redeemed: <span>₹${stats.redeemedValue.toFixed(2)}</span></p>
          <p>Failed: <span>₹${stats.failedValue.toFixed(2)}</span></p>
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
});