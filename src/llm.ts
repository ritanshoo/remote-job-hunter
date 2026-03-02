import OpenAI from 'openai';
import { OPENAI_API_KEY, PROFILE, log } from './config.js';

let client: OpenAI | null = null;

function getClient(): OpenAI | null {
  if (!OPENAI_API_KEY) {
    return null;
  }
  if (!client) {
    client = new OpenAI({ apiKey: OPENAI_API_KEY });
  }
  return client;
}

export function isLLMAvailable(): boolean {
  return !!OPENAI_API_KEY;
}

const PROFILE_SUMMARY = `
Name: ${PROFILE.name}
Role: ${PROFILE.role} (4+ years experience)
Core Skills: JavaScript, TypeScript, React, Next.js, Node.js, Express, NestJS, MongoDB, PostgreSQL, AWS
Blockchain: Solidity, Web3.js, Ethers.js, ERC3643, DEX development
AI/ML: LangChain.js, OpenAI Agent SDK, RAG pipelines, Pinecone, ChromaDB
Key Achievements:
- In-app wallet system: 5,000+ daily transactions, 99.9% uptime
- 3 Agentic AI applications (full stack)
- DEX matching engine: $2M+ daily volume
- Real-time video calling: 10,000+ concurrent users (WebRTC)
- Won Startup Worldcup Pitch Competition (UAE) for ERC3643 security token
Budget: Minimum $2,500/month ($15.63/hr)
Location: Based in India, looking for REMOTE jobs only (no US-only, EU-only, or location-restricted roles)
`.trim();

/**
 * LLM-based job relevance scoring.
 * Returns a score 0-10 and a brief reason, or null if LLM unavailable.
 */
export async function llmScoreJob(
  title: string,
  company: string,
  description: string
): Promise<{ score: number; reason: string } | null> {
  const openai = getClient();
  if (!openai) return null;

  const descSnippet = description.substring(0, 1500);

  try {
    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.1,
      max_tokens: 150,
      messages: [
        {
          role: 'system',
          content: `You evaluate job relevance for a candidate. Return ONLY valid JSON: {"score": <0-10>, "reason": "<1 sentence>"}
Score guide:
- 9-10: Perfect match (full stack JS/TS, React+Node, blockchain, AI/LLM roles)
- 7-8: Strong match (most skills align, senior-level)
- 5-6: Partial match (some skill overlap)
- 3-4: Weak match (different stack but tangential)
- 0-2: No match (wrong domain, junior, on-site only, non-dev role)
IMPORTANT: Score 0 if:
- The role is not a developer/engineer position (e.g. marketing, sales, HR, nurse, support)
- The job requires US citizenship, US work authorization, or is restricted to US/EU/UK residents only
- The job says "US only", "must be located in US/EU", or similar geographic restrictions that exclude India-based remote workers
- The candidate is based in India and can only take globally-remote or India-friendly positions`,
        },
        {
          role: 'user',
          content: `CANDIDATE:\n${PROFILE_SUMMARY}\n\nJOB:\nTitle: ${title}\nCompany: ${company}\nDescription: ${descSnippet}`,
        },
      ],
    });

    const text = res.choices[0]?.message?.content?.trim() || '';
    const parsed = JSON.parse(text);
    const score = Math.min(10, Math.max(0, Number(parsed.score) || 0));
    const reason = String(parsed.reason || '').substring(0, 200);

    log('llm', `Score ${score}/10 for "${title}" at ${company}: ${reason}`);
    return { score, reason };
  } catch (err: any) {
    log('llm', `Scoring error for "${title}": ${err?.message || err}`);
    return null;
  }
}

/**
 * LLM-generated personalized cover email.
 * Returns subject + body, or null if LLM unavailable.
 */
export async function llmGenerateEmail(
  title: string,
  company: string,
  description: string
): Promise<{ subject: string; body: string } | null> {
  const openai = getClient();
  if (!openai) return null;

  const descSnippet = description.substring(0, 2000);

  try {
    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.7,
      max_tokens: 600,
      messages: [
        {
          role: 'system',
          content: `You write concise job application emails. Rules:
- Professional but warm tone, no fluff
- 150-250 words max for body
- Pick 2-4 most relevant achievements from the candidate's profile
- Reference specific things from the job description to show genuine interest
- Do NOT make up achievements not listed in the profile
- End with portfolio links and contact info
- Include opt-out footer: "You received this because your job posting matched my profile. If this is not relevant, I apologize for the inconvenience."
Return ONLY valid JSON: {"subject": "...", "body": "..."}`,
        },
        {
          role: 'user',
          content: `CANDIDATE:\n${PROFILE_SUMMARY}\n\nJOB:\nTitle: ${title}\nCompany: ${company}\nDescription: ${descSnippet}\n\nWrite a personalized application email.`,
        },
      ],
    });

    const text = res.choices[0]?.message?.content?.trim() || '';
    const parsed = JSON.parse(text);

    if (!parsed.subject || !parsed.body) {
      throw new Error('Missing subject or body in LLM response');
    }

    log('llm', `Generated email for "${title}" at ${company} (${parsed.body.length} chars)`);
    return { subject: parsed.subject, body: parsed.body };
  } catch (err: any) {
    log('llm', `Email generation error for "${title}": ${err?.message || err}`);
    return null;
  }
}
