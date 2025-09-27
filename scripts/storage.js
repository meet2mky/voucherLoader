/**
 * This module provides a promise-based API for interacting with chrome.storage.local,
 * abstracting away the details of voucher storage and retrieval.
 */
import { displayMessage } from './ui.js';

/**
 * Retrieves vouchers for a specific category.
 * @param {string} category The category of vouchers to retrieve.
 * @returns {Promise<Array<Object>>} A promise that resolves with the array of vouchers.
 */
export function getVouchers(category) {
  return new Promise((resolve) => {
    const storageKey = `${category}_vouchers`;
    chrome.storage.local.get([storageKey], (result) => {
      resolve(result[storageKey] || []);
    });
  });
}

/**
 * Saves a list of vouchers for a specific category, overwriting existing data.
 * @param {string} category The category of vouchers to save.
 * @param {Array<Object>} vouchers The array of vouchers to save.
 * @returns {Promise<void>} A promise that resolves when saving is complete or rejects on error.
 */
export function saveVouchers(category, vouchers) {
  return new Promise((resolve, reject) => {
    const storageKey = `${category}_vouchers`;
    chrome.storage.local.set({ [storageKey]: vouchers }, () => {
      if (chrome.runtime.lastError) {
        console.error('Error saving vouchers:', chrome.runtime.lastError);
        return reject(chrome.runtime.lastError);
      }
      resolve();
    });
  });
}

/**
 * Appends new, unique vouchers to the existing list in chrome.storage.
 * @param {string} category The category to which the vouchers belong.
 * @param {Array<Object>} newVouchers The new vouchers to add.
 */
export async function addVouchers(category, newVouchers) {
  try {
    const existingVouchers = await getVouchers(category);
    const existingVoucherCodes = new Set(existingVouchers.map(v => v.VoucherCode));

    const uniqueNewVouchers = newVouchers
      .filter(v => !existingVoucherCodes.has(v.VoucherCode))
      .map(v => ({ ...v, status: 'AVAILABLE' }));
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
    await saveVouchers(category, combinedVouchers);

    let message = `${uniqueNewVouchers.length} new voucher(s) successfully added for ${category}!`;
    if (duplicatesFound > 0) {
      message += `\n${duplicatesFound} duplicate(s) were ignored.`;
    }
    displayMessage(message, 'success');
  } catch (error) {
    displayMessage('An error occurred while saving the vouchers.', 'error');
  }
}

/**
 * Clears all vouchers for a specific category.
 * @param {string} category The category to clear.
 * @returns {Promise<void>}
 */
export async function clearVouchers(category) {
  await saveVouchers(category, []);
  displayMessage(`${category} vouchers have been cleared successfully.`, 'success');
  console.log(`${category} vouchers cleared.`);
}