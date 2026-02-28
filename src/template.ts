import { ScoredJob } from './types.js';
import { PROFILE, DYNAMIC_BULLETS, DEFAULT_BULLETS, log } from './config.js';
import { isLLMAvailable, llmGenerateEmail } from './llm.js';

/**
 * Generate email using LLM if available, falling back to template-based.
 */
export async function generateEmailWithLLM(job: ScoredJob): Promise<{ subject: string; body: string }> {
  if (isLLMAvailable()) {
    const llmEmail = await llmGenerateEmail(job.title, job.company, job.description);
    if (llmEmail) {
      return llmEmail;
    }
    log('template', 'LLM email generation failed, falling back to template');
  }
  return generateEmail(job);
}

export function generateEmail(job: ScoredJob): { subject: string; body: string } {
  const recipientName = job.company || 'Hiring Team';
  const subject = `Senior Full Stack Engineer - Application for ${job.title} at ${recipientName}`;

  // Select dynamic bullets based on matched keywords
  const text = `${job.title} ${job.description}`.toLowerCase();
  const selectedBullets: string[] = [];

  for (const bulletMatch of DYNAMIC_BULLETS) {
    if (selectedBullets.length >= 4) break;
    const matches = bulletMatch.keywords.some(kw => text.includes(kw));
    if (matches && !selectedBullets.includes(bulletMatch.bullet)) {
      selectedBullets.push(bulletMatch.bullet);
    }
  }

  // Ensure minimum 2 bullets, use defaults if needed
  if (selectedBullets.length < 2) {
    for (const defaultBullet of DEFAULT_BULLETS) {
      if (selectedBullets.length >= 2) break;
      if (!selectedBullets.includes(defaultBullet)) {
        selectedBullets.push(defaultBullet);
      }
    }
  }

  const bulletsText = selectedBullets.map(b => `- ${b}`).join('\n');

  const body = `Hi ${recipientName},

I came across your ${job.title} opening and wanted to reach out. I am a Senior Full Stack Engineer with 4+ years of experience building scalable web applications, blockchain platforms, and AI-powered systems.

Here is what I bring to this role:

${bulletsText}

I would love to discuss how I can contribute to your team.

Portfolio: ${PROFILE.github}
LinkedIn: ${PROFILE.linkedin}

Best regards,
${PROFILE.name}
${PROFILE.phone}

---
You received this because your job posting matched my profile. If this is not relevant, I apologize for the inconvenience.`;

  log('template', `Generated email for "${job.title}" at ${job.company} with ${selectedBullets.length} bullets`);
  return { subject, body };
}
