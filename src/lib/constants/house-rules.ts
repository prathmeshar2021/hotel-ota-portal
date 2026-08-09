/**
 * House rules shown to guests at self-registration.
 *
 * Wording mirrors the policies the hotel already states elsewhere, so a guest
 * is never told two different things. The age rule for couples is the one staff
 * are most often asked about at the desk, so it leads and is styled as the
 * headline rule rather than buried in a list.
 *
 * This is a plain constant on purpose — the registration page is public and must
 * never depend on anything that isn't committed.
 */

export interface HouseRule {
  title: string;
  detail: string;
  /** Rendered prominently — the one guests most often fall foul of. */
  emphasis?: boolean;
}

/** "12:00" → "12:00 PM"; a value that already says AM/PM is left alone. */
export function prettyTime(value: string): string {
  const v = value.trim();
  if (/[ap]\.?m\.?$/i.test(v)) return v.toUpperCase().replace(/\s+/g, " ");
  const m = v.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return v;
  const h = parseInt(m[1], 10);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${m[2]} ${suffix}`;
}

export function houseRules(opts: {
  checkInTime: string;
  checkOutTime: string;
}): HouseRule[] {
  return [
    {
      title: "Couples must both be 20 years or older",
      detail:
        "Both guests must carry a valid government photo ID showing age. Entry may be refused if either guest is under 20.",
      emphasis: true,
    },
    {
      title: "No entry or exit between 11:00 PM and 6:00 AM",
      detail:
        "The property is closed to movement overnight for security reasons. Please plan your arrival and departure outside these hours.",
    },
    {
      title: "Photo ID is mandatory for every guest",
      detail:
        "Aadhaar, Passport, Driving Licence or Voter ID for each person staying — not just the person who booked. This is a legal requirement.",
    },
    {
      title: `Check-in ${prettyTime(opts.checkInTime)} · Check-out ${prettyTime(opts.checkOutTime)}`,
      detail:
        "Early check-in and late check-out are subject to availability, and late check-out may attract an additional charge.",
    },
    {
      // No figure quoted — the deposit varies by booking, and a number printed
      // here would become the one the guest argues from at the desk.
      title: "A refundable security deposit is collected at check-in",
      detail:
        "The amount is confirmed at check-in and returned at check-out, less any charges for damage or extras used during the stay.",
    },
    {
      title: "Pets are not allowed",
      detail: "We're unable to accommodate pets anywhere on the property.",
    },
    {
      title: "Guests are responsible for damage",
      detail:
        "Any damage to hotel property is recoverable from the guest. An extra bed can be arranged on request for an additional charge.",
    },
  ];
}
