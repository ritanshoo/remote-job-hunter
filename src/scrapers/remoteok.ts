import { Job } from '../types.js';
import { log, sleep } from '../config.js';

export async function scrapeRemoteOK(): Promise<Job[]> {
  log('remoteok', 'Fetching jobs from RemoteOK API...');

  const res = await fetch('https://remoteok.com/api', {
    headers: {
      'User-Agent': 'RemoteJobHunter/1.0 (job search bot)',
    },
  });

  if (!res.ok) {
    throw new Error(`RemoteOK returned HTTP ${res.status}`);
  }

  const data = await res.json() as any[];

  // First element is metadata, skip it
  const rawJobs = data.slice(1);

  const jobs: Job[] = rawJobs
    .filter((item: any) => item.position && item.company)
    .map((item: any) => {
      const jobUrl = item.url ? `https://remoteok.com${item.url}` : '';
      const applyUrl = item.apply_url?.startsWith('http') ? item.apply_url : jobUrl;
      const salary = item.salary || (item.salary_min ? `${item.salary_min}-${item.salary_max || ''}` : undefined);

      return {
        title: item.position || '',
        company: item.company || '',
        description: (item.description || '').replace(/<[^>]*>/g, ' ').trim(),
        url: jobUrl,
        applyUrl,
        source: 'remoteok' as const,
        salary,
        tags: item.tags || [],
        postedAt: item.date || undefined,
      };
    });

  log('remoteok', `Found ${jobs.length} jobs`);
  await sleep(2500); // Respectful delay
  return jobs;
}
