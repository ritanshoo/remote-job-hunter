export type JobSource = 'remoteok' | 'weworkremotely' | 'remotive' | 'jobspresso' | 'workingnomads' | 'reddit';

export interface Job {
  title: string;
  company: string;
  description: string;
  url: string;
  applyUrl: string;
  source: JobSource;
  salary?: string;
  email?: string;
  tags?: string[];
  postedAt?: string; // ISO date string when the job was posted
}

export interface ScoredJob extends Job {
  score: number;
  matchedKeywords: string[];
  priority: 'high' | 'medium' | 'low';
}

export interface SeenJob {
  hash: string;
  firstSeen: string;
  score: number;
  emailSent: boolean;
  source: string;
}

export interface DailyEmailCount {
  date: string;
  count: number;
}

export interface LeadLogEntry {
  timestamp: string;
  title: string;
  company: string;
  source: string;
  score: number;
  priority: string;
  url: string;
  emailSent: boolean;
  matchedKeywords: string[];
}
