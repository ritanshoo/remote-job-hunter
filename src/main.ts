import { readFileSync, writeFileSync } from 'fs';
import { Job, ScoredJob, LeadLogEntry } from './types.js';
import {
  log, DRY_RUN, isEmailSendingHour, isDailySummaryHour,
  sleep, randomDelay, MIN_EMAIL_DELAY_SECONDS, MAX_EMAIL_DELAY_SECONDS,
  LEADS_LOG_PATH, MAX_JOB_AGE_HOURS,
} from './config.js';
import {
  loadSeenJobs, loadDailyEmailCount, generateHash, isSeenJob,
  addSeenJob, cleanOldEntries, saveSeenJobs, saveDailyEmailCount,
  canSendEmail, incrementEmailCount, getEmailCountToday,
} from './dedup.js';
import { scoreJobWithLLM, extractEmail } from './scorer.js';
import { sendApplicationEmail, hasEmailError } from './emailer.js';
import {
  sendHighPriorityAlert, sendMediumPriorityAlert,
  sendDailySummary, sendErrorAlert,
} from './telegram.js';

// Scrapers
import { scrapeRemoteOK } from './scrapers/remoteok.js';
import { scrapeWeWorkRemotely } from './scrapers/weworkremotely.js';
import { scrapeRemotive } from './scrapers/remotive.js';
import { scrapeJobspresso } from './scrapers/jobspresso.js';
import { scrapeWorkingNomads } from './scrapers/workingnomads.js';
import { scrapeReddit } from './scrapers/reddit.js';
import { scrapeJobicy } from './scrapers/jobicy.js';
import { scrapeHackerNews } from './scrapers/hackernews.js';
import { scrapeHimalayas } from './scrapers/himalayas.js';
import { scrapeWellfound } from './scrapers/wellfound.js';

async function runAllScrapers(): Promise<Job[]> {
  log('main', 'Starting all scrapers in parallel...');

  const results = await Promise.allSettled([
    scrapeRemoteOK(),
    scrapeWeWorkRemotely(),
    scrapeRemotive(),
    scrapeJobspresso(),
    scrapeWorkingNomads(),
    scrapeReddit(),
    scrapeJobicy(),
    scrapeHackerNews(),
    scrapeHimalayas(),
    scrapeWellfound(),
  ]);

  const scraperNames = ['RemoteOK', 'WeWorkRemotely', 'Remotive', 'Jobspresso', 'WorkingNomads', 'Reddit', 'Jobicy', 'HackerNews', 'Himalayas', 'Wellfound'];
  const allJobs: Job[] = [];
  let failedCount = 0;

  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      log('main', `${scraperNames[i]}: ${result.value.length} jobs`);
      allJobs.push(...result.value);
    } else {
      failedCount++;
      log('main', `${scraperNames[i]} FAILED: ${result.reason}`);
    }
  });

  if (failedCount === results.length) {
    await sendErrorAlert('All scrapers failed - check GitHub Actions logs');
  } else if (failedCount > 0) {
    log('main', `${failedCount}/${results.length} scrapers failed, continuing with ${allJobs.length} jobs`);
  }

  log('main', `Total jobs scraped: ${allJobs.length}`);
  return allJobs;
}

function loadLeadsLog(): LeadLogEntry[] {
  try {
    return JSON.parse(readFileSync(LEADS_LOG_PATH, 'utf-8'));
  } catch {
    return [];
  }
}

function saveLeadsLog(entries: LeadLogEntry[]): void {
  writeFileSync(LEADS_LOG_PATH, JSON.stringify(entries, null, 2));
}

async function main(): Promise<void> {
  log('main', `=== Remote Job Hunter started ${DRY_RUN ? '[DRY RUN]' : ''} ===`);

  // Step 1-2: Load state
  loadSeenJobs();
  loadDailyEmailCount();
  const leadsLog = loadLeadsLog();

  // Step 3: Scrape all sources
  const allJobs = await runAllScrapers();

  // Step 4-5: Deduplicate
  const newJobs: Job[] = [];
  for (const job of allJobs) {
    const hash = generateHash(job.title, job.company, job.source);
    if (!isSeenJob(hash)) {
      newJobs.push(job);
    }
  }
  log('main', `New jobs after dedup: ${newJobs.length} (${allJobs.length - newJobs.length} duplicates skipped)`);

  // Step 5.5: Freshness filter - skip jobs older than MAX_JOB_AGE_HOURS
  const cutoffDate = new Date(Date.now() - MAX_JOB_AGE_HOURS * 60 * 60 * 1000);
  const freshJobs: Job[] = [];
  let staleCount = 0;
  for (const job of newJobs) {
    if (job.postedAt) {
      const posted = new Date(job.postedAt);
      if (posted < cutoffDate) {
        staleCount++;
        // Still mark as seen so we don't re-check next run
        const hash = generateHash(job.title, job.company, job.source);
        addSeenJob(hash, 0, false, job.source);
        continue;
      }
    }
    // No postedAt = assume fresh (e.g. Jobspresso has no dates)
    freshJobs.push(job);
  }
  log('main', `Fresh jobs (posted within ${MAX_JOB_AGE_HOURS}h): ${freshJobs.length} (${staleCount} stale skipped)`);

  // Step 6: Score (sequential to respect OpenAI rate limits when LLM is enabled)
  const scoredJobs: ScoredJob[] = [];
  for (const job of freshJobs) {
    scoredJobs.push(await scoreJobWithLLM(job));
  }

  // Sort by score descending
  scoredJobs.sort((a, b) => b.score - a.score);

  // Categorize
  const highJobs = scoredJobs.filter(j => j.priority === 'high');
  const mediumJobs = scoredJobs.filter(j => j.priority === 'medium');
  const lowJobs = scoredJobs.filter(j => j.priority === 'low');

  log('main', `Scored: ${highJobs.length} HIGH, ${mediumJobs.length} MEDIUM, ${lowJobs.length} LOW`);

  let emailsSentThisRun = 0;

  // Step 7: Process HIGH priority jobs
  for (const job of highJobs) {
    log('main', `HIGH [${job.score}] "${job.title}" at ${job.company} | ${job.matchedKeywords.join(', ')}`);

    let emailStatus = 'No email found - apply manually';

    // Try to extract email
    const recruiterEmail = job.email || extractEmail(job.description);

    if (
      recruiterEmail &&
      canSendEmail() &&
      !hasEmailError() &&
      isEmailSendingHour()
    ) {
      const result = await sendApplicationEmail(job, recruiterEmail);
      if (result.success) {
        incrementEmailCount();
        emailsSentThisRun++;
        emailStatus = `Auto-sent to ${recruiterEmail}`;

        // Random delay between emails
        const delayMs = randomDelay(MIN_EMAIL_DELAY_SECONDS, MAX_EMAIL_DELAY_SECONDS);
        log('main', `Waiting ${Math.round(delayMs / 1000)}s before next email...`);
        await sleep(delayMs);
      } else {
        emailStatus = `Email failed: ${result.error}`;
        if (hasEmailError()) {
          await sendErrorAlert(`Gmail error occurred: ${result.error}. Stopping email sending for this run.`);
        }
      }
    } else if (recruiterEmail && !isEmailSendingHour()) {
      emailStatus = `Email found (${recruiterEmail}) but outside sending hours (12AM-6AM IST)`;
    } else if (recruiterEmail && !canSendEmail()) {
      emailStatus = `Email found (${recruiterEmail}) but daily limit reached`;
    }

    // Send Telegram alert
    await sendHighPriorityAlert(job, emailStatus);

    // Track in dedup
    const hash = generateHash(job.title, job.company, job.source);
    addSeenJob(hash, job.score, emailStatus.startsWith('Auto-sent'), job.source);

    // Add to leads log
    leadsLog.push({
      timestamp: new Date().toISOString(),
      title: job.title,
      company: job.company,
      source: job.source,
      score: job.score,
      priority: job.priority,
      url: job.url,
      emailSent: emailStatus.startsWith('Auto-sent'),
      matchedKeywords: job.matchedKeywords,
    });
  }

  // Step 8: Process MEDIUM priority jobs
  for (const job of mediumJobs) {
    log('main', `MED  [${job.score}] "${job.title}" at ${job.company} | ${job.matchedKeywords.join(', ')}`);

    await sendMediumPriorityAlert(job);

    const hash = generateHash(job.title, job.company, job.source);
    addSeenJob(hash, job.score, false, job.source);

    leadsLog.push({
      timestamp: new Date().toISOString(),
      title: job.title,
      company: job.company,
      source: job.source,
      score: job.score,
      priority: job.priority,
      url: job.url,
      emailSent: false,
      matchedKeywords: job.matchedKeywords,
    });
  }

  // Step 9: Log LOW priority jobs (no alerts)
  for (const job of lowJobs) {
    const hash = generateHash(job.title, job.company, job.source);
    addSeenJob(hash, job.score, false, job.source);

    leadsLog.push({
      timestamp: new Date().toISOString(),
      title: job.title,
      company: job.company,
      source: job.source,
      score: job.score,
      priority: job.priority,
      url: job.url,
      emailSent: false,
      matchedKeywords: job.matchedKeywords,
    });
  }

  // Step 10-11: Clean and save
  cleanOldEntries();
  saveSeenJobs();
  saveDailyEmailCount();
  saveLeadsLog(leadsLog);

  // Step 12: Daily summary at 9 PM IST
  if (isDailySummaryHour()) {
    log('main', 'Sending daily summary (9 PM IST)...');
    await sendDailySummary({
      totalScraped: allJobs.length,
      highCount: highJobs.length,
      mediumCount: mediumJobs.length,
      emailsSent: getEmailCountToday(),
      skippedCount: lowJobs.length,
      topJobs: scoredJobs.slice(0, 3),
    });
  }

  log('main', `=== Run complete. ${freshJobs.length} fresh jobs processed (${staleCount} stale skipped), ${emailsSentThisRun} emails sent ===`);
}

main().catch(err => {
  log('main', `FATAL ERROR: ${err}`);
  sendErrorAlert(`Fatal error: ${err}`).catch(() => {});
  process.exit(1);
});
