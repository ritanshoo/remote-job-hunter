import { Job } from '../types.js';
import { log } from '../config.js';

interface WNJob {
  url: string;
  title: string;
  description: string;
  company_name: string;
  category_name: string;
  tags: string;
  location: string;
  pub_date: string;
}

export async function scrapeWorkingNomads(): Promise<Job[]> {
  log('workingnomads', 'Fetching jobs from Working Nomads API...');

  const res = await fetch('https://www.workingnomads.com/api/exposed_jobs/?category=development&page=1', {
    headers: {
      'User-Agent': 'RemoteJobHunter/1.0 (job search bot)',
    },
  });

  if (!res.ok) {
    throw new Error(`WorkingNomads returned HTTP ${res.status}`);
  }

  const data = await res.json() as WNJob[];

  const jobs: Job[] = data.map(item => ({
    title: item.title || '',
    company: item.company_name || '',
    description: (item.description || '').replace(/<[^>]*>/g, ' ').trim(),
    url: item.url || '',
    applyUrl: item.url || '',
    source: 'workingnomads' as const,
    tags: item.tags ? item.tags.split(',').map(t => t.trim()) : [],
    postedAt: item.pub_date ? new Date(item.pub_date).toISOString() : undefined,
  }));

  log('workingnomads', `Found ${jobs.length} jobs`);
  return jobs;
}
