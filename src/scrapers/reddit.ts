import Parser from 'rss-parser';
import { Job } from '../types.js';
import { log, HIRING_KEYWORDS, sleep } from '../config.js';

const parser = new Parser();

const SUBREDDIT_FEEDS = [
  'https://www.reddit.com/r/forhire/new/.rss',
  'https://www.reddit.com/r/remotejs/new/.rss',
  'https://www.reddit.com/r/WebDev/new/.rss',
];

// Reject posts from people offering services (not companies hiring)
const FOR_HIRE_PATTERNS = ['[for hire]', '[for-hire]', 'for hire', 'looking for work', 'seeking work'];

function isHiringPost(title: string, content: string): boolean {
  const titleLower = title.toLowerCase();

  // Skip "for hire" posts (people offering services, not companies hiring)
  if (FOR_HIRE_PATTERNS.some(p => titleLower.includes(p))) {
    return false;
  }

  const text = `${title} ${content}`.toLowerCase();
  return HIRING_KEYWORDS.some(kw => text.includes(kw));
}

export async function scrapeReddit(): Promise<Job[]> {
  log('reddit', 'Fetching jobs from Reddit RSS feeds...');

  const allJobs: Job[] = [];

  for (const feedUrl of SUBREDDIT_FEEDS) {
    try {
      const feed = await parser.parseURL(feedUrl);
      const subreddit = feedUrl.match(/\/r\/([^/]+)/)?.[1] || 'unknown';

      for (const item of feed.items || []) {
        const title = item.title || '';
        const content = (item['content:encoded'] || item.contentSnippet || item.content || '')
          .replace(/<[^>]*>/g, ' ')
          .trim();

        if (!isHiringPost(title, content)) continue;

        // Try to extract company from title: "[Hiring] Company - Role" or similar
        let company = '';
        let jobTitle = title;

        // Remove [Hiring] tag
        jobTitle = jobTitle.replace(/\[hiring\]/gi, '').trim();

        // Try pattern: "Company - Role" or "Company | Role"
        const separators = [' - ', ' | ', ' — '];
        for (const sep of separators) {
          if (jobTitle.includes(sep)) {
            const parts = jobTitle.split(sep);
            company = parts[0].trim();
            jobTitle = parts.slice(1).join(sep).trim();
            break;
          }
        }

        allJobs.push({
          title: jobTitle || title,
          company,
          description: content.substring(0, 2000),
          url: item.link || '',
          applyUrl: item.link || '',
          source: 'reddit' as const,
          postedAt: item.pubDate ? new Date(item.pubDate).toISOString() : undefined,
        });
      }

      log('reddit', `r/${subreddit}: ${feed.items?.length || 0} posts, ${allJobs.length} hiring posts so far`);
      await sleep(2000); // Respectful delay between subreddits
    } catch (err) {
      log('reddit', `Error fetching ${feedUrl}: ${err}`);
    }
  }

  log('reddit', `Found ${allJobs.length} hiring posts total`);
  return allJobs;
}
