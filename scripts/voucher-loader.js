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
 * @param {Function} [onProgress] Optional callback function to be called after each voucher is processed.
 */
export async function loadVouchersForBrand(brand, button, onProgress) {
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
    const balanceLogic = brandConfig[brand].balanceLogic;
    if (!loadLogic) {
      ui.displayMessage(`No loading logic defined for ${brand}.`, 'error');
      return; // finally will re-enable the button
    }

    let successfulLoads = 0;
    let failedLoads = 0;

    button.textContent = 'Loading...';

    let i = 0;
    for (const voucher of vouchersToLoad) {
      i++;
      button.textContent = `Loading... (${i}/${vouchersToLoad.length})`;
      try {
        let balanceBefore = null;
        if (balanceLogic) {
          const [balanceResult] = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: balanceLogic,
          });
          if (balanceResult && balanceResult.result !== -1) {
            balanceBefore = balanceResult.result;
          } else {
            ui.displayMessage(`Could not get balance for ${brand} before applying voucher. Verification will be skipped.`, 'info');
          }
        }

        const [injectionResult] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: loadLogic,
          args: [voucher.VoucherCode, voucher.VoucherPin],
        });

        const submissionResult = injectionResult.result;
        if (submissionResult && submissionResult.success) {
          // Submission was successful, now verify with balance if possible.
          if (balanceLogic && balanceBefore !== null) {
            // Wait for balance to update on the page.
            await new Promise(resolve => setTimeout(resolve, 3000));

            const [balanceResult] = await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              func: balanceLogic,
            });

            if (balanceResult && balanceResult.result !== -1) {
              const balanceAfter = balanceResult.result;
              const voucherValue = parseFloat(voucher.VoucherValue);
              const balanceDiff = balanceAfter - balanceBefore;

              if (Math.abs(balanceDiff - voucherValue) < 0.01) {
                successfulLoads++;
                voucher.status = 'REDEEMED';
              } else {
                failedLoads++;
                voucher.status = 'ERROR';
                ui.displayMessage(`Voucher ${voucher.VoucherCode} applied, but balance check failed. Expected: ${voucherValue.toFixed(2)}, Found: ${balanceDiff.toFixed(2)}`, 'error', 8000);
              }
            } else {
              // Could not get balance after. Trust submission but warn user.
              successfulLoads++;
              voucher.status = 'REDEEMED';
              ui.displayMessage(`Voucher ${voucher.VoucherCode} submitted, but could not verify balance change. Please check manually.`, 'info', 8000);
            }
          } else {
            successfulLoads++;
            voucher.status = 'REDEEMED';
          }
        } else {
          failedLoads++;
          voucher.status = 'ERROR';
          const errorMessage = submissionResult ? submissionResult.message : 'An unknown error occurred.';
          ui.displayMessage(`Failed on voucher ${voucher.VoucherCode}: ${errorMessage}`, 'error', 6000);
          console.error(`Voucher loading failed for ${voucher.VoucherCode}:`, submissionResult);
        }

        // Save progress to storage immediately after processing each voucher.
        await storage.saveVouchers(brand, allVouchers);
        // If a progress callback is provided, call it to update the UI.
        if (onProgress) {
          await onProgress();
        }

        // Wait for a period with jitter to mimic more human-like behavior and
        // allow the website to process the submission before the next one.
        const waitTime = 5000 + Math.random() * 2000; // 5-7 seconds
        await new Promise(resolve => setTimeout(resolve, waitTime));

      } catch (error) {
        failedLoads++;
        voucher.status = 'ERROR'; // Also set status on critical error
        console.error(`Error injecting script for voucher ${voucher.VoucherCode}:`, error);
        ui.displayMessage(`A critical error occurred while loading voucher ${voucher.VoucherCode}. Aborting.`, 'error', 8000);
        break;
      }
    }

    ui.displayMessage(`Voucher loading complete. Success: ${successfulLoads}, Failed: ${failedLoads}.`, 'info', 8000);
  } catch (error) {
    console.error('Error during voucher loading process:', error);
    ui.displayMessage('A critical error occurred during the loading process.', 'error');
  } finally {
    button.disabled = false;
    button.textContent = 'Load Vouchers';
  }
}