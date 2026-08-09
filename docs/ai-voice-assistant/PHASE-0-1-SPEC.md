# AI Voice Call Assistant — Phase 0 & Phase 1 Spec

**Project:** myurbanescape.in (The Urban Escape, By Saubhagya Mangalam — Bhilai, CG)
**Goal:** Automate the phone-booking channel with an AI call attendant that answers
queries and takes bookings verbally, sends a WhatsApp payment link, confirms on
payment, and updates the portal DB/admin.
**Chosen stack:** Self-hosted orchestration (built here) + Sarvam speech APIs + Claude.
**Priority order:** correctness ("flawless") > affordability > speed.

---

## 0. Design principles (the "flawless" contract)

Voice AI over a phone line in Hindi/Hinglish **will** occasionally mishear. The system
is engineered so that **every failure is a *safe* failure** — it never double-books,
never charges the wrong amount, and always hands off to a human instead of guessing.

| Rule | Enforced by |
|---|---|
| **G1 — DB-grounded facts only.** The model never states availability/price it didn't get from a tool call. | System prompt + tools are the *only* source of numbers. |
| **G2 — Confirm before commit.** Every date, category, guest name, phone, amount is read back and verbally confirmed before any write. | Orchestrator conversation flow (Phase 2) + `confirm=true` required on write endpoints. |
| **G3 — Payment-gated booking.** A call creates only a *hold*; the booking becomes `CONFIRMED` solely via the Razorpay webhook. | Reuses `confirmPaidBooking()` — money-first, idempotent. |
| **G4 — No silent overbooking.** Capacity is re-checked *at confirmation time*, not just at hold time. | New guard in the payment-link webhook path (§0.6). |
| **G5 — Human fallback.** Anything off the happy path (groups, complaints, low STT confidence, repeated misunderstanding) captures a callback instead of improvising. | Callback endpoint (§Phase 1) + escalation prompt rules. |
| **G6 — Everything auditable.** Full transcript + recording + tool-call log stored per call. | Call-log model (Phase 1). |

---

# PHASE 0 — Backend foundations (no voice, zero guest impact)

Phase 0 is **pure backend**. It builds and unit-tests the entire tool + payment
surface the voice agent will eventually use, *before* any call ever lands. Nothing
here is guest-visible until wired to voice in Phase 1/2, so it can be built and
hardened at leisure.

All new endpoints live under `/api/assistant/*` and are **server-to-server only**
(the orchestrator holds a secret; no browser ever calls these).

### 0.1 Assistant API auth + rate limit

- **New:** `src/lib/assistant/auth.ts` — verify a bearer token `ASSISTANT_API_KEY`
  (constant-time compare) on every `/api/assistant/*` request. Reject non-matching
  with 401.
- Reuse existing `enforceRateLimit()` (`src/lib/ratelimit.ts`, Upstash) per endpoint.
- Env: `ASSISTANT_API_KEY` (high-entropy), `ASSISTANT_HOTEL_ID` (the single hotel id,
  so the orchestrator never has to know/guess it).

### 0.2 Read tool — availability (all categories in one call)

The voice agent needs *all* categories at once, not one HTTP call per category.

```
GET /api/assistant/availability?checkIn=YYYY-MM-DD&checkOut=YYYY-MM-DD
Auth: Bearer ASSISTANT_API_KEY
→ 200
{
  "checkIn": "2026-08-03", "checkOut": "2026-08-05", "nights": 2,
  "categories": [
    { "type": "LUXURY_COTTAGE", "displayName": "Luxury Cottage",
      "maxGuests": 4, "available": 2, "pricePerNight": 2500,
      "totalForStay": 5000 },
    ...
  ]
}
```

- Reuse `getCategoryCapacities()` + `inventoryHoldFilter()` (already batch-computes
  every category's capacity) and `resolveCategoryPrice()` per category for the
  check-in date. **No new availability math** — this endpoint is a thin composition
  of existing utils, guaranteeing the agent sees exactly what the website sees.

### 0.3 Read tool — price quote (authoritative totals, incl. tax + discounts)

Pricing must never be computed by the LLM. This returns the same numbers the booking
route would.

```
GET /api/assistant/quote?category=LUXURY_COTTAGE&checkIn=...&checkOut=...&couponCode=OPTIONAL
→ 200
{
  "category": "LUXURY_COTTAGE", "nights": 2,
  "pricePerNight": 2500, "roomRent": 5000,
  "couponDiscount": 0, "taxableAmount": 5000,
  "cgst": ..., "sgst": ..., "totalAmount": ...,
  "refundableDeposit": 200
}
```

- Reuse `resolveCategoryPrice()` → `getUniversalDiscount()` / `resolveBookingDiscount()`
  → `computeTotals()` (the exact chain in `POST /api/bookings`). Extract that chain
  into `src/lib/services/quote.ts` and call it from **both** the booking route and
  this endpoint, so they can never diverge.

### 0.4 Read tool — hotel info + FAQ knowledge base

```
GET /api/assistant/hotel-info
→ { name, address, city, checkInTime, checkOutTime, amenities[], phone,
    categories: [{displayName, maxGuests, pricePerNight, description}],
    policies: {...}, faqs: [{q, a}] }
```

- Hotel fields from `Hotel` + `CATEGORY_META`.
- **FAQ/policy content** authored in `src/lib/assistant/knowledge.ts` (cancellation
  policy, pets, check-in/out, deposit, directions, nearby attractions, payment
  options). This is the grounding corpus for query answering — single source of truth,
  version-controlled, reviewed by the owner.

### 0.5 Write tool — create phone hold + issue WhatsApp payment link

The one write the agent performs. Mirrors the `PAY_NOW` branch of `POST /api/bookings`
but (a) sets `source = PHONE`, (b) issues a **Razorpay Payment Link** instead of a
browser checkout order, (c) sends it over WhatsApp via an approved template.

```
POST /api/assistant/bookings/hold
{
  "category": "LUXURY_COTTAGE",
  "checkIn": "2026-08-03", "checkOut": "2026-08-05",
  "noOfPersons": 3,
  "guestName": "…", "guestPhone": "9…",
  "payMode": "PAY_NOW" | "PAY_PARTIAL",
  "couponCode": "OPTIONAL",
  "confirm": true          // G2: refuses to write unless the agent read back & confirmed
}
→ 200
{ "bookingRef": "TUE-…", "totalAmount": …, "amountToPay": …,
  "paymentLinkUrl": "https://rzp.io/i/…", "holdExpiresAt": "…",
  "whatsappSent": true }
```

Server steps (reuse existing helpers throughout):
1. Re-run the **capacity check** (`inventoryHoldFilter` + `resolveCategoryCapacity`) —
   never trust the agent's earlier read.
2. Resolve/create guest (`linkGuestContact`, existing logic).
3. Compute totals via the shared `quote.ts` chain (§0.3).
4. Create `Booking` with `status = PENDING_PAYMENT`, `source = PHONE`,
   `holdExpiresAt = now + PHONE_HOLD_MINUTES` (§0.5a).
5. Create `Payment` row (`mode ONLINE`, `status pending`, `amount = amountToPay`).
6. Create Razorpay **Payment Link**:
   `razorpay.paymentLink.create({ amount, currency:"INR", reference_id: bookingRef,
   expire_by: holdExpiresAt, notify:{sms:false,email:false}, notes:{ bookingRef } })`.
   Store `short_url` + link id on the Payment row (`notes` or a new `razorpayLinkId`
   column).
7. Send WhatsApp payment-link **template** (§0.7) with the `short_url`.
8. Return the link + `holdExpiresAt` so the agent can tell the guest verbally.

```
GET /api/assistant/bookings/{bookingRef}/status
→ { status: "PENDING_PAYMENT" | "CONFIRMED" | "EXPIRED", paid: bool, balanceDue }
```
The agent polls this a few times before ending the call ("I can see your payment came
through — you're confirmed") or tells the guest the link stays valid for N minutes.

### 0.5a Hold-window change (small, robust)

Today `inventoryHoldFilter()` holds `PENDING_PAYMENT` for 15 min via `createdAt`
(fine for website checkout). A phone guest needs longer to open WhatsApp and pay.

- **Add** `holdExpiresAt DateTime?` to `Booking`.
- **Change** `inventoryHoldFilter()` to occupy inventory when
  `PENDING_PAYMENT AND (holdExpiresAt ?? createdAt+15m) >= now`.
  → Website behaviour unchanged (null `holdExpiresAt`), phone bookings honour their
  explicit expiry.
- `PHONE_HOLD_MINUTES = 30` (constant), and the Razorpay link `expire_by` is set to
  the **same** instant, so the link dies exactly when the hold releases — no window
  where a guest can pay for a room that's already been released.

### 0.6 Payment confirmation — extend the Razorpay webhook (G3 + G4)

Payment Links don't fire the same `payment.captured`-by-known-order path the browser
flow uses (we don't know the auto-created order id up front). So:

- **Extend** `src/app/api/webhook/razorpay/route.ts` to also handle the
  **`payment_link.paid`** event:
  - Read `payload.payment_link.entity.reference_id` (= `bookingRef`) and
    `payload.payment.entity` (`id`, `amount`).
  - Look up booking by `bookingRef`.
  - **G4 capacity guard:** before confirming, re-run the capacity check *excluding this
    booking*. If capacity is somehow exceeded (a genuine race), **do not silently
    confirm** — mark the payment for **auto-refund + owner alert** ("overbooking averted,
    guest refunded, call them"). This is the one place money and inventory can collide;
    handle it explicitly rather than hope.
  - Otherwise call the existing `confirmPaidBooking({ bookingId, razorpayPaymentId,
    capturedPaise })` — already idempotent, already sends guest + owner WhatsApp and
    syncs AppSheet. **No change to `confirmPaidBooking` itself.**
- Subscribe to `payment_link.paid` in the Razorpay dashboard (in addition to
  `payment.captured`).

### 0.7 New WhatsApp template (Meta approval — start early, ~1–3 day lead time)

- **Template:** `payment_link` (category: *Utility/Payment*). Body params:
  `{{1}}` guest name, `{{2}}` hotel name, `{{3}}` booking ref, `{{4}}` amount,
  `{{5}}` dates, plus a URL button / body param for the `short_url`.
- **Add** `gupshup.sendPaymentLink(phone, {...})` following the exact pattern of the
  existing `sendTemplate(...)` calls in `src/lib/services/gupshup.ts`.
- Env: `GUPSHUP_TEMPLATE_PAYMENT_LINK`.

### 0.8 Phase 0 tests (the point of doing this first)

- Unit: `quote.ts` parity with `POST /api/bookings` totals across categories, coupons,
  partial pay.
- Integration: hold → link → **simulated** `payment_link.paid` webhook →
  `CONFIRMED`, correct `onlinePaid`/`balanceDue`, WhatsApp + AppSheet fired once
  (idempotency: fire the webhook twice → single confirm).
- Race: two holds on the last unit; second `payment_link.paid` hits the G4 guard →
  auto-refund + alert, no overbooking.
- Hold expiry: unpaid hold past `holdExpiresAt` releases inventory; expired link can't
  be paid.

**Phase 0 deliverable:** a fully tested, voice-agnostic booking+payment API. At this
point you could take "phone" bookings from *any* client (even a Postman script) safely.

---

# PHASE 1 — Voice, read-only (queries + live availability)

Phase 1 puts a **real voice** in front of guests but **only the read tools** (§0.2–0.4).
No booking, no payment, **zero financial risk**. This is where Hindi handling and
conversation quality get earned cheaply, over weeks of real calls.

### 1.1 Orchestration service (separate, self-hosted — not in this repo)

A small Python service (Pipecat or LiveKit Agents) on a cheap VPS (no GPU):

```
Guest dials resort number
  │  SIP trunk (Exotel / Plivo)          ← Indian number, DLT-compliant
  ▼
Orchestrator (Pipecat/LiveKit Agents)
  ├─ STT:  Sarvam Saarika (Hindi/Hinglish)
  ├─ LLM:  Claude  (function-calling → the /api/assistant/* read tools)
  ├─ TTS:  Sarvam Bulbul (natural Hindi voice)
  └─ barge-in / interruption handling
```

- Holds only `ASSISTANT_API_KEY` + `ASSISTANT_HOTEL_ID`; all facts come from this repo's
  read tools.
- Target < ~800 ms response latency for a human feel.

### 1.2 Tools exposed to the LLM (Phase 1 = read-only)

| Tool | Endpoint | Purpose |
|---|---|---|
| `check_availability(checkIn, checkOut)` | `GET /api/assistant/availability` | live rooms + prices |
| `get_quote(category, checkIn, checkOut, coupon?)` | `GET /api/assistant/quote` | exact total incl. tax |
| `get_hotel_info()` | `GET /api/assistant/hotel-info` | address, timings, amenities, policies, FAQs |
| `request_callback(name, phone, note)` | `POST /api/assistant/callback` *(new, minimal write)* | human fallback (G5) |

`request_callback` is the only Phase 1 write — it just inserts a `CallbackRequest`
row surfaced in hotel-admin. Safe, non-financial.

### 1.3 System prompt & guardrails

- Persona: warm, concise front-desk attendant for The Urban Escape; Hindi/Hinglish/English
  mirroring the caller.
- **G1:** "Only state availability, prices, or facts returned by a tool. If a tool
  didn't return it, say you'll have someone call back — never guess."
- **Consent line** on pickup: *"Namaste, this is The Urban Escape's AI assistant, this
  call may be recorded."*
- **Escalation (G5):** groups, events, complaints, refunds, or 2 consecutive
  misunderstandings → `request_callback` + polite handoff.
- No commitments about booking/payment in Phase 1 ("our team will confirm the booking
  on a callback" — until Phase 2 goes live).

### 1.4 Knowledge base

- Authored `knowledge.ts` (§0.4) reviewed and signed off by the owner: cancellation
  policy, deposit, pets, food, directions/landmarks, nearby attractions, payment modes,
  check-in/out times.

### 1.5 Call logging / audit (G6)

- **New model** `CallLog` (id, fromPhone, startedAt, endedAt, transcript JSON,
  recordingUrl, toolCalls JSON, outcome, callbackRequested).
- Surfaced read-only in hotel-admin so staff review real calls and you tune the prompt/KB.

### 1.6 Phase 1 acceptance gate (before a single guest call)

- ≥ 30 mock calls in Hindi/Hinglish/English by you + staff.
- Metrics: correct availability read, correct price quote, correct policy answers,
  clean escalation, no hallucinated facts (G1), consent line present.
- Only after this holds steady for a couple of weeks do we design **Phase 2**
  (voice-wired booking + the §0.5/0.6 payment path).

---

## Change inventory

**Phase 0 (this repo):**
- `src/lib/assistant/auth.ts` *(new)*
- `src/lib/services/quote.ts` *(new; also refactor `POST /api/bookings` to use it)*
- `src/lib/assistant/knowledge.ts` *(new)*
- `src/app/api/assistant/availability/route.ts` *(new)*
- `src/app/api/assistant/quote/route.ts` *(new)*
- `src/app/api/assistant/hotel-info/route.ts` *(new)*
- `src/app/api/assistant/bookings/hold/route.ts` *(new)*
- `src/app/api/assistant/bookings/[ref]/status/route.ts` *(new)*
- `src/lib/utils/inventory.ts` *(edit: `inventoryHoldFilter` honours `holdExpiresAt`)*
- `src/app/api/webhook/razorpay/route.ts` *(edit: handle `payment_link.paid` + G4 guard)*
- `src/lib/services/gupshup.ts` *(edit: add `sendPaymentLink`)*
- `prisma/schema.prisma` *(edit: `Booking.holdExpiresAt`, `Payment.razorpayLinkId?`)*
- Meta template `payment_link` (external approval)

**Phase 1 (this repo):**
- `src/app/api/assistant/callback/route.ts` *(new)*
- `prisma/schema.prisma` *(new `CallbackRequest`, `CallLog`)*
- hotel-admin views for callbacks + call logs

**Phase 1 (separate service):** orchestrator (Pipecat/LiveKit + Sarvam + Claude), SIP trunk.

**Not touched:** `confirmPaidBooking()`, the browser booking/checkout flow, AppSheet sync.
