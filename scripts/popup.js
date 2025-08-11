document.addEventListener('DOMContentLoaded', function() {
  // DOM Elements
  const categoryItems = document.querySelectorAll('.category-item');
  const actionContainers = document.querySelectorAll('.action-container');
  const appContainer = document.getElementById('app-container');
  const mainView = document.getElementById('main-view');
  const voucherView = document.getElementById('voucher-view');

  // State
  let activeCategory = null;

  // A centralized map for brand-specific voucher page information
  const BRAND_URL_MAP = {
    myntra: 'https://www.myntra.com/my/myntracredit',
    amazon: 'https://www.amazon.in/gp/aw/ya/gcb'
  };

  /**
   * A map of injectable functions that contain the logic for adding a voucher on each brand's website.
   * These functions are executed in the context of the web page, not the extension's popup.
   */
  const BRAND_LOAD_LOGIC = {
    myntra: async function(voucherCode, voucherPin) {
      // Helper function to create a delay, allowing the page to react.
      const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

      // Step 1: Click the button to reveal the gift card input form..
      const openFormButton = document.querySelector('.balance-giftCardButton');
      if (!openFormButton) {
        alert('Could not find the initial "Add Gift Card" button. The website layout may have changed.');
        return false; // Indicate failure
      }
      openFormButton.click();

      // Step 2: Wait for the form to become visible.
      await sleep(3000); // 3 second delay

      // Step 3: Now find the actual input fields and fill them.
      const codeInput = document.querySelector('input[name="gcnumber"]');
      const pinInput = document.querySelector('input[name="gcpin"]');

      if (!codeInput || !pinInput) {
        alert('Could not find the voucher input fields after clicking. The website structure may have changed.');
        return false; // Indicate failure
      }

      // Step 4: Fill the gcnumber and gcpin.
      codeInput.value = voucherCode;
      codeInput.dispatchEvent(new Event('input', { bubbles: true }));
      pinInput.value = voucherPin;
      pinInput.dispatchEvent(new Event('input', { bubbles: true }));
      
      await sleep(3000)
      const finalAddButton = document.querySelector('.addCard-showButton')
      if (!finalAddButton) {
        alert('Could not find the final add button.')
        return false
      }
      finalAddButton.click()
      await sleep(3000)
      return true; // Indicate success
    },
    amazon: function(voucherCode) {
      // NOTE: These selectors are placeholders for Amazon's gift card page.
      const codeInput = document.querySelector('input#gc-redemption-input'); // Example selector
      const addButton = document.querySelector('input[name*="add-to-balance"]'); // Example selector

      if (!codeInput || !addButton) {
        alert('Could not find the gift card input field or button on the page. The website structure may have changed.');
        return false; // Indicate failure
      }

      codeInput.value = voucherCode;
      codeInput.dispatchEvent(new Event('input', { bubbles: true }));
      addButton.click();
      return true; // Indicate success
    }
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

  // Get tabId from URL parameters
  const urlParams = new URLSearchParams(window.location.search);
  const tabId = parseInt(urlParams.get('tabId'), 10);

  // Add event listeners for the new "Load Vouchers" buttons
  document.querySelectorAll('.load-vouchers-btn').forEach(button => {
    button.addEventListener('click', async () => {
      const actionContainer = button.closest('.action-container');
      const brand = actionContainer.dataset.category;

      if (!tabId) {
        alert('Target tab ID not found. Please ensure the extension was opened from a valid tab.');
        return;
      }

      const tab = await chrome.tabs.get(tabId);

      if (!tab) {
        alert('Could not get tab details. The tab may have been closed.');
        return;
      }

      const expectedUrl = BRAND_URL_MAP[brand];
      if (!tab.url || !tab.url.startsWith(expectedUrl)) {
        alert(`Please open the extension from the correct ${brand} voucher page and try again.`);
        return;
      }

      // Disable button immediately to give user feedback
      button.disabled = true;
      button.textContent = 'Reloading page...';

      try {
        // --- 1. RELOAD TAB BEFORE EXECUTING SCRIPT ---
        await reloadTabAndWait(tab.id);
      } catch (error) {
        console.error('Failed to reload tab:', error);
        alert('The page failed to reload correctly. Please try again.');
        button.disabled = false;
        button.textContent = 'Load Vouchers';
        return;
      }

      const storageKey = `${brand}_vouchers`;
      chrome.storage.local.get([storageKey], async (result) => {
        const vouchers = result[storageKey];

        if (!vouchers || vouchers.length === 0) {
          alert(`No vouchers found for ${brand}. Please insert vouchers from a file first.`);
          button.disabled = false;
          button.textContent = 'Load Vouchers';
          return;
        }
        
        alert(`Loading ${vouchers.length} vouchers for ${brand}...`);
        const loadLogic = BRAND_LOAD_LOGIC[brand];
        if (!loadLogic) {
          alert(`No loading logic defined for ${brand}.`);
          button.disabled = false;
          button.textContent = 'Load Vouchers';
          return;
        }

        let successfulLoads = 0;
        let failedLoads = 0;

        // Disable the button to prevent multiple clicks during operation
        button.textContent = 'Loading...';

        for (const voucher of vouchers) {
          try {
            const [injectionResult] = await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              func: loadLogic,
              args: [voucher.VoucherCode, voucher.VoucherPin], // Pass voucher data as arguments
            });

            // Check the return value from our injected function
            if (injectionResult && injectionResult.result) {
              successfulLoads++;
            } else {
              failedLoads++;
              alert(`Voucher loading failed for voucher ${voucher.VoucherCode}. Click Ok to continue...`);
            }

            // Wait for a moment to let the page process the submission (e.g., via AJAX)
            await new Promise(resolve => setTimeout(resolve, 4000)); // 4-second delay
          } catch (error) {
            failedLoads++;
            console.error(`Error injecting script for voucher ${voucher.VoucherCode}:`, error);
            alert(`A critical error occurred while loading voucher ${voucher.VoucherCode}. Aborting.\n\nError: ${error.message}`);
            break; // Stop the loop if a critical error occurs
          }
          await reloadTabAndWait(tab.id);
        }
        // Re-enable the button and provide a summary
        button.disabled = false;
        button.textContent = 'Load Vouchers';
        alert(`Voucher loading complete.\n\nSuccessfully loaded: ${successfulLoads}\nFailed: ${failedLoads}`);
      });
    });
  });

  // Function to handle category selection
  function handleCategorySelection(event) {
    const selectedCategoryItem = event.currentTarget;
    const selectedCategory = selectedCategoryItem.dataset.category;

    // If the clicked item is already selected, deselect it and hide actions.
    if (selectedCategoryItem.classList.contains('selected')) {
      selectedCategoryItem.classList.remove('selected');
      activeCategory = null;
      actionContainers.forEach(container => container.style.display = 'none');
      return;
    }

    // Update visual state for all category items
    categoryItems.forEach(item => item.classList.remove('selected'));
    selectedCategoryItem.classList.add('selected');
    activeCategory = selectedCategory;

    // Show/hide action sections based on selection
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

    // Key for accessing storage, e.g., "myntra_vouchers"
    const storageKey = `${activeCategory}_vouchers`;

    if (target.matches('.show-vouchers-btn')) {
      console.log(`Show vouchers for ${activeCategory} triggered.`);
      showVoucherView(activeCategory);
    }

    if (target.matches('.clear-vouchers-btn')) {
      console.log(`Clear vouchers for ${activeCategory} triggered.`);
      const confirmation = confirm(`Are you sure you want to delete all vouchers for ${activeCategory}? This action cannot be undone.`);
      if (confirmation) {
        // Set the voucher list for the active category to an empty array
        chrome.storage.local.set({ [storageKey]: [] }, () => {
          console.log(`${activeCategory} vouchers cleared.`);
          alert(`${activeCategory} vouchers have been cleared successfully.`);
        });
      }
    }

    if (target.matches('.gmail-btn')) {
      console.log(`Gmail load for ${activeCategory} triggered.`);
      handleGmailImport(activeCategory);
    }

    if (target.matches('.back-btn')) {
      showMainView();
    }
  });

  /**
   * Handles fetching vouchers from Gmail.
   * @param {string} category The currently active category.
   */
  function handleGmailImport(category) {
    alert('TODO: Implement Gmail voucher fetching for ' + category);
  }

  

  /**
   * Appends new vouchers to the existing list in chrome.storage.
   * @param {string} category The category to which the vouchers belong.
   * @param {Array<Object>} newVouchers The new vouchers to add.
   */
  function addVouchersToStorage(category, newVouchers) {
    const storageKey = `${category}_vouchers`;
    chrome.storage.local.get([storageKey], result => {
      const existingVouchers = result[storageKey] || [];
      const combinedVouchers = existingVouchers.concat(newVouchers);

      chrome.storage.local.set({ [storageKey]: combinedVouchers }, () => {
        if (chrome.runtime.lastError) {
          console.error('Error saving vouchers:', chrome.runtime.lastError);
          alert('An error occurred while saving the vouchers.');
        } else {
          console.log(`${newVouchers.length} vouchers added for ${category}.`);
          alert(`${newVouchers.length} voucher(s) successfully loaded for ${category}!`);
        }
      });
    });
  }

  /**
   * Hides the main view and displays the voucher list view.
   * @param {string} category The category to display vouchers for.
   */
  function showVoucherView(category) {
    mainView.style.display = 'none';
    voucherView.style.display = 'block';

    const storageKey = `${category}_vouchers`;
    const categoryName = category.charAt(0).toUpperCase() + category.slice(1);

    // Create header for the voucher view
    let viewHTML = `
      <div class="voucher-view-header">
        <h3>${categoryName} Vouchers</h3>
        <button class="action-btn back-btn">Back</button>
      </div>
    `;

    chrome.storage.local.get([storageKey], function(result) {
      const vouchers = result[storageKey];
      if (vouchers && vouchers.length > 0) {
        viewHTML += createVoucherTable(vouchers);
      } else {
        viewHTML += '<p id="no-vouchers-message">No vouchers found for this category.</p>';
      }
      voucherView.innerHTML = viewHTML;
    });
  }

  /**
   * Hides the voucher view and displays the main view.
   */
  function showMainView() {
    voucherView.style.display = 'none';
    mainView.style.display = 'block';
    voucherView.innerHTML = ''; // Clear the view to free up memory
  }

  /**
   * Creates the HTML table for displaying vouchers.
   * @param {Array<Object>} vouchers The array of voucher objects.
   * @returns {string} The HTML string for the table.
   */
  function createVoucherTable(vouchers) {
    let tableHTML = `<table><thead><tr>
        <th>Code</th>
        <th>Pin</th>
        <th>Value</th>
      </tr></thead><tbody>`;

    vouchers.forEach(voucher => {
      tableHTML += `<tr><td>${voucher.VoucherCode || 'N/A'}</td><td>${voucher.VoucherPin || 'N/A'}</td><td>${voucher.VoucherValue || 'N/A'}</td></tr>`;
    });

    tableHTML += `</tbody></table>`;
    return tableHTML;
  }
});