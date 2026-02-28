import { createHash } from 'crypto';
import { readFileSync, writeFileSync } from 'fs';
import { SeenJob, DailyEmailCount } from './types.js';
import { SEEN_JOBS_PATH, DAILY_EMAIL_COUNT_PATH, MAX_EMAILS_PER_DAY, log } from './config.js';

let seenJobs: Record<string, SeenJob> = {};
let dailyEmailCount: DailyEmailCount = { date: '', count: 0 };

export function generateHash(title: string, company: string, source: string): string {
  const normalized = `${title.toLowerCase().trim()}|${company.toLowerCase().trim()}|${source}`;
  return createHash('md5').update(normalized).digest('hex');
}

export function loadSeenJobs(): void {
  try {
    const data = readFileSync(SEEN_JOBS_PATH, 'utf-8');
    seenJobs = JSON.parse(data);
    log('dedup', `Loaded ${Object.keys(seenJobs).length} seen jobs`);
  } catch {
    seenJobs = {};
    log('dedup', 'No existing seen-jobs.json, starting fresh');
  }
}

export function isSeenJob(hash: string): boolean {
  return hash in seenJobs;
}

export function addSeenJob(hash: string, score: number, emailSent: boolean, source: string): void {
  seenJobs[hash] = {
    hash,
    firstSeen: new Date().toISOString(),
    score,
    emailSent,
    source,
  };
}

export function cleanOldEntries(): number {
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  let cleaned = 0;
  for (const hash of Object.keys(seenJobs)) {
    const entry = seenJobs[hash];
    if (new Date(entry.firstSeen).getTime() < thirtyDaysAgo) {
      delete seenJobs[hash];
      cleaned++;
    }
  }
  if (cleaned > 0) {
    log('dedup', `Cleaned ${cleaned} entries older than 30 days`);
  }
  return cleaned;
}

export function saveSeenJobs(): void {
  writeFileSync(SEEN_JOBS_PATH, JSON.stringify(seenJobs, null, 2));
  log('dedup', `Saved ${Object.keys(seenJobs).length} seen jobs`);
}

// --- Daily email count ---

export function loadDailyEmailCount(): void {
  try {
    const data = readFileSync(DAILY_EMAIL_COUNT_PATH, 'utf-8');
    dailyEmailCount = JSON.parse(data);
    const today = new Date().toISOString().split('T')[0];
    if (dailyEmailCount.date !== today) {
      dailyEmailCount = { date: today, count: 0 };
      log('dedup', 'New day - reset email count to 0');
    } else {
      log('dedup', `Daily email count: ${dailyEmailCount.count}/${MAX_EMAILS_PER_DAY}`);
    }
  } catch {
    dailyEmailCount = { date: new Date().toISOString().split('T')[0], count: 0 };
    log('dedup', 'No existing daily-email-count.json, starting fresh');
  }
}

export function canSendEmail(): boolean {
  const today = new Date().toISOString().split('T')[0];
  if (dailyEmailCount.date !== today) {
    dailyEmailCount = { date: today, count: 0 };
  }
  return dailyEmailCount.count < MAX_EMAILS_PER_DAY;
}

export function incrementEmailCount(): void {
  const today = new Date().toISOString().split('T')[0];
  if (dailyEmailCount.date !== today) {
    dailyEmailCount = { date: today, count: 1 };
  } else {
    dailyEmailCount.count++;
  }
  log('dedup', `Email count: ${dailyEmailCount.count}/${MAX_EMAILS_PER_DAY}`);
}

export function saveDailyEmailCount(): void {
  writeFileSync(DAILY_EMAIL_COUNT_PATH, JSON.stringify(dailyEmailCount, null, 2));
}

export function getEmailCountToday(): number {
  return dailyEmailCount.count;
}
