import { ScoredJob } from './types.js';
import { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, log, DRY_RUN } from './config.js';

async function sendTelegramMessage(text: string): Promise<boolean> {
  if (DRY_RUN) {
    log('telegram', `[DRY RUN] Would send message:\n${text.substring(0, 200)}...`);
    return true;
  }

  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    log('telegram', 'Telegram credentials not configured, skipping');
    return false;
  }

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
      }
    );

    if (!res.ok) {
      const body = await res.text();
      log('telegram', `Telegram API error: HTTP ${res.status} - ${body}`);
      return false;
    }

    log('telegram', 'Message sent successfully');
    return true;
  } catch (err) {
    log('telegram', `Telegram send error: ${err}`);
    return false;
  }
}

export async function sendHighPriorityAlert(job: ScoredJob, emailStatus: string): Promise<boolean> {
  const salaryLine = job.salary ? `\n<b>Salary:</b> ${job.salary}` : '';
  const keyReqs = job.description.substring(0, 200).replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const text = `🔴 <b>HIGH MATCH - Score: ${job.score}/10</b>

<b>Title:</b> ${escapeHtml(job.title)}
<b>Company:</b> ${escapeHtml(job.company)}
<b>Source:</b> ${job.source}${salaryLine}
<b>Score Breakdown:</b> ${job.matchedKeywords.join(', ')}

<b>Apply:</b> ${job.applyUrl || job.url}
<b>Email Status:</b> ${emailStatus}

<b>Key Requirements:</b> ${keyReqs}`;

  return sendTelegramMessage(text);
}

export async function sendMediumPriorityAlert(job: ScoredJob): Promise<boolean> {
  const text = `🟡 <b>MEDIUM MATCH - Score: ${job.score}/10</b>

<b>Title:</b> ${escapeHtml(job.title)}
<b>Company:</b> ${escapeHtml(job.company)}
<b>Source:</b> ${job.source}
<b>Apply:</b> ${job.applyUrl || job.url}

<b>Matched:</b> ${job.matchedKeywords.join(', ')}`;

  return sendTelegramMessage(text);
}

export async function sendDailySummary(stats: {
  totalScraped: number;
  highCount: number;
  mediumCount: number;
  emailsSent: number;
  skippedCount: number;
  topJobs: ScoredJob[];
}): Promise<boolean> {
  const date = new Date().toISOString().split('T')[0];
  const topJobsText = stats.topJobs
    .slice(0, 3)
    .map((j, i) => `${i + 1}. ${escapeHtml(j.title)} at ${escapeHtml(j.company)} - Score ${j.score}`)
    .join('\n');

  const text = `📊 <b>Daily Summary - ${date}</b>

Jobs Scraped: ${stats.totalScraped}
High Match: ${stats.highCount}
Medium Match: ${stats.mediumCount}
Emails Sent: ${stats.emailsSent}/20
Skipped: ${stats.skippedCount}

<b>Top 3 Opportunities:</b>
${topJobsText || 'None found today'}`;

  return sendTelegramMessage(text);
}

export async function sendErrorAlert(message: string): Promise<boolean> {
  const text = `⚠️ <b>Job Hunter Error</b>\n\n${escapeHtml(message)}`;
  return sendTelegramMessage(text);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
