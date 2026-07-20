import nodemailer from "nodemailer";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { env } from "../config/env";
import { SendResult } from "../types";
import { EmailContext, renderEmail } from "./emailTemplates";

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;

function getTransporter() {
  if (!env.AWS_ACCESS_KEY_ID || !env.AWS_SECRET_ACCESS_KEY || !env.SES_FROM_EMAIL) {
    throw new Error(
      "Email sending is not configured — set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY and SES_FROM_EMAIL in .env"
    );
  }
  if (!transporter) {
    const sesClient = new SESv2Client({
      region: env.AWS_REGION,
      credentials: { accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY },
    });
    transporter = nodemailer.createTransport({ SES: { sesClient, SendEmailCommand } });
  }
  return transporter;
}

export interface SendColdEmailInput {
  toEmail: string;
  variantIndex: number;
  context: EmailContext;
}

/**
 * Sends one cold email via SES. Your sending domain needs SPF, DKIM, and
 * DMARC configured and your sender identity verified in SES before this
 * will work — see README. Using a subdomain (e.g. outreach.yourdomain.com)
 * for cold email keeps a bad sender reputation from touching your main
 * domain's deliverability.
 */
export async function sendColdEmail(input: SendColdEmailInput): Promise<SendResult> {
  const { subject, text } = renderEmail(input.variantIndex, input.context);

  try {
    const info = await getTransporter().sendMail({
      from: `${env.SES_FROM_NAME} <${env.SES_FROM_EMAIL}>`,
      to: input.toEmail,
      replyTo: env.REPLY_TO_EMAIL ?? env.SES_FROM_EMAIL,
      subject,
      text,
    });
    return { ok: true, providerMessageId: info.messageId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
