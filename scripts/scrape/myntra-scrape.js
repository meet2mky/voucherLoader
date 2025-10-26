/**
 * Injected function that contains the logic for scraping Myntra vouchers from a Gmail email body.
 * This function is executed in the context of the Gmail page.
 * @returns {{vouchers: Array<Object>|null, error: string|null}}
 */
export const myntraScrapeLogic = function() {
  // Gmail can have multiple email bodies in a thread view. Select all of them.
  const emailBodies = document.querySelectorAll('.a3s, .ii.gt');
  if (!emailBodies || emailBodies.length === 0) {
    return { vouchers: null, error: 'Could not find any email body content. The Gmail page structure might have changed.' };
  }

  const vouchers = [];
  const foundVoucherCodes = new Set(); // Use a Set to track codes and prevent duplicates.

  // An array of parser objects. Each object has a regex and a function to map the result.
  // You can add more parsers here for different email formats.
  const parsers = [
    {
      // ISHOP Voucher format.
      // Voucher Code: 6001220328073412
      // Pin: 174057
      // Denomination: 1000.0
      // This regex is now more specific, looking for a 16-digit code and 6-digit PIN.
      regex: /Voucher Code:\s*(\d{16})\s*Pin:\s*(\d{6})\s*Denomination:\s*([\d,.]+)/g,
      mapper: (match) => ({
        VoucherCode: match[1].trim(),
        VoucherPin: match[2].trim(),
        VoucherValue: match[3].trim().replace(/,/g, ''),
      }),
    },
    {
      // MAXIMIZE Voucher format.
      // Myntra E Gift Card
      // ₹2500.00
      // E-Gift Card Number
      // 6001220432434739
      // PIN
      // 147294
      regex: /₹\s*([\d,.]+)\s*E-Gift Card Number\s*(\d{16})\s*PIN\s*(\d{6})/g,
      mapper: (match) => ({
        VoucherCode: match[2].trim(),
        VoucherPin: match[3].trim(),
        VoucherValue: match[1].trim().replace(/,/g, ''),
      }),
    },
    {
      // Gyfter Voucher format
      // E-Gift Card Code
      // 6001220283335400
      // Value
      // 500
      // PIN
      // 162383
      regex: /E-Gift Card Code\s+(\d{16})\s+Value\s+([\d,.]+)\s+PIN\s+(\d{6})/g,
      mapper: (match) => ({
        VoucherCode: match[1].trim(),
        VoucherPin: match[3].trim(),
        VoucherValue: match[2].trim().replace(/,/g, ''),
      }),
    },
  ];

  for (const emailBody of emailBodies) {
    const text = emailBody.innerText;
    for (const parser of parsers) {
      // We must reset lastIndex for global regexes before each new execution loop.
      parser.regex.lastIndex = 0;
      let match;
      while ((match = parser.regex.exec(text)) !== null) {
        const voucher = parser.mapper(match);
        // Check if we've already found this voucher to avoid duplicates
        if (voucher.VoucherCode && !foundVoucherCodes.has(voucher.VoucherCode)) {
          vouchers.push(voucher);
          foundVoucherCodes.add(voucher.VoucherCode);
        }
      }
    }
  }

  if (vouchers.length === 0) {
    return { vouchers: null, error: 'No vouchers found matching any of the expected formats in this conversation.' };
  }

  return { vouchers, error: null };
};