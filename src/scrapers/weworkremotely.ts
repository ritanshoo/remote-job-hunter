import Parser from 'rss-parser';
import { Job } from '../types.js';
import { log } from '../config.js';

const parser = new Parser();

export async function scrapeWeWorkRemotely(): Promise<Job[]> {
  log('wwr', 'Fetching jobs from We Work Remotely RSS...');

  const feed = await parser.parseURL('https://weworkremotely.com/remote-jobs.rss');

  const jobs: Job[] = (feed.items || []).map(item => {
    const description = (item['content:encoded'] || item.contentSnippet || item.content || '')
      .replace(/<[^>]*>/g, ' ')
      .trim();

    // Try to extract company from title (format: "Company: Job Title")
    let company = '';
    let title = item.title || '';
    if (title.includes(':')) {
      const parts = title.split(':');
      company = parts[0].trim();
      title = parts.slice(1).join(':').trim();
    }

    return {
      title,
      company,
      description,
      url: item.link || '',
      applyUrl: item.link || '',
      source: 'weworkremotely' as const,
      postedAt: item.pubDate ? new Date(item.pubDate).toISOString() : undefined,
    };
  });

  log('wwr', `Found ${jobs.length} jobs`);
  return jobs;
}
