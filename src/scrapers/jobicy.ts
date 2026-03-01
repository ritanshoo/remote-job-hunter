import { Job } from '../types.js';
import { log } from '../config.js';

interface JobicyJob {
  id: number;
  url: string;
  jobTitle: string;
  companyName: string;
  jobDescription: string;
  jobGeo: string;
  pubDate: string;
  annualSalaryMin?: string;
  annualSalaryMax?: string;
  jobIndustry?: string[];
  jobType?: string[];
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&#8211;/g, '–')
    .replace(/&#8212;/g, '—')
    .replace(/&#8217;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'");
}

export async function scrapeJobicy(): Promise<Job[]> {
  log('jobicy', 'Fetching jobs from Jobicy API...');

  const res = await fetch('https://jobicy.com/api/v2/remote-jobs?count=50&tag=software', {
    headers: {
      'User-Agent': 'RemoteJobHunter/1.0 (job search bot)',
    },
  });

  if (!res.ok) {
    throw new Error(`Jobicy returned HTTP ${res.status}`);
  }

  const data = await res.json() as { jobs: JobicyJob[] };

  const jobs: Job[] = (data.jobs || []).map(item => {
    let salary: string | undefined;
    if (item.annualSalaryMin && item.annualSalaryMax) {
      salary = `$${item.annualSalaryMin} - $${item.annualSalaryMax}/yr`;
    } else if (item.annualSalaryMin) {
      salary = `$${item.annualSalaryMin}/yr`;
    }

    return {
      title: decodeEntities(item.jobTitle || ''),
      company: decodeEntities(item.companyName || ''),
      description: decodeEntities((item.jobDescription || '').replace(/<[^>]*>/g, ' ').trim()).substring(0, 2000),
      url: item.url || '',
      applyUrl: item.url || '',
      source: 'jobicy' as const,
      salary,
      tags: item.jobIndustry || [],
      postedAt: item.pubDate ? new Date(item.pubDate).toISOString() : undefined,
    };
  });

  log('jobicy', `Found ${jobs.length} jobs`);
  return jobs;
}
