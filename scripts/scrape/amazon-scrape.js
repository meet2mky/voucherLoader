/**
 * Injected function that contains the logic for scraping Amazon vouchers from a Gmail email body.
 * This function is executed in the context of the Gmail page.
 * @returns {{vouchers: Array<Object>|null, error: string|null}}
 */
export const amazonScrapeLogic = function() {
  // Gmail can have multiple email bodies in a thread view. Select all of them.
  const emailBodies = document.querySelectorAll('.a3s, .ii.gt');
  if (!emailBodies || emailBodies.length === 0) {
    return { vouchers: null, error: 'Could not find any email body content. The Gmail page structure might have changed.' };
  }

  const vouchers = [];
  const foundVoucherCodes = new Set();

  // Add parser objects here for different Amazon email formats.
  const parsers = [
    // --- EXAMPLE: Add a parser for an Amazon gift card format below ---
    // {
    //   regex: /Gift Card Claim Code:\s*([A-Z0-9-]+)/gs,
    //   mapper: (match) => ({
    //     VoucherCode: match[1].trim(),
    //     VoucherPin: null, // Amazon gift cards usually don't have a PIN
    //     VoucherValue: 'N/A', // Value might not be in the same text block
    //   }),
    // },
  ];

  for (const emailBody of emailBodies) {
    const text = emailBody.innerText;
    for (const parser of parsers) {
      parser.regex.lastIndex = 0;
      let match;
      while ((match = parser.regex.exec(text)) !== null) {
        const voucher = parser.mapper(match);
        if (voucher.VoucherCode && !foundVoucherCodes.has(voucher.VoucherCode)) {
          vouchers.push(voucher);
          foundVoucherCodes.add(voucher.VoucherCode);
        }
      }
    }
  }

  if (vouchers.length === 0) {
    // Updated error message for Amazon
    return { vouchers: null, error: 'No Amazon vouchers found in this conversation. The scraping logic may need to be implemented or updated.' };
  }

  return { vouchers, error: null };
};