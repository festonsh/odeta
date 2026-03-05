import type { Transporter } from 'nodemailer'
import nodemailer from 'nodemailer'

let _transport: Transporter | null = null

function getTransport(): Transporter | null {
  if (_transport) return _transport
  const host = process.env.SMTP_HOST
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  if (!host || !user || !pass) return null
  _transport = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user, pass }
  })
  return _transport
}

const defaultFrom = process.env.SMTP_FROM || 'OD Scheduler <noreply@odetaa.com>'

/**
 * Send an email. No-op if SMTP is not configured (no error).
 */
export async function sendEmail(options: {
  to: string
  subject: string
  text: string
  html?: string
}): Promise<void> {
  const transport = getTransport()
  if (!transport) return
  try {
    await transport.sendMail({
      from: defaultFrom,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html || options.text.replace(/\n/g, '<br>')
    })
  } catch {
    // Don't fail the request if email fails
  }
}

export async function sendAssignmentNotification(options: {
  to: string
  employeeName: string
  projectName: string
  date: string
  startTime?: string | null
  endTime?: string | null
  workType?: string | null
  meetingPoint?: string | null
  notes?: string | null
}): Promise<void> {
  const { to, employeeName, projectName, date, startTime, endTime, workType, meetingPoint, notes } = options
  const timeStr = [startTime, endTime].filter(Boolean).length ? ` ${startTime ?? ''} – ${endTime ?? ''}`.trim() : ''
  const lines = [
    `Hi ${employeeName},`,
    '',
    `You have been assigned to **${projectName}** on ${date}.${timeStr ? ` Time: ${timeStr}` : ''}`,
    ...(workType ? [`Work type: ${workType}`] : []),
    ...(meetingPoint ? [`Meeting point: ${meetingPoint}`] : []),
    ...(notes ? [`Notes: ${notes}`] : []),
    '',
    'View your schedule: My schedule in OD Scheduler.'
  ]
  const text = lines.join('\n')
  await sendEmail({
    to,
    subject: `Assignment: ${projectName} on ${date}`,
    text,
    html: text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>')
  })
}

export async function sendBulkAssignmentNotification(options: {
  to: string
  employeeName: string
  projectName: string
  startDate: string
  endDate: string
  startTime?: string | null
  endTime?: string | null
  workType?: string | null
  meetingPoint?: string | null
  notes?: string | null
}): Promise<void> {
  const { to, employeeName, projectName, startDate, endDate, startTime, endTime, workType, meetingPoint, notes } = options
  const timeStr = [startTime, endTime].filter(Boolean).length ? ` ${startTime ?? ''} – ${endTime ?? ''}`.trim() : ''
  const lines = [
    `Hi ${employeeName},`,
    '',
    `You have been assigned to **${projectName}** from ${startDate} to ${endDate}.${timeStr ? ` Time: ${timeStr}` : ''}`,
    ...(workType ? [`Work type: ${workType}`] : []),
    ...(meetingPoint ? [`Meeting point: ${meetingPoint}`] : []),
    ...(notes ? [`Notes: ${notes}`] : []),
    '',
    'View your schedule: My schedule in OD Scheduler.'
  ]
  const text = lines.join('\n')
  await sendEmail({
    to,
    subject: `Assignments: ${projectName} (${startDate} – ${endDate})`,
    text,
    html: text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>')
  })
}
