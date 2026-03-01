import { Job } from '../types.js';
import { log, sleep } from '../config.js';

const ALGOLIA_SEARCH = 'https://hn.algolia.com/api/v1/search';
const HN_ITEM_API = 'https://hacker-news.firebaseio.com/v0/item';
const BATCH_SIZE = 10;
const DELAY_BETWEEN_BATCHES = 500;
const MAX_COMMENTS = 150;

interface HNComment {
  id: number;
  text?: string;
  time: number;
  by?: string;
  dead?: boolean;
  deleted?: boolean;
}

function decodeHTML(text: string): string {
  return text
    .replace(/<[^>]*>/g, '\n')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#x2F;/g, '/')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

// Location-like patterns to avoid treating as job title
const LOCATION_PATTERN = /^(remote|onsite|on-site|hybrid|anywhere|worldwide|usa|us |eu |uk |nyc|sf |san francisco|austin|new york|london|berlin|toronto|singapore|india|global|[a-z\s]+,\s*[a-z]{2}\b)/i;

function parseHNComment(item: HNComment): Job | null {
  if (item.dead || item.deleted || !item.text) return null;

  const plainText = decodeHTML(item.text);
  const lines = plainText.split('\n').filter(l => l.trim());
  if (lines.length < 2) return null;

  // First line follows: Company | Role | Location | Remote | Salary (order varies)
  const headerParts = lines[0].split('|').map(s => s.trim());
  if (headerParts.length < 2) return null;

  // Check for remote anywhere in the header
  const headerText = lines[0].toLowerCase();
  const isRemote = headerText.includes('remote');
  if (!isRemote) return null;

  const company = headerParts[0] || '';

  // Find the best title candidate: skip parts that look like locations or "remote"
  let title = '';
  for (let i = 1; i < headerParts.length; i++) {
    const part = headerParts[i].trim();
    if (!part) continue;
    // Skip if it's purely a location, remote indicator, or salary
    if (LOCATION_PATTERN.test(part)) continue;
    if (/^\$[\d,]+/.test(part)) continue;
    if (/^(full[- ]?time|part[- ]?time|contract|freelance)$/i.test(part)) continue;
    title = part;
    break;
  }

  // If no good title found, try to extract from body or use company name
  if (!title) {
    // Look for common role keywords in body text
    const bodyText = lines.slice(1).join(' ');
    const roleMatch = bodyText.match(/\b(senior |staff |lead |principal |junior )?(software|full[- ]?stack|front[- ]?end|back[- ]?end|devops|platform|mobile|web|cloud|data|ml|ai|security)\s*(engineer|developer|architect|manager|lead)\b/i);
    title = roleMatch ? roleMatch[0].trim() : `${company} - Engineering Role`;
  }

  // Extract salary from header segments
  const salarySegment = headerParts.find(p => /\$[\d,]+|salary|compensation|\dk\/yr|\dk per/i.test(p));
  const salary = salarySegment?.trim() || undefined;

  // Extract apply URLs from body
  const urlMatch = plainText.match(/https?:\/\/[^\s<>"]+/);
  const applyUrl = urlMatch ? urlMatch[0] : `https://news.ycombinator.com/item?id=${item.id}`;

  return {
    title,
    company,
    description: plainText.substring(0, 2000),
    url: `https://news.ycombinator.com/item?id=${item.id}`,
    applyUrl,
    source: 'hackernews' as const,
    salary,
    postedAt: new Date(item.time * 1000).toISOString(),
  };
}

async function findLatestHiringThread(): Promise<string | null> {
  const thirtyDaysAgo = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);
  const url = `${ALGOLIA_SEARCH}?query=%22who+is+hiring%22&tags=story&numericFilters=created_at_i>${thirtyDaysAgo}`;

  const res = await fetch(url, {
    headers: { 'User-Agent': 'RemoteJobHunter/1.0 (job search bot)' },
  });

  if (!res.ok) {
    throw new Error(`Algolia HN search returned HTTP ${res.status}`);
  }

  const data = await res.json() as { hits: Array<{ objectID: string; title: string }> };

  const hiringThread = (data.hits || []).find(h =>
    /^ask hn: who is hiring/i.test(h.title)
  );

  return hiringThread?.objectID || null;
}

async function fetchCommentIds(storyId: string): Promise<number[]> {
  const res = await fetch(`${HN_ITEM_API}/${storyId}.json`, {
    headers: { 'User-Agent': 'RemoteJobHunter/1.0 (job search bot)' },
  });

  if (!res.ok) {
    throw new Error(`HN Firebase returned HTTP ${res.status}`);
  }

  const data = await res.json() as { kids?: number[] };
  return (data.kids || []).slice(0, MAX_COMMENTS);
}

async function fetchComment(commentId: number): Promise<HNComment | null> {
  try {
    const res = await fetch(`${HN_ITEM_API}/${commentId}.json`, {
      headers: { 'User-Agent': 'RemoteJobHunter/1.0 (job search bot)' },
    });
    if (!res.ok) return null;
    return await res.json() as HNComment;
  } catch {
    return null;
  }
}

export async function scrapeHackerNews(): Promise<Job[]> {
  log('hackernews', 'Searching for latest "Who is hiring?" thread...');

  const storyId = await findLatestHiringThread();
  if (!storyId) {
    log('hackernews', 'No recent "Who is hiring?" thread found');
    return [];
  }

  log('hackernews', `Found thread ID: ${storyId}, fetching comments...`);
  const commentIds = await fetchCommentIds(storyId);
  log('hackernews', `Thread has ${commentIds.length} top-level comments (capped at ${MAX_COMMENTS})`);

  const allJobs: Job[] = [];

  // Batch-fetch comments
  for (let i = 0; i < commentIds.length; i += BATCH_SIZE) {
    const batch = commentIds.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(batch.map(id => fetchComment(id)));

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        const job = parseHNComment(result.value);
        if (job) allJobs.push(job);
      }
    }

    if (i + BATCH_SIZE < commentIds.length) {
      await sleep(DELAY_BETWEEN_BATCHES);
    }
  }

  log('hackernews', `Found ${allJobs.length} remote jobs from ${commentIds.length} comments`);
  return allJobs;
}
