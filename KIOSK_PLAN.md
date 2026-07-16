# Self Check-in Kiosk — Implementation Plan

A reception-desk tablet where guests check themselves in (or create a walk-in
booking) via a locked, full-screen, step-by-step wizard. Staff keep key
handover; the kiosk does the paperwork.

**Approach:** kiosk routes inside this Next.js app (`/kiosk`), locked on the
tablet via Android screen pinning (pilot) → Fully Kiosk Browser (production).
No native APK — it would only re-wrap the same web kiosk and cost 2–3 extra
sessions to save an ~₹800 one-time license.

---

## What the codebase already provides

| Existing asset | Reused for |
|---|---|
| `POST /api/checkin` — zod-validated check-in (ID type/number/photos, coming-from/going-to, vehicle, companions) | Kiosk submits the same payload; core logic extracted to a shared service |
| `BookingCompanion` model (`idFrontUrl`/`idBackUrl` per person) | Companion ID capture, unchanged |
| Cloudinary unsigned upload direct from client (`OnlineCheckinForm`) | Tablet-camera ID photos via `<input capture>` |
| WhatsApp OTP pattern — `gupshup.sendPasswordResetOtp`, bcrypt-hashed OTP + expiry + attempts (forgot-password flow) | Phone-number verification |
| `POST /api/hotel-admin/bookings/admin` — staff walk-in creation (room/price/GST) | Walk-in flow calls same internals with kiosk guard |
| Counter check-in route, hotel-admin dashboard, `src/lib/ratelimit.ts` | Staff side + abuse protection |

Genuinely new: (1) kiosk **device identity** (scoped credential on the tablet,
never a staff session), (2) the guest-facing wizard UI.

---

## Security model (non-negotiables)

- Tablet holds a **kiosk device token** valid ONLY for the 4 kiosk endpoints.
  Escaping the UI exposes nothing — the token cannot list bookings or reach
  admin/customer APIs.
- Booking lookup requires **two factors**:
  - booking ref → confirm **last 4 digits of phone** on the booking
  - phone number → **OTP via WhatsApp** (feature-flagged until Gupshup
    Authentication template is approved)
- Lookup responses are **masked** ("R•••t Sharma, 2 guests, tonight") until
  verified. Phone matching multiple bookings returns only today's/upcoming one.
- Verification mints a **15-min JWT bound to that one bookingId + deviceId** —
  the only credential that authorizes check-in submission.
- **Inactivity reset**: 75s idle → 15s countdown → wipe all state.
- **Staff exit**: 5 taps top-left corner → PIN pad.
- Rate limits per device on lookup/verify (5 attempts / 10 min → cooldown).

---

## Phase 0 — Decisions & prep (owner, ~1 day, no code)

1. Buy hardware: Android tablet (₹12–18k, 10"+, front camera required), desk
   mount, always-on charger.
2. Pilot lockdown = free Android screen pinning + PWA. Buy Fully Kiosk
   Browser (~₹800 one-time) only after the pilot proves out.
3. Chase Gupshup Authentication-template approval (devsupport@gupshup.io,
   Customer ID 4000328044). Not a blocker — launch with ref + last-4 only.
4. Walk-in payment policy: launch = "pay at desk" (booking created
   PENDING_PAYMENT, staff settles). Razorpay dynamic UPI QR = Phase 6.

## Phase 1 — Kiosk device identity (backend foundation)

5. Migration: `KioskDevice` model — `id, hotelId, name, tokenHash, isActive,
   pairedAt, lastSeenAt`.
6. Pairing: hotel-admin "Kiosk Devices" page → 6-digit pairing code (5-min
   expiry) → tablet enters it at `/kiosk/pair` → server mints long random
   device token (stored hashed) → tablet keeps it in `localStorage`.
7. Guard `requireKiosk(req)` in `src/lib/auth/` — validates `x-kiosk-token`
   header, returns `{ hotelId, deviceId }`, bumps `lastSeenAt`.
8. Revocation: device list with "Deactivate" in hotel-admin.

**Accept:** revoked/absent token → 401 on every kiosk endpoint; token useless
against all existing APIs.

## Phase 2 — Kiosk API endpoints (the only 4 doors)

All under `/api/kiosk/*`, `requireKiosk`-guarded, rate-limited per device.

9.  `POST /api/kiosk/lookup` — `{ bookingRef }` or `{ phone }` → masked
    summary + short-lived `lookupId`. Never a list. Generic "no booking
    found" for misses (no information leak).
10. `POST /api/kiosk/verify` — `{ lookupId, last4 }` or `{ lookupId, otp }`
    → 15-min check-in session JWT (bookingId + deviceId bound).
11. `POST /api/kiosk/checkin` — extract existing `/api/checkin` core into
    `src/lib/services/checkin.ts`; customer route and kiosk route both call
    it. Sets `onlineCheckinDone`; notifies staff (WhatsApp/dashboard):
    "Kiosk check-in completed for UE-xxxx — assign room & hand over keys."
12. `GET /api/kiosk/walkin/availability` + `POST /api/kiosk/walkin` — reuse
    category-availability logic + admin walk-in internals; force
    walk-in source, `PENDING_PAYMENT`, pay-at-desk; upsert Guest by phone.

**Accept (Postman):** cannot enumerate bookings, cannot read unmasked booking
without verification, cannot check into a booking whose JWT you don't hold.

## Phase 3 — Kiosk UI shell (`/kiosk` route group)

13. Own root layout: no Navbar/chatbot/CartBar/MobileBookBar;
    `user-select:none`; no external links; base font ~1.5× site default;
    tap targets ≥ 64px.
14. Global kiosk provider: inactivity reset (75s → 15s countdown → wipe),
    staff exit (5 corner taps → PIN), EN/हिंदी toggle with all strings in one
    `kiosk-copy.ts` dictionary.
15. Attract screen: imagery slideshow + two giant buttons — Check In /
    New Booking.

## Phase 4 — Self check-in wizard

16. One component per step, shared `<KioskStep>` frame (progress dots, big
    Back/Next):
    1. Find booking (numeric keypad for phone; ref entry)
    2. Verify (last-4 or OTP)
    3. Confirm identity ("Is this you?")
    4. Guest details (prefilled, editable)
    5. Companions (cards, count validated vs `noOfPersons`)
    6. ID capture per adult (tablet camera → Cloudinary, preview + retake)
    7. Trip info (coming from / going to / purpose / vehicle)
    8. Done — "Collect your keys at the desk", auto-reset 20s
17. Every step survives: network failure (retry + "ask at the desk"),
    abandonment (inactivity wipe), duplicate submit (idempotent by bookingId).

## Phase 5 — Walk-in booking wizard

18. Steps: tonight's available rooms (photo + price) → nights & guests →
    guest details + phone → ID capture → summary → "Pay at desk" → Done.
19. Staff notification; booking shows in hotel-admin as pending-payment with
    a "kiosk" badge.

## Phase 6 — Staff-side polish

20. Kiosk-completed check-ins surface on bookings page (badge + room-assign
    prompt); kiosk settings page final UI (pairing, PIN, device list).
21. Later/optional: Razorpay dynamic UPI QR at kiosk; housekeeping board
    (Clean/Dirty/In-progress per room — also the operational fix for the
    cleanliness complaints in OTA reviews); guest-register PDF export.

## Phase 7 — Tablet deployment

22. Pilot: install PWA to home screen, Android screen pinning + unpin PIN.
23. Production: Fully Kiosk Browser — start URL
    `https://www.myurbanescape.in/kiosk`, kiosk lock, status bar hidden,
    screensaver = attract screen, daily 4 AM reload, motion wake, boot on
    startup.
24. Skip the APK unless a browser-impossible need appears (card reader,
    offline mode). Camera ID capture works in the browser.

## Phase 8 — Hardening & pilot

25. Test matrix: wrong last-4 ×5 (lockout), OTP to unknown number (generic
    miss, no leak), already-checked-in re-lookup ("ask at desk"),
    cancelled/unpaid booking (blocked, friendly), token revoked mid-flow.
26. Pilot protocol: one weekend, staff standing beside the tablet watching
    real guests; iterate copy/fonts/steps before trusting it unattended.

---

## Sequencing & effort

| Phase | Ships | Effort |
|---|---|---|
| 1–2 | Secure backend (device auth + 4 endpoints) | 2–3 sessions |
| 3–4 | Check-in kiosk end-to-end | 3–4 sessions |
| 5 | Walk-in booking | 1–2 sessions |
| 6–8 | Staff polish + deploy + pilot | 1–2 sessions + a weekend |

Order matters: 1→2→3→4 ships self check-in alone; walk-ins only after that
survives a real weekend.

## Open decisions (owner)

1. Walk-in "pay at desk" at launch — OK? (UPI QR later.)
2. Hindi copy at launch, or English-first and Hindi after pilot?
3. Gupshup Authentication template status? (Gates phone-OTP lookup;
   ref + last-4 ships regardless.)
