/**
 * Knowledge base for the AI voice call assistant.
 *
 * This is the ONLY narrative source the voice agent may speak from (policies,
 * FAQs, directions). It is deliberately **price-free**: all pricing and
 * availability come from the `/api/assistant/availability` and `/quote` tools,
 * which read the live DB. The agent must never quote a price from this file.
 *
 * ── Grounding rules (guardrail G1) ──────────────────────────────────────────
 *  • Every `status: "confirmed"` fact is sourced from code/DB or owner-provided
 *    content and is safe for the agent to state.
 *  • Every `status: "draft"` fact is a PLACEHOLDER the owner must review. The
 *    hotel-info endpoint filters drafts OUT, so the agent can never speak an
 *    unconfirmed answer. Flip a draft to "confirmed" (and correct its text) only
 *    after the owner signs off.
 *
 * ── Cancellation policy source of truth ─────────────────────────────────────
 *  The cancellation text below is derived from `src/lib/utils/cancellation.ts`
 *  (the tiers the cancel/refund routes actually enforce). NOTE: the existing
 *  chatbot copy in `resortData.ts` and SEO FAQs in `constants/seo.ts` state a
 *  DIFFERENT (stale) policy — those should be reconciled separately.
 */

export const ASSISTANT_PERSONA = {
  name: "The Urban Escape assistant",
  tagline: "By Saubhagya Mangalam",
  googleMaps: "https://maps.app.goo.gl/tm4cHuKkTpe39ymd6",
  /** Spoken on pickup — recording/AI disclosure + consent (guardrail G5 context). */
  greetingDisclosure:
    "Namaste! You've reached The Urban Escape. This is our AI assistant, and this call may be recorded.",
} as const;

/**
 * Enforced cancellation policy — mirrors `getCancellationPolicy()` tiers.
 * Keep this in lock-step with `src/lib/utils/cancellation.ts` if the tiers change.
 */
export const CANCELLATION_POLICY_TEXT =
  "Free cancellation when you cancel more than 72 hours before check-in — you get a full refund. " +
  "Between 24 and 72 hours before check-in, 50% of the room charges are deducted. " +
  "Within 24 hours of check-in, the room charges are non-refundable. " +
  "The refundable deposit of ₹200 is always returned in full, no matter when you cancel.";

/**
 * Confirmed policy statements the agent may state verbatim. Payment options are
 * NOT here — they depend on live per-hotel toggles and are built in the endpoint.
 */
export const POLICIES = {
  cancellation: CANCELLATION_POLICY_TEXT,
  deposit:
    "A refundable security deposit of ₹200 is collected at check-in and returned at check-out, provided there is no damage.",
  idProof:
    "A valid government photo ID — Aadhaar, PAN, Passport, or Driving Licence — is mandatory at check-in for the primary guest.",
  pets: "Pets are not allowed at the property.",
  extraBed:
    "An extra bed can be arranged on request for an additional charge — please ask in advance so we can keep it ready.",
  earlyCheckIn:
    "Early check-in is possible subject to room availability — please call ahead so we can try to arrange it.",
  lateCheckOut:
    "Late check-out is subject to availability and may attract an additional charge.",
  gst: "GST is applied as per government norms and shown separately at booking. Rooms priced at ₹1,000 per night or below are GST-exempt.",
} as const;

export interface Faq {
  q: string;
  a: string;
  /** Only "confirmed" entries are served to the agent. "draft" = awaiting owner sign-off. */
  status: "confirmed" | "draft";
}

/**
 * FAQ knowledge. CONFIRMED entries are grounded in code/DB or the existing
 * production chatbot content. DRAFT entries need the owner to confirm the real
 * answer — they are filtered out of the endpoint until then.
 */
export const FAQS: Faq[] = [
  // ── Confirmed (grounded) ───────────────────────────────────────────────────
  {
    status: "confirmed",
    q: "Where is the resort located?",
    a: "We're in Kohka, Bhilai, Chhattisgarh. I can share our Google Maps location on WhatsApp if that helps.",
  },
  {
    status: "confirmed",
    q: "Do you allow pets?",
    a: "I'm sorry, pets are not allowed at the property.",
  },
  {
    status: "confirmed",
    q: "Is parking available?",
    a: "Yes, we have free parking on site.",
  },
  {
    status: "confirmed",
    q: "Is there a power backup?",
    a: "Yes, we have power backup.",
  },
  {
    status: "confirmed",
    q: "Do the rooms have air conditioning?",
    a: "Our AC Cottages and AC Rooms are air-conditioned. The Non-AC Rooms are naturally ventilated with forest views.",
  },
  {
    status: "confirmed",
    q: "What ID do I need at check-in?",
    a: "A government photo ID — Aadhaar, PAN, Passport, or Driving Licence — is required at check-in.",
  },
  {
    status: "confirmed",
    q: "Is there a security deposit?",
    a: "Yes, a refundable deposit of ₹200 is collected at check-in and returned at check-out if there's no damage.",
  },
  {
    status: "confirmed",
    q: "What is the cancellation policy?",
    a: CANCELLATION_POLICY_TEXT,
  },
  {
    status: "confirmed",
    q: "Is Wi-Fi available?",
    a: "Yes, we offer free Wi-Fi.",
  },

  // ── Draft — OWNER MUST CONFIRM before these are served (currently filtered out)
  {
    status: "draft",
    q: "Do you provide food / is there a restaurant?",
    a: "TODO(owner): Confirm meal/restaurant arrangements — is food available on site? Is breakfast included? Any menu or timings?",
  },
  {
    status: "draft",
    q: "How far is the resort from the railway station / airport / bus stand?",
    a: "TODO(owner): Confirm approximate distance/time from Bhilai/Durg station and Raipur airport.",
  },
  {
    status: "draft",
    q: "Are nearby attractions or sightseeing available?",
    a: "TODO(owner): List nearby attractions and rough distances.",
  },
  {
    status: "draft",
    q: "Is alcohol allowed on the property?",
    a: "TODO(owner): Confirm alcohol policy.",
  },
  {
    status: "draft",
    q: "Is there a swimming pool?",
    a: "TODO(owner): Confirm whether a pool is available.",
  },
  {
    status: "draft",
    q: "Can you host events, parties, or functions?",
    a: "TODO(owner): Confirm event/function hosting, capacity, and whether it needs advance booking.",
  },
  {
    status: "draft",
    q: "Do you allow unmarried couples / accept local IDs?",
    a: "TODO(owner): Confirm couple/local-ID policy (a common question for resorts in the region).",
  },
  {
    status: "draft",
    q: "What is the exact charge for an extra bed?",
    a: "TODO(owner): Confirm the exact extra-bed charge.",
  },
];

/** FAQs safe for the agent to speak — drafts are excluded. */
export function confirmedFaqs(): { q: string; a: string }[] {
  return FAQS.filter((f) => f.status === "confirmed").map(({ q, a }) => ({ q, a }));
}
