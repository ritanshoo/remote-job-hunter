import nodemailer from 'nodemailer';
import { ScoredJob } from './types.js';
import { existsSync } from 'fs';
import path from 'path';
import { GMAIL_USER, GMAIL_APP_PASSWORD, PROFILE, log, DRY_RUN, RESUME_PATH } from './config.js';
import { generateEmailWithLLM } from './template.js';

let transporter: nodemailer.Transporter | null = null;
let emailErrorOccurred = false;

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: GMAIL_USER,
        pass: GMAIL_APP_PASSWORD,
      },
    });
  }
  return transporter;
}

export function hasEmailError(): boolean {
  return emailErrorOccurred;
}

export async function sendApplicationEmail(
  job: ScoredJob,
  recipientEmail: string
): Promise<{ success: boolean; error?: string }> {
  if (DRY_RUN) {
    log('emailer', `[DRY RUN] Would send email to ${recipientEmail} for "${job.title}" at ${job.company}`);
    return { success: true };
  }

  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    log('emailer', 'Gmail credentials not configured, skipping email');
    return { success: false, error: 'No Gmail credentials' };
  }

  if (emailErrorOccurred) {
    log('emailer', 'Skipping email - previous error in this run');
    return { success: false, error: 'Email sending disabled due to previous error' };
  }

  const { subject, body } = await generateEmailWithLLM(job);

  try {
    const transport = getTransporter();
    const mailOptions: any = {
      from: `"${PROFILE.name}" <${GMAIL_USER}>`,
      to: recipientEmail,
      subject,
      text: body,
    };

    // Attach resume if file exists
    const resumeFullPath = path.resolve(RESUME_PATH);
    if (existsSync(resumeFullPath)) {
      mailOptions.attachments = [{
        filename: 'Ritanshu_Singh_Resume.pdf',
        path: resumeFullPath,
      }];
      log('emailer', `Attaching resume: ${resumeFullPath}`);
    }

    const info = await transport.sendMail(mailOptions);

    log('emailer', `Email sent to ${recipientEmail} - messageId: ${info.messageId}`);
    return { success: true };
  } catch (err: any) {
    emailErrorOccurred = true;
    const errMsg = err?.message || String(err);
    log('emailer', `GMAIL ERROR: ${errMsg} - stopping all email sending for this run`);
    return { success: false, error: errMsg };
  }
}
