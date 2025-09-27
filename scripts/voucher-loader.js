/**
 * This module handles the logic for loading vouchers onto a brand's website.
 */
import * as ui from './ui.js';
import * as storage from './storage.js';
import { brandConfig } from './config.js';
import * as tabManager from './tab-manager.js';

/**
 * Orchestrates the process of loading all available vouchers for a given brand onto the active tab.
 * @param {string} brand The brand category (e.g., 'myntra').
 * @param {HTMLButtonElement} button The button that triggered the action, used for UI feedback.
 */
export async function loadVouchersForBrand(brand, button) {
  const tab = await tabManager.getActiveTab();

  if (!tab) {
    return; // Error message is handled by getActiveTab
  }

  if (!tab.url || !tab.url.startsWith(brandConfig[brand].url)) {
    ui.displayMessage(`Please navigate to the ${brand} website and try again.`, 'error');
    return;
  }

  if (!tab.url.startsWith(brandConfig[brand].loadUrl)) {
    ui.displayMessage(`Please open the correct voucher loading page for ${brand} and try again.`, 'error');
    return;
  }

  // Disable button and wrap main logic in try/finally to ensure it's re-enabled.
  button.disabled = true;
  try {
    const allVouchers = await storage.getVouchers(brand);
    const vouchersToLoad = allVouchers.filter(v => v.status !== 'REDEEMED');

    if (vouchersToLoad.length === 0) {
      ui.displayMessage(`No available vouchers to load for ${brand}.`, 'info');
      return; // finally will re-enable the button
    }

    button.textContent = 'Reloading page...';

    try {
      await tabManager.reloadTabAndWait(tab.id);
    } catch (error) {
      console.error('Failed to reload tab:', error);
      ui.displayMessage('The page failed to reload correctly. Please try again.', 'error');
      return; // finally will re-enable the button
    }

    ui.displayMessage(`Starting to load ${vouchersToLoad.length} available vouchers for ${brand}...`, 'info');
    const loadLogic = brandConfig[brand].loadLogic;
    if (!loadLogic) {
      ui.displayMessage(`No loading logic defined for ${brand}.`, 'error');
      return; // finally will re-enable the button
    }

    let successfulLoads = 0;
    let failedLoads = 0;

    button.textContent = 'Loading...';

    let i = 0;
    for (const voucher of vouchersToLoad) {
      try {
        const [injectionResult] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: loadLogic,
          args: [voucher.VoucherCode, voucher.VoucherPin],
        });

        const result = injectionResult.result;
        if (result && result.success) {
          successfulLoads++;
          voucher.status = 'REDEEMED';
        } else {
          failedLoads++;
          voucher.status = 'ERROR';
          const errorMessage = result ? result.message : 'An unknown error occurred.';
          ui.displayMessage(`Failed on voucher ${voucher.VoucherCode}: ${errorMessage}`, 'error', 6000);
          console.error(`Voucher loading failed for ${voucher.VoucherCode}:`, result);
        }

        await new Promise(resolve => setTimeout(resolve, 4000));
      } catch (error) {
        failedLoads++;
        voucher.status = 'ERROR'; // Also set status on critical error
        console.error(`Error injecting script for voucher ${voucher.VoucherCode}:`, error);
        ui.displayMessage(`A critical error occurred while loading voucher ${voucher.VoucherCode}. Aborting.`, 'error', 8000);
        break;
      }
      i++;
      button.textContent = `Loading... (${i}/${vouchersToLoad.length})`;
      await tabManager.reloadTabAndWait(tab.id);
    }

    await storage.saveVouchers(brand, allVouchers);
    ui.displayMessage(`Voucher loading complete. Success: ${successfulLoads}, Failed: ${failedLoads}`, 'info', 8000);
  } catch (error) {
    console.error('Error during voucher loading process:', error);
    ui.displayMessage('A critical error occurred during the loading process.', 'error');
  } finally {
    button.disabled = false;
    button.textContent = 'Load Vouchers';
  }
}