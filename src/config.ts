import 'dotenv/config';

export const log = (module: string, message: string) => {
  console.log(`[${new Date().toISOString()}] [${module}] ${message}`);
};

// --- Environment ---
export const GMAIL_USER = process.env.GMAIL_USER || '';
export const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD || '';
export const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
export const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';
export const MAX_EMAILS_PER_DAY = parseInt(process.env.MAX_EMAILS_PER_DAY || '20', 10);
export const MIN_EMAIL_DELAY_SECONDS = parseInt(process.env.MIN_EMAIL_DELAY_SECONDS || '60', 10);
export const MAX_EMAIL_DELAY_SECONDS = parseInt(process.env.MAX_EMAIL_DELAY_SECONDS || '120', 10);
export const HIGH_SCORE_THRESHOLD = parseInt(process.env.HIGH_SCORE_THRESHOLD || '7', 10);
export const MEDIUM_SCORE_THRESHOLD = parseInt(process.env.MEDIUM_SCORE_THRESHOLD || '4', 10);
export const DRY_RUN = process.argv.includes('--dry-run');
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
export const MAX_JOB_AGE_HOURS = parseInt(process.env.MAX_JOB_AGE_HOURS || '24', 10); // 6=6hrs, 24=today, 48=2days

// --- Profile ---
export const PROFILE = {
  name: 'Ritanshu Singh',
  email: 'ritanshukumarsingh8922@gmail.com',
  phone: '+91-751-901-6768',
  github: 'github.com/ritanshoo',
  linkedin: 'linkedin.com/in/ritanshu-singh-rajput',
  role: 'Senior Full Stack Engineer',
};

// --- Keyword Scoring ---
export const HIGH_KEYWORDS: string[] = [
  'full stack', 'fullstack', 'mern', 'react', 'next.js', 'node.js', 'node',
];

export const MEDIUM_KEYWORDS: string[] = [
  'blockchain', 'solana', 'ethereum', 'web3', 'smart contract', 'solidity',
  'ai', 'llm', 'chatbot', 'automation', 'langchain', 'rag',
];

export const LOW_KEYWORDS: string[] = [
  'javascript', 'typescript', 'mongodb', 'postgresql', 'aws', 'express',
  'nestjs', 'webrtc', 'graphql', 'rest api', 'docker',
];

export const NEGATIVE_KEYWORDS: string[] = [
  'junior', 'intern', 'internship', 'on-site only', 'onsite only',
  'no remote', 'entry level', 'entry-level', 'c++', 'c/c++',
  // US-only restrictions
  'us citizens only', 'must be located in us', 'us only', 'u.s. only',
  'united states only', 'us-based only', 'based in the us',
  'must reside in the us', 'must reside in the united states',
  'us work authorization required', 'us authorization required',
  'must be authorized to work in the us', 'must be authorized to work in the united states',
  'us residents only', 'usa only', 'us-only',
  // EU/UK-only restrictions
  'eu only', 'uk only', 'eu-only', 'uk-only', 'europe only',
  'must be located in the eu', 'must be located in the uk',
  // General location restrictions
  'no international', 'domestic candidates only',
];

export const HIGH_SCORE = 3;
export const MEDIUM_SCORE = 2;
export const LOW_SCORE = 1;
export const NEGATIVE_SCORE = -5;
export const SALARY_BONUS = 2;

// --- Resume attachment ---
export const RESUME_PATH = process.env.RESUME_PATH || 'resume/Ritanshu_Singh_Resume.pdf';

// --- Salary Thresholds (user budget: $2,500/mo) ---
export const MIN_HOURLY_RATE = 15.63;
export const MIN_YEARLY_RATE = 30000;
export const MIN_MONTHLY_RATE = 2500;

// --- Email Dynamic Bullets ---
export interface BulletMatch {
  keywords: string[];
  bullet: string;
}

export const DYNAMIC_BULLETS: BulletMatch[] = [
  {
    keywords: ['react', 'next.js', 'frontend', 'front-end', 'ui', 'material ui', 'ant design'],
    bullet: 'Built production React applications with Material UI and Ant Design, including converting 100+ Figma screens to production-ready components',
  },
  {
    keywords: ['node.js', 'node', 'backend', 'back-end', 'api', 'express', 'nestjs'],
    bullet: 'Designed backend systems processing 5,000+ daily transactions with 99.9% uptime, optimized APIs to handle 5x more concurrent users',
  },
  {
    keywords: ['blockchain', 'web3', 'solidity', 'ethereum', 'solana', 'smart contract', 'dex', 'defi'],
    bullet: 'Built a DEX matching engine handling $2M+ daily volume with smart contracts that reduced gas fees by 25%',
  },
  {
    keywords: ['ai', 'llm', 'chatbot', 'langchain', 'rag', 'openai', 'gpt', 'machine learning'],
    bullet: 'Led development of 3 Agentic AI applications, implemented RAG pipelines using LangChain.js with Pinecone for accurate AI responses',
  },
  {
    keywords: ['webrtc', 'real-time', 'realtime', 'video', 'streaming'],
    bullet: 'Built real-time video calling system supporting 10,000+ concurrent users using WebRTC',
  },
  {
    keywords: ['aws', 'cloud', 'ec2', 'dynamodb', 's3', 'sqs', 'devops', 'infrastructure'],
    bullet: 'Hands-on experience with AWS EC2, DynamoDB, S3, and SQS for production deployments',
  },
];

// Default bullets if no specific match
export const DEFAULT_BULLETS = [
  'Designed backend systems processing 5,000+ daily transactions with 99.9% uptime, optimized APIs to handle 5x more concurrent users',
  'Built production React applications with Material UI and Ant Design, including converting 100+ Figma screens to production-ready components',
];

// --- Reddit hiring filter keywords ---
export const HIRING_KEYWORDS = [
  '[hiring]', 'hiring', 'looking for', 'we are hiring', 'job opening',
  'seeking', 'need a developer', 'looking to hire',
];

// --- Data file paths ---
export const SEEN_JOBS_PATH = 'data/seen-jobs.json';
export const DAILY_EMAIL_COUNT_PATH = 'data/daily-email-count.json';
export const LEADS_LOG_PATH = 'data/leads-log.json';

// --- IST timezone helper ---
export function getISTHour(): number {
  const now = new Date();
  const istOffset = 5.5 * 60; // IST is UTC+5:30
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const istMinutes = utcMinutes + istOffset;
  return Math.floor((istMinutes % (24 * 60)) / 60);
}

export function isEmailSendingHour(): boolean {
  const hour = getISTHour();
  return hour >= 6 && hour <= 23;
}

export function isDailySummaryHour(): boolean {
  const hour = getISTHour();
  return hour === 21; // 9 PM IST
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function randomDelay(minSec: number, maxSec: number): number {
  return (Math.floor(Math.random() * (maxSec - minSec + 1)) + minSec) * 1000;
}
