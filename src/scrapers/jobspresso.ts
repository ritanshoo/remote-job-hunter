import * as cheerio from 'cheerio';
import { Job } from '../types.js';
import { log } from '../config.js';

export async function scrapeJobspresso(): Promise<Job[]> {
  log('jobspresso', 'Fetching jobs from Jobspresso AJAX API...');

  const res = await fetch('https://jobspresso.co/jm-ajax/get_listings/', {
    method: 'POST',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'per_page=30&page=1&filter_job_type[]=developer',
  });

  if (!res.ok) {
    throw new Error(`Jobspresso returned HTTP ${res.status}`);
  }

  const data = await res.json() as { html: string; found_jobs: boolean };

  if (!data.html) {
    log('jobspresso', 'No HTML in response');
    return [];
  }

  const $ = cheerio.load(data.html);
  const jobs: Job[] = [];

  $('li.job_listing').each((_, el) => {
    const $el = $(el);
    const link = $el.find('a').first().attr('href') || '';
    const title = $el.find('.job_listing-title, h3').first().text().trim();
    const company = $el.find('.job_listing-company strong, .company').first().text().trim();
    const location = $el.find('.job_listing-location, .location').first().text().trim();

    if (title) {
      jobs.push({
        title,
        company,
        description: location,
        url: link,
        applyUrl: link,
        source: 'jobspresso' as const,
      });
    }
  });

  log('jobspresso', `Found ${jobs.length} jobs`);
  return jobs;
}
