import { Job, ScoredJob } from './types.js';
import {
  HIGH_KEYWORDS, MEDIUM_KEYWORDS, LOW_KEYWORDS, NEGATIVE_KEYWORDS,
  HIGH_SCORE, MEDIUM_SCORE, LOW_SCORE, NEGATIVE_SCORE, SALARY_BONUS,
  HIGH_SCORE_THRESHOLD, MEDIUM_SCORE_THRESHOLD,
  MIN_HOURLY_RATE, MIN_YEARLY_RATE, MIN_MONTHLY_RATE,
  log,
} from './config.js';
import { isLLMAvailable, llmScoreJob } from './llm.js';

function parseSalary(salaryStr: string): { meetsThreshold: boolean } {
  if (!salaryStr) return { meetsThreshold: false };

  const text = salaryStr.toLowerCase().replace(/,/g, '');

  // Extract numbers
  const numbers = text.match(/\d+\.?\d*/g)?.map(Number) || [];
  if (numbers.length === 0) return { meetsThreshold: false };

  const maxNum = Math.max(...numbers);

  // Detect unit
  if (text.includes('/hr') || text.includes('per hour') || text.includes('/hour') || text.includes('hourly')) {
    return { meetsThreshold: maxNum >= MIN_HOURLY_RATE };
  }
  if (text.includes('/yr') || text.includes('per year') || text.includes('/year') || text.includes('annual') || text.includes('yearly')) {
    return { meetsThreshold: maxNum >= MIN_YEARLY_RATE };
  }
  if (text.includes('/mo') || text.includes('per month') || text.includes('/month') || text.includes('monthly')) {
    return { meetsThreshold: maxNum >= MIN_MONTHLY_RATE };
  }

  // If no unit, guess based on magnitude
  if (maxNum >= 1000) {
    // Likely annual salary (e.g. "50000" or "120k")
    const annual = text.includes('k') ? maxNum * 1000 : maxNum;
    return { meetsThreshold: annual >= MIN_YEARLY_RATE };
  }
  if (maxNum >= 10 && maxNum < 1000) {
    // Could be hourly
    return { meetsThreshold: maxNum >= MIN_HOURLY_RATE };
  }

  return { meetsThreshold: false };
}

function matchKeywords(text: string, keywords: string[]): string[] {
  const lower = text.toLowerCase();
  return keywords.filter(kw => {
    // Word-boundary-aware matching for short keywords like "ai", "node"
    if (kw.length <= 3) {
      const regex = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      return regex.test(lower);
    }
    return lower.includes(kw);
  });
}

export function scoreJob(job: Job): ScoredJob {
  const text = `${job.title} ${job.description}`;
  const matchedKeywords: string[] = [];
  let score = 0;

  // HIGH matches (+3 each)
  const highMatches = matchKeywords(text, HIGH_KEYWORDS);
  score += highMatches.length * HIGH_SCORE;
  matchedKeywords.push(...highMatches.map(k => `+${HIGH_SCORE} ${k}`));

  // MEDIUM matches (+2 each)
  const medMatches = matchKeywords(text, MEDIUM_KEYWORDS);
  score += medMatches.length * MEDIUM_SCORE;
  matchedKeywords.push(...medMatches.map(k => `+${MEDIUM_SCORE} ${k}`));

  // LOW matches (+1 each)
  const lowMatches = matchKeywords(text, LOW_KEYWORDS);
  score += lowMatches.length * LOW_SCORE;
  matchedKeywords.push(...lowMatches.map(k => `+${LOW_SCORE} ${k}`));

  // NEGATIVE matches (-5 each)
  const negMatches = matchKeywords(text, NEGATIVE_KEYWORDS);
  score += negMatches.length * NEGATIVE_SCORE;
  matchedKeywords.push(...negMatches.map(k => `${NEGATIVE_SCORE} ${k}`));

  // Salary bonus
  if (job.salary) {
    const { meetsThreshold } = parseSalary(job.salary);
    if (meetsThreshold) {
      score += SALARY_BONUS;
      matchedKeywords.push(`+${SALARY_BONUS} salary`);
    }
  }

  // Also check description for salary info if no salary field
  if (!job.salary) {
    const salaryRegex = /\$[\d,]+(?:\s*[-–]\s*\$?[\d,]+)?(?:\s*\/?\s*(?:hr|hour|yr|year|mo|month|annual))?/gi;
    const salaryMatch = text.match(salaryRegex);
    if (salaryMatch) {
      const { meetsThreshold } = parseSalary(salaryMatch[0]);
      if (meetsThreshold) {
        score += SALARY_BONUS;
        matchedKeywords.push(`+${SALARY_BONUS} salary(${salaryMatch[0]})`);
      }
    }
  }

  const priority: 'high' | 'medium' | 'low' =
    score >= HIGH_SCORE_THRESHOLD ? 'high' :
    score >= MEDIUM_SCORE_THRESHOLD ? 'medium' : 'low';

  return {
    ...job,
    score,
    matchedKeywords,
    priority,
  };
}

/**
 * Enhanced scoring: keyword score first, then LLM re-score for candidates
 * that pass minimum threshold (keyword score >= 2). This avoids wasting
 * API calls on completely irrelevant jobs.
 *
 * When LLM is available, the final score = LLM score (0-10).
 * When LLM is unavailable, falls back to pure keyword scoring.
 */
export async function scoreJobWithLLM(job: Job): Promise<ScoredJob> {
  // Step 1: Quick keyword pre-filter
  const keywordResult = scoreJob(job);

  // Step 2: If LLM is not available or keyword score too low, return keyword result
  if (!isLLMAvailable() || keywordResult.score < 2) {
    return keywordResult;
  }

  // Step 3: LLM re-score for jobs with some keyword relevance
  const llmResult = await llmScoreJob(job.title, job.company, job.description);

  if (!llmResult) {
    // LLM failed, fall back to keyword score
    return keywordResult;
  }

  const priority: 'high' | 'medium' | 'low' =
    llmResult.score >= HIGH_SCORE_THRESHOLD ? 'high' :
    llmResult.score >= MEDIUM_SCORE_THRESHOLD ? 'medium' : 'low';

  return {
    ...job,
    score: llmResult.score,
    matchedKeywords: [...keywordResult.matchedKeywords, `LLM: ${llmResult.reason}`],
    priority,
  };
}

export function extractEmail(text: string): string | undefined {
  // Look for email patterns in job description
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const matches = text.match(emailRegex);
  if (!matches) return undefined;

  // Prefer hiring-related emails
  const priorityPrefixes = ['hiring', 'jobs', 'careers', 'hr', 'contact', 'recruit', 'talent', 'apply'];
  for (const email of matches) {
    const local = email.split('@')[0].toLowerCase();
    if (priorityPrefixes.some(p => local.includes(p))) {
      return email;
    }
  }

  // Return first found email
  return matches[0];
}
