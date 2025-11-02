/**
 * Centralized configuration for the voucherLoader extension.
 * This file consolidates all brand-specific URLs, and logic handlers.
 * To add a new brand, you only need to add a new entry here and create the corresponding logic files.
 */

// Import logic modules
import { myntraLoadLogic } from './load/myntra-load.js';
import { amazonLoadLogic } from './load/amazon-load.js';
import { myntraScrapeLogic } from './scrape/myntra-scrape.js';
import { amazonScrapeLogic } from './scrape/amazon-scrape.js';
import { myntraBalanceLogic } from './balance/myntra-balance.js';
import { amazonBalanceLogic } from './balance/amazon-balance.js';

export const brandConfig = {
  myntra: {
    url: 'https://www.myntra.com/',
    loadUrl: 'https://www.myntra.com/my/myntracredit',
    loadLogic: myntraLoadLogic,
    scrapeLogic: myntraScrapeLogic,
    balanceLogic: myntraBalanceLogic,
  },
  amazon: {
    url: 'https://www.amazon.in/',
    loadUrl: 'https://www.amazon.in/gp/aw/ya/gcb',
    loadLogic: amazonLoadLogic,
    scrapeLogic: amazonScrapeLogic,
    balanceLogic: amazonBalanceLogic,
  },
};

export const GMAIL_URL = 'https://mail.google.com/';