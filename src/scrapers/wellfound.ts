import * as cheerio from 'cheerio';
import { Job } from '../types.js';
import { log, sleep } from '../config.js';

const BASE_URL = 'https://wellfound.com';
const ROLE = 'software-engineer';
const PAGES_TO_SCRAPE = 3;
const DELAY_MS = 2500;

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'Cache-Control': 'max-age=0',
};

// Browser-side script to extract job data from rendered DOM
const BROWSER_SCRAPE_SCRIPT = `
(() => {
  const results = [];
  const cards = document.querySelectorAll('[data-testid="startup-header"]');
  cards.forEach(header => {
    const card = header.closest('.mb-6');
    if (!card) return;
    const companyName = card.querySelector('h2.inline')?.textContent?.trim() || '';
    const desc = card.querySelector('[data-testid="startup-header"] span.text-xs.text-neutral-1000')?.textContent?.trim() || '';
    card.querySelectorAll('a[href*="/jobs/"]').forEach(jobEl => {
      const title = jobEl.textContent.trim();
      const href = jobEl.getAttribute('href') || '';
      const row = jobEl.closest('div')?.parentElement;
      const spans = row?.querySelectorAll('span.text-xs') || [];
      let type = '', salary = '', location = '', experience = '', postedAgo = '';
      const typeBadge = jobEl.closest('div')?.querySelector('span.rounded-lg, span.rounded-full');
      if (typeBadge) type = typeBadge.textContent.trim();
      spans.forEach(span => {
        const text = span.textContent.trim();
        if (text.includes('$') || text.includes('€') || text.includes('£')) salary = text;
        else if (text.includes('office') || text.includes('Remote') || text.includes('Hybrid') || /•\\s*[A-Z]/.test(text)) location = text;
        else if (text.includes('year') || text.includes('exp')) experience = text;
        else if (text.includes('ago') || text.includes('day') || text.includes('week') || text.includes('month')) postedAgo = text;
      });
      if (title) results.push({
        title, jobUrl: href.startsWith('http') ? href : 'https://wellfound.com' + href,
        type, salary, location, experience, postedAgo, companyName, companyDesc: desc
      });
    });
  });
  return results;
})();
`;

interface WellfoundJob {
  title: string;
  jobUrl: string;
  type: string;
  salary: string;
  location: string;
  experience: string;
  postedAgo: string;
  companyName: string;
  companyDesc: string;
}

function parseJobsPage(html: string): WellfoundJob[] {
  const $ = cheerio.load(html);
  const jobs: WellfoundJob[] = [];

  const companyCards = $('[data-testid="startup-header"]').closest('.mb-6');

  companyCards.each((_, card) => {
    const $card = $(card);

    const companyName = $card.find('h2.inline').first().text().trim()
      || $card.find('[data-testid="startup-header"] h2').text().trim();

    const companyDesc = $card.find('[data-testid="startup-header"] span.text-xs.text-neutral-1000')
      .first().text().trim();

    const jobLinks = $card.find('a[href*="/jobs/"]');

    jobLinks.each((_, jobEl) => {
      const $jobLink = $(jobEl);
      const title = $jobLink.text().trim();
      const href = $jobLink.attr('href') || '';
      const jobUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`;

      const $row = $jobLink.closest('div').parent();
      const spans = $row.find('span.text-xs');

      let type = '', salary = '', location = '', experience = '', postedAgo = '';

      const typeBadge = $jobLink.closest('div').find('span.rounded-lg, span.rounded-full').first();
      if (typeBadge.length) type = typeBadge.text().trim();

      spans.each((_, span) => {
        const text = $(span).text().trim();
        if (!text) return;
        if (text.includes('$') || text.includes('€') || text.includes('£')) salary = text;
        else if (text.includes('office') || text.includes('Remote') || text.includes('Hybrid') || /•\s*[A-Z]/.test(text)) location = text;
        else if (text.includes('year') || text.includes('exp')) experience = text;
        else if (text.includes('ago') || text.includes('day') || text.includes('week') || text.includes('month')) postedAgo = text;
      });

      if (title) {
        jobs.push({ title, jobUrl, type, salary, location, experience, postedAgo, companyName, companyDesc });
      }
    });
  });

  return jobs;
}

function parsePostedAgo(postedAgo: string): string | undefined {
  if (!postedAgo) return undefined;
  const now = new Date();
  const match = postedAgo.match(/(\d+)\s*(minute|hour|day|week|month)/i);
  if (!match) return undefined;

  const num = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  if (unit.startsWith('minute')) now.setMinutes(now.getMinutes() - num);
  else if (unit.startsWith('hour')) now.setHours(now.getHours() - num);
  else if (unit.startsWith('day')) now.setDate(now.getDate() - num);
  else if (unit.startsWith('week')) now.setDate(now.getDate() - num * 7);
  else if (unit.startsWith('month')) now.setMonth(now.getMonth() - num);

  return now.toISOString();
}

/**
 * Strategy 1: Direct HTTP with browser-like headers.
 * Works if DataDome doesn't block us.
 */
async function fetchPageHttp(page: number): Promise<WellfoundJob[]> {
  const url = page === 1 ? `${BASE_URL}/role/${ROLE}` : `${BASE_URL}/role/${ROLE}?page=${page}`;

  const res = await fetch(url, {
    headers: BROWSER_HEADERS,
    redirect: 'follow',
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const html = await res.text();
  return parseJobsPage(html);
}

/**
 * Strategy 2: Connect to a running Chrome via CDP (Chrome DevTools Protocol).
 * Bypasses DataDome since it uses a real browser session.
 * Start Chrome with: /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222
 */
async function fetchPagePuppeteer(browser: any, page: number): Promise<WellfoundJob[]> {
  const url = page === 1 ? `${BASE_URL}/role/${ROLE}` : `${BASE_URL}/role/${ROLE}?page=${page}`;

  const browserPage = await browser.newPage();
  try {
    await browserPage.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await browserPage.waitForSelector('[data-testid="startup-header"]', { timeout: 10000 });
    await sleep(1000);

    const jobs: WellfoundJob[] = await browserPage.evaluate(BROWSER_SCRAPE_SCRIPT);
    return jobs;
  } finally {
    await browserPage.close();
  }
}

async function connectToBrowser(): Promise<any> {
  try {
    const puppeteer = await import('puppeteer-core');
    const CDP_URLS = ['http://127.0.0.1:9222', 'http://localhost:9222'];

    for (const cdpUrl of CDP_URLS) {
      try {
        const browser = await puppeteer.default.connect({
          browserURL: cdpUrl,
          defaultViewport: null,
        });
        log('wellfound', `Connected to Chrome at ${cdpUrl}`);
        return browser;
      } catch {
        continue;
      }
    }
  } catch {
    // puppeteer-core not available
  }
  return null;
}

export async function scrapeWellfound(): Promise<Job[]> {
  log('wellfound', `Scraping Wellfound (role: ${ROLE}, pages: ${PAGES_TO_SCRAPE})...`);

  const allRawJobs: WellfoundJob[] = [];
  const seenUrls = new Set<string>();
  let usePuppeteer = false;
  let browser: any = null;

  // Try HTTP first on page 1
  try {
    const firstPageJobs = await fetchPageHttp(1);
    if (firstPageJobs.length > 0) {
      for (const j of firstPageJobs) {
        seenUrls.add(j.jobUrl);
        allRawJobs.push(j);
      }
      log('wellfound', `Page 1 (HTTP): ${firstPageJobs.length} jobs`);
    } else {
      throw new Error('No results from HTTP');
    }
  } catch (err: any) {
    log('wellfound', `HTTP blocked (${err.message}). Trying Puppeteer CDP...`);
    usePuppeteer = true;

    browser = await connectToBrowser();
    if (!browser) {
      log('wellfound', 'No Chrome with remote debugging found. To enable Wellfound scraping:');
      log('wellfound', '  Start Chrome: /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222');
      log('wellfound', '  Then re-run the scraper. Skipping Wellfound for now.');
      return [];
    }

    // Fetch page 1 via Puppeteer
    try {
      const firstPageJobs = await fetchPagePuppeteer(browser, 1);
      for (const j of firstPageJobs) {
        seenUrls.add(j.jobUrl);
        allRawJobs.push(j);
      }
      log('wellfound', `Page 1 (Puppeteer): ${firstPageJobs.length} jobs`);
    } catch (err2: any) {
      log('wellfound', `Puppeteer page 1 failed: ${err2.message}`);
      browser.disconnect();
      return [];
    }
  }

  // Scrape remaining pages
  for (let page = 2; page <= PAGES_TO_SCRAPE; page++) {
    try {
      let pageJobs: WellfoundJob[];

      if (usePuppeteer && browser) {
        pageJobs = await fetchPagePuppeteer(browser, page);
      } else {
        pageJobs = await fetchPageHttp(page);
      }

      for (const j of pageJobs) {
        if (!seenUrls.has(j.jobUrl)) {
          seenUrls.add(j.jobUrl);
          allRawJobs.push(j);
        }
      }

      log('wellfound', `Page ${page}: ${pageJobs.length} jobs`);
      if (pageJobs.length === 0) break;
      if (page < PAGES_TO_SCRAPE) await sleep(DELAY_MS);
    } catch (err: any) {
      log('wellfound', `Error on page ${page}: ${err.message}`);
      break;
    }
  }

  if (browser) browser.disconnect();

  // Convert to Job[] format
  const jobs: Job[] = allRawJobs.map(wj => ({
    title: wj.title,
    company: wj.companyName,
    description: [wj.companyDesc, wj.location, wj.experience, wj.type].filter(Boolean).join(' | '),
    url: wj.jobUrl,
    applyUrl: wj.jobUrl,
    source: 'wellfound' as const,
    salary: wj.salary || undefined,
    tags: [wj.type, wj.location].filter(Boolean),
    postedAt: parsePostedAgo(wj.postedAgo),
  }));

  log('wellfound', `Found ${jobs.length} jobs total`);
  return jobs;
}
