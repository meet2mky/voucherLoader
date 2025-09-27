/**
 * Injected function that contains the logic for adding an Amazon voucher on the website.
 * This function is executed in the context of the web page, not the extension's popup.
 * @param {string} voucherCode The voucher code.
 * @returns {Promise<{success: boolean, message: string}>}
 */
export const amazonLoadLogic = async function(voucherCode) {
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
};