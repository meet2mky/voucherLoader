/**
 * Injected function that contains the logic for scraping Myntra vouchers from a Gmail email body.
 * This function is executed in the context of the Gmail page.
 * @returns {{vouchers: Array<Object>|null, error: string|null}}
 */
export const myntraScrapeLogic = function() {
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
};