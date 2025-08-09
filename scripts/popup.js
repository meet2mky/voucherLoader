document.addEventListener('DOMContentLoaded', function() {
  // DOM Elements
  const categoryItems = document.querySelectorAll('.category-item');
  const actionContainers = document.querySelectorAll('.action-container');
  const appContainer = document.getElementById('app-container');
  const mainView = document.getElementById('main-view');
  const voucherView = document.getElementById('voucher-view');

  // State
  let activeCategory = null;

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

    if (target.matches('.file-btn')) {
      console.log(`File load for ${activeCategory} triggered.`);
      handleFileUpload(activeCategory);
    }

    if (target.matches('.back-btn')) {
      showMainView();
    }
  });

  /**
   * Handles the entire file upload and processing flow.
   * @param {string} category The currently active category.
   */
  function handleFileUpload(category) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv, text/csv'; // Accept only CSV files

    input.onchange = e => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = event => {
        const csvText = event.target.result;
        try {
          const newVouchers = parseCSV(csvText);
          if (newVouchers.length > 0) {
            addVouchersToStorage(category, newVouchers);
          } else {
            alert('No valid vouchers found in the file. Please ensure the file is not empty and has the correct format (VoucherCode,VoucherPin,VoucherValue).');
          }
        } catch (error) {
          console.error('Error parsing CSV:', error);
          alert(`Failed to parse the CSV file. Please ensure it is correctly formatted.\nError: ${error.message}`);
        }
      };
      reader.onerror = () => {
        console.error('Error reading file:', reader.error);
        alert('An error occurred while reading the file.');
      };
      reader.readAsText(file);
    };

    input.click(); // Programmatically open the file dialog
  }

  /**
   * Parses a CSV string into an array of voucher objects.
   * Assumes the format: VoucherCode,VoucherPin,VoucherValue
   * Skips the first line as a header.
   * @param {string} csvText The raw text content of the CSV file.
   * @returns {Array<Object>} An array of voucher objects.
   */
  function parseCSV(csvText) {
    const vouchers = [];
    const lines = csvText.trim().split(/\r?\n/);

    // Start from the second line (index 1) to skip the header
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line) {
        const columns = line.split(',');
        if (columns.length === 3) {
          vouchers.push({
            VoucherCode: columns[0].trim(),
            VoucherPin: columns[1].trim(),
            VoucherValue: columns[2].trim()
          });
        } else {
          console.warn(`Skipping malformed row (expected 3 columns): "${line}"`);
        }
      }
    }
    return vouchers;
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