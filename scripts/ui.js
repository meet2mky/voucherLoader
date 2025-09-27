/**
 * This module handles all UI-related functions for the extension popup,
 * such as displaying messages, switching views, and rendering data.
 */

/**
 * Displays a message in the popup.
 * @param {string} message The message to display.
 * @param {'success'|'error'|'info'} type The type of message.
 * @param {number} duration How long to display the message in ms. Default 5000.
 */
export function displayMessage(message, type, duration = 5000) {
  const messageContainer = document.getElementById('popup-message-container');
  if (!messageContainer) return;

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
      <th>Status</th>
    </tr></thead><tbody>`;

  vouchers.forEach(voucher => {
    const status = voucher.status || 'AVAILABLE'; // Default for old data
    const statusClass = `status-${status.toLowerCase()}`;
    tableHTML += `<tr>
      <td>${voucher.VoucherCode || 'N/A'}</td>
      <td>${voucher.VoucherPin || 'N/A'}</td>
      <td>${voucher.VoucherValue || 'N/A'}</td>
      <td>${voucher.ExpiryDate || 'N/A'}</td>
      <td class="${statusClass}">${status}</td>
    </tr>`;
  });

  tableHTML += `</tbody></table>`;
  return tableHTML;
}

/**
 * Hides the main view and displays the voucher list view.
 * @param {string} category The category to display vouchers for.
 * @param {Array<Object>} vouchers The list of vouchers to display.
 */
export function showVoucherView(category, vouchers) {
  const mainView = document.getElementById('main-view');
  const voucherView = document.getElementById('voucher-view');
  if (!mainView || !voucherView) return;

  mainView.style.display = 'none';
  voucherView.style.display = 'block';

  const categoryName = category.charAt(0).toUpperCase() + category.slice(1);

  let viewHTML = `
    <div class="voucher-view-header">
      <h3>${categoryName} Vouchers</h3>
      <button class="action-btn back-btn">Back</button>
    </div>
  `;

  viewHTML += (vouchers && vouchers.length > 0)
    ? createVoucherTable(vouchers)
    : '<p id="no-vouchers-message">No vouchers found for this category.</p>';

  voucherView.innerHTML = viewHTML;
}

/**
 * Hides the voucher view and displays the main view.
 */
export function showMainView() {
  const mainView = document.getElementById('main-view');
  const voucherView = document.getElementById('voucher-view');
  if (!mainView || !voucherView) return;

  voucherView.style.display = 'none';
  mainView.style.display = 'block';
  voucherView.innerHTML = ''; // Clear the view to free up memory
}