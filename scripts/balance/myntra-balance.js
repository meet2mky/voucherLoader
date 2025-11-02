/**
 * Injected function that contains the logic for retrieving the Myntra account balance.
 * This function is executed in the context of the Myntra website.
 * @returns {Promise<number>} The balance as a number, or -1 on error.
 */
export const myntraBalanceLogic = async function() {
  try {
    // The balance is typically inside an element with class 'balance-amount'.
    const balanceElement = document.querySelector('.balance-amount');

    if (!balanceElement) {
      console.error('Myntra Balance Error: Could not find the balance element with selector ".balance-amount".');
      return -1;
    }

    // The text content is usually in the format "₹ 1,000" or similar.
    const balanceText = balanceElement.textContent.trim();

    // Remove currency symbols (₹), commas, and whitespace to get a clean number string.
    const numericString = balanceText.replace(/[₹,\s]/g, '');
    const balance = parseFloat(numericString);

    if (isNaN(balance)) {
      console.error(`Myntra Balance Error: Failed to parse balance from text: "${balanceText}"`);
      return -1;
    }

    return balance;
  } catch (error) {
    console.error('Error retrieving Myntra balance:', error.message);
    return -1;
  }
};