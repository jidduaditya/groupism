import { randomBytes } from 'crypto';

// 64-char hex — stored only in organiser's browser, never in URL
export function generateOrganiserToken(): string {
  return randomBytes(32).toString('hex');
}

// 32-char hex — stored in member's browser localStorage
export function generateMemberToken(): string {
  return randomBytes(16).toString('hex');
}

// URL-safe slug: "goa-march-a3f2"
// Used as the trip's permanent URL identifier
export function generateJoinToken(tripName: string): string {
  const slug = tripName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .join('-')
    .substring(0, 20);

  const suffix = randomBytes(2).toString('hex');
  return slug ? `${slug}-${suffix}` : `trip-${suffix}`;
}
