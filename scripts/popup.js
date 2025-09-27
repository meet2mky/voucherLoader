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

  // Add event listeners for the new "Load Vouchers" buttons
  document.querySelectorAll('.load-vouchers-btn').forEach(button => {
    button.addEventListener('click', () => {
      const actionContainer = button.closest('.action-container');
      const brand = actionContainer.dataset.category;
      voucherLoader.loadVouchersForBrand(brand, button);
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
      emailImporter.importFromGmail(activeCategory);
    }

    if (target.matches('.back-btn')) {
      ui.showMainView();
    }
  });
});