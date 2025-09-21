document.addEventListener('DOMContentLoaded', function() {
  // DOM Elements
  const categoryItems = document.querySelectorAll('.category-item');
  const actionContainers = document.querySelectorAll('.action-container');
  const appContainer = document.getElementById('app-container');
  const mainView = document.getElementById('main-view');
  const voucherView = document.getElementById('voucher-view');

  // Create a new container for messages and append it to the app container
  const messageContainer = document.createElement('div');
  messageContainer.id = 'popup-message-container';
  appContainer.appendChild(messageContainer);

  /**
   * Displays a message in the popup.
   * @param {string} message The message to display.
   * @param {'success'|'error'|'info'} type The type of message.
   * @param {number} duration How long to display the message in ms. Default 5000.
   */
  function displayMessage(message, type, duration = 5000) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `popup-message ${type}`;
    msgDiv.textContent = message;
    messageContainer.appendChild(msgDiv);

    // Show and then hide
    setTimeout(() => msgDiv.classList.add('show'), 10); // Small delay for CSS transition

    setTimeout(() => {
      msgDiv.classList.remove('show');
      msgDiv.addEventListener('transitionend', () => msgDiv.remove());
    }, duration);
  }

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
   * These functions are executed in the context of the web page, not the extension's popup.
   */
  const BRAND_LOAD_LOGIC = {
    myntra: async function(voucherCode, voucherPin) {
      // Helper function to create a delay, allowing the page to react.
      const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

      try {
        // Step 1: Click the button to reveal the gift card input form..
        const openFormButton = document.querySelector('.balance-giftCardButton');
        if (!openFormButton) {
          return { success: false, message: 'Could not find the initial "Add Gift Card" button.' };
        }
        openFormButton.click();
        await sleep(1000);

        // Step 2: Find the actual input fields and fill them.
        const codeInput = document.querySelector('input[name="gcnumber"]');
        const pinInput = document.querySelector('input[name="gcpin"]');
        if (!codeInput || !pinInput) {
          return { success: false, message: 'Could not find voucher input fields after clicking.' };
        }

        // Step 3: Fill the inputs.
        codeInput.value = voucherCode;
        codeInput.dispatchEvent(new Event('input', { bubbles: true }));
        pinInput.value = voucherPin;
        pinInput.dispatchEvent(new Event('input', { bubbles: true }));
        await sleep(500);

        // Step 4: Click the final button.
        const finalAddButton = document.querySelector('.addCard-showButton');
        if (!finalAddButton) {
          return { success: false, message: 'Could not find the final "Add to Account" button.' };
        }
        finalAddButton.click();
        return { success: true, message: `Voucher ${voucherCode} submitted.` };
      } catch (error) {
        return { success: false, message: `An unexpected error occurred: ${error.message}` };
      }
    },
    amazon: async function(voucherCode) {
      // NOTE: This logic is a placeholder and may need adjustment for the live site.
      try {
        const codeInput = document.querySelector('input#gc-redemption-input');
        const addButton = document.querySelector('input[name*="add-to-balance"]');

        if (!codeInput || !addButton) {
          return { success: false, message: 'Could not find the gift card input field or button.' };
        }

        codeInput.value = voucherCode;
        codeInput.dispatchEvent(new Event('input', { bubbles: true }));
        addButton.click();
        return { success: true, message: `Voucher ${voucherCode} submitted.` };
      } catch (error) {
        return { success: false, message: `An unexpected error occurred: ${error.message}` };
      }
    }
  };

  /**
   * A map of injectable functions that contain the logic for scraping vouchers from Gmail for each brand.
   * These functions are executed in the context of the Gmail page.
   */
  const BRAND_SCRAPE_LOGIC = {
    myntra: function() {
      // Gmail's email body is often in a div with class 'a3s' or 'ii gt'.
      const emailBody = document.querySelector('.a3s, .ii.gt');
      if (!emailBody) {
        return { vouchers: null, error: 'Could not find the email body content. The Gmail page structure might have changed.' };
      }

      const text = emailBody.innerText;
      const vouchers = [];

      // This regex is designed to find all voucher blocks from iShop emails.
      const voucherRegex = /Voucher Code:\s*(\S+)\s*Pin:\s*(\S+)\s*Denomination:\s*([\d,.]+)\s*Date of Expiry:\s*(.*?)(?=\s*Click here|\s*Voucher Code:|$)/gs;

      let match;
      while ((match = voucherRegex.exec(text)) !== null) {
        vouchers.push({
          VoucherCode: match[1].trim(),
          VoucherPin: match[2].trim(),
          VoucherValue: match[3].trim().replace(/,/g, ''),
          ExpiryDate: match[4].trim()
        });
      }

      if (vouchers.length === 0) {
        return { vouchers: null, error: 'No vouchers found matching the expected iShop format (e.g., "Voucher Code: ... Pin: ...").' };
      }

      return { vouchers, error: null };
    },
    amazon: function() {
      // Placeholder for future Amazon-specific scraping logic
      return { vouchers: null, error: 'Scraping logic for Amazon is not yet implemented.' };
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
          displayMessage('Could not find the active tab.', 'error');
          return;
        }
        tab = tabs[0];
      } catch (error) {
        displayMessage('Could not get tab details. The tab may have been closed.', 'error');
        return;
      }

      if (!tab) {
        displayMessage('Could not get tab details. The tab may have been closed.', 'error');
        return;
      }

      if (!tab.url || !tab.url.startsWith(BRAND_URL_MAP[brand])) {
        displayMessage('Please navigate to Myntra and try again.', 'error');
        return;
      }

      if (!tab.url.startsWith(BRAND_LOAD_URL_MAP[brand])) {
        displayMessage(`Please open the Myntra Credit page and try again.`, 'error');
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
        displayMessage('The page failed to reload correctly. Please try again.', 'error');
        button.disabled = false;
        button.textContent = 'Load Vouchers';
        return;
      }

      const storageKey = `${brand}_vouchers`;
      chrome.storage.local.get([storageKey], async (result) => {
        const vouchers = result[storageKey];

        if (!vouchers || vouchers.length === 0) {
          displayMessage(`No vouchers found for ${brand}. Please import vouchers first.`, 'error');
          button.disabled = false;
          button.textContent = 'Load Vouchers';
          return;
        }
        
        displayMessage(`Starting to load ${vouchers.length} vouchers for ${brand}...`, 'info');
        const loadLogic = BRAND_LOAD_LOGIC[brand];
        if (!loadLogic) {
          displayMessage(`No loading logic defined for ${brand}.`, 'error');
          button.disabled = false;
          button.textContent = 'Load Vouchers';
          return;
        }

        let successfulLoads = 0;
        let failedLoads = 0;

        // Disable the button to prevent multiple clicks during operation
        button.textContent = 'Loading...';

        let i = 0;
        for (const voucher of vouchers) {
          try {
            const [injectionResult] = await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              func: loadLogic,
              args: [voucher.VoucherCode, voucher.VoucherPin], // Pass voucher data as arguments
            });

            // Check the return value from our injected script
            const result = injectionResult.result;
            if (result && result.success) {
              successfulLoads++;
            } else {
              failedLoads++;
              const errorMessage = result ? result.message : 'An unknown error occurred.';
              displayMessage(`Failed on voucher ${voucher.VoucherCode}: ${errorMessage}`, 'error', 6000);
              console.error(`Voucher loading failed for ${voucher.VoucherCode}:`, result);
            }

            // Wait for a moment to let the page process the submission (e.g., via AJAX)
            await new Promise(resolve => setTimeout(resolve, 4000)); // 4-second delay
          } catch (error) {
            failedLoads++;
            console.error(`Error injecting script for voucher ${voucher.VoucherCode}:`, error);
            displayMessage(`A critical error occurred while loading voucher ${voucher.VoucherCode}. Aborting.`, 'error', 8000);
            break; // Stop the loop if a critical error occurs
          }
          i++;
          button.textContent = `Loading... (${i}/${vouchers.length})`;
          await reloadTabAndWait(tab.id);
        }
        // Re-enable the button and provide a summary
        button.disabled = false;
        button.textContent = 'Load Vouchers';
        displayMessage(`Voucher loading complete. Success: ${successfulLoads}, Failed: ${failedLoads}`, 'info', 8000);
      });
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
          displayMessage(`${activeCategory} vouchers have been cleared successfully.`, 'success');
          console.log(`${activeCategory} vouchers cleared.`);
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
  async function handleGmailImport(category) {
    let tab;
    try {
      // When used as a side panel or popup, we must query for the active tab.
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabs || tabs.length === 0) {
        displayMessage('Could not find the active tab.', 'error');
        return;
      }
      tab = tabs[0];
    } catch (error) {
      displayMessage('Could not get tab details. The tab may have been closed.', 'error');
      return;
    }

    if (!tab) {
      displayMessage('Could not get tab details. The tab may have been closed.', 'error');
      return;
    }

    if (!tab.url || !tab.url.startsWith(GMAIL_URL)) {
      displayMessage('Please navigate to Gmail and try again, current url is: ' + tab.url,  'error');
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
          displayMessage(`No scraping logic defined for ${category}.`, 'error');
          return;
        }

        const [scrapeInjectionResult] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: scrapeLogic,
        });

        if (!scrapeInjectionResult || !scrapeInjectionResult.result) {
          displayMessage('Scraping failed: Did not get a result from the page.', 'error');
          return;
        }

        const { vouchers, error } = scrapeInjectionResult.result;

        if (error) {
          displayMessage(`Scraping failed: ${error}`, 'error');
        } else if (vouchers && vouchers.length > 0) {
          console.log('Scraped vouchers:', vouchers);
          addVouchersToStorage(category, vouchers);
        } else {
          displayMessage('No vouchers were found in the email.', 'error');
        }
      } else {
        displayMessage('No email is currently open for reading. Please open an email and try again.', 'error');
      }
    } catch (error) {
      console.error('Failed to inject script:', error);
      displayMessage('Could not check the Gmail tab. Please reload the tab and try again.', 'error');
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

  

  /**
   * Appends new, unique vouchers to the existing list in chrome.storage.
   * @param {string} category The category to which the vouchers belong.
   * @param {Array<Object>} newVouchers The new vouchers to add.
   */
  function addVouchersToStorage(category, newVouchers) {
    const storageKey = `${category}_vouchers`;
    chrome.storage.local.get([storageKey], result => {
      const existingVouchers = result[storageKey] || [];

      // Create a Set of existing voucher codes for efficient O(1) lookups.
      const existingVoucherCodes = new Set(existingVouchers.map(v => v.VoucherCode));

      // Filter out any new vouchers that already exist in storage.
      const uniqueNewVouchers = newVouchers.filter(v => !existingVoucherCodes.has(v.VoucherCode));
      const duplicatesFound = newVouchers.length - uniqueNewVouchers.length;

      if (uniqueNewVouchers.length === 0) {
        let message = `No new vouchers to add for ${category}.`;
        if (duplicatesFound > 0) {
          message += ` ${duplicatesFound} duplicate(s) were found and ignored.`;
        }
        displayMessage(message, 'info');
        return;
      }

      const combinedVouchers = existingVouchers.concat(uniqueNewVouchers);

      chrome.storage.local.set({ [storageKey]: combinedVouchers }, () => {
        if (chrome.runtime.lastError) {
          console.error('Error saving vouchers:', chrome.runtime.lastError);
          displayMessage('An error occurred while saving the vouchers.', 'error');
        } else {
          let message = `${uniqueNewVouchers.length} new voucher(s) successfully added for ${category}!`;
          if (duplicatesFound > 0) {
            message += `\n${duplicatesFound} duplicate(s) were ignored.`;
          }
          displayMessage(message, 'success');
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
        <th>Expiry</th>
      </tr></thead><tbody>`;

    vouchers.forEach(voucher => {
      tableHTML += `<tr><td>${voucher.VoucherCode || 'N/A'}</td><td>${voucher.VoucherPin || 'N/A'}</td><td>${voucher.VoucherValue || 'N/A'}</td><td>${voucher.ExpiryDate || 'N/A'}</td></tr>`;
    });

    tableHTML += `</tbody></table>`;
    return tableHTML;
  }
});