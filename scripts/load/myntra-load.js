/**
 * Injected function that contains the logic for adding a Myntra voucher on the website.
 * This function is executed in the context of the web page, not the extension's popup.
 * @param {string} voucherCode The voucher code.
 * @param {string} voucherPin The voucher PIN.
 * @returns {Promise<{success: boolean, message: string}>}
 */
export const myntraLoadLogic = async function(voucherCode, voucherPin) {
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
};