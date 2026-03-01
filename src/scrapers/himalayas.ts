import { Job } from '../types.js';
import { log, sleep } from '../config.js';

interface HimalayasJob {
  title: string;
  companyName: string;
  description: string;
  applicationLink: string;
  locationRestrictions: string[];
  categories: string[];
  parentCategories: string[];
  pubDate: number; // Unix timestamp in seconds
  minSalary?: number | null;
  maxSalary?: number | null;
  currency?: string;
  tags?: string[];
  guid?: string;
}

const DEV_KEYWORDS = [
  'engineer', 'developer', 'software', 'fullstack', 'full-stack', 'full stack',
  'frontend', 'front-end', 'backend', 'back-end', 'devops', 'dev ops',
  'web dev', 'programming', 'node', 'react', 'typescript', 'javascript',
  'python', 'golang', 'rust', 'java', 'sre', 'platform engineer',
];

function isSoftwareJob(title: string, categories: string[], parentCategories: string[]): boolean {
  const text = `${title} ${categories.join(' ')} ${parentCategories.join(' ')}`.toLowerCase();
  return DEV_KEYWORDS.some(kw => text.includes(kw));
}

const PAGES = 5;        // 5 pages x 20 = up to 100 jobs
const PAGE_SIZE = 20;   // API max per request
const PAGE_DELAY = 1000;

interface HimalayasResponse {
  jobs: HimalayasJob[];
  totalCount: number;
}

async function fetchPage(offset: number): Promise<HimalayasJob[]> {
  const res = await fetch(`https://himalayas.app/jobs/api?limit=${PAGE_SIZE}&offset=${offset}`, {
    headers: {
      'User-Agent': 'RemoteJobHunter/1.0 (job search bot)',
    },
  });

  if (!res.ok) {
    throw new Error(`Himalayas returned HTTP ${res.status}`);
  }

  const data = await res.json() as HimalayasResponse;
  return data.jobs || [];
}

function mapToJob(item: HimalayasJob): Job {
  let salary: string | undefined;
  if (item.minSalary && item.maxSalary) {
    const currency = item.currency || 'USD';
    salary = `${currency} ${item.minSalary.toLocaleString()} - ${item.maxSalary.toLocaleString()}/yr`;
  }

  return {
    title: item.title || '',
    company: item.companyName || '',
    description: (item.description || '').replace(/<[^>]*>/g, ' ').trim().substring(0, 2000),
    url: item.applicationLink || item.guid || '',
    applyUrl: item.applicationLink || '',
    source: 'himalayas' as const,
    salary,
    tags: item.parentCategories || item.categories || [],
    postedAt: item.pubDate ? new Date(item.pubDate * 1000).toISOString() : undefined,
  };
}

export async function scrapeHimalayas(): Promise<Job[]> {
  log('himalayas', `Fetching jobs from Himalayas API (${PAGES} pages)...`);

  const allItems: HimalayasJob[] = [];

  for (let page = 0; page < PAGES; page++) {
    const offset = page * PAGE_SIZE;
    try {
      const items = await fetchPage(offset);
      allItems.push(...items);
      if (items.length < PAGE_SIZE) break; // No more pages
      if (page < PAGES - 1) await sleep(PAGE_DELAY);
    } catch (err) {
      log('himalayas', `Error on page ${page + 1}: ${err}`);
      break;
    }
  }

  const jobs = allItems
    .filter(item => isSoftwareJob(item.title, item.categories || [], item.parentCategories || []))
    .map(mapToJob);

  log('himalayas', `Found ${jobs.length} software jobs out of ${allItems.length} total`);
  return jobs;
}
