import { Job } from '../types.js';
import { log } from '../config.js';

interface RemotiveJob {
  title: string;
  company_name: string;
  description: string;
  url: string;
  salary: string;
  tags: string[];
  publication_date: string;
}

export async function scrapeRemotive(): Promise<Job[]> {
  log('remotive', 'Fetching jobs from Remotive API...');

  const res = await fetch('https://remotive.com/api/remote-jobs?category=software-dev', {
    headers: {
      'User-Agent': 'RemoteJobHunter/1.0 (job search bot)',
    },
  });

  if (!res.ok) {
    throw new Error(`Remotive returned HTTP ${res.status}`);
  }

  const data = await res.json() as { jobs: RemotiveJob[] };

  const jobs: Job[] = (data.jobs || []).map(item => ({
    title: item.title || '',
    company: item.company_name || '',
    description: (item.description || '').replace(/<[^>]*>/g, ' ').trim(),
    url: item.url || '',
    applyUrl: item.url || '',
    source: 'remotive' as const,
    salary: item.salary || undefined,
    tags: item.tags || [],
    postedAt: item.publication_date ? new Date(item.publication_date).toISOString() : undefined,
  }));

  log('remotive', `Found ${jobs.length} jobs`);
  return jobs;
}
