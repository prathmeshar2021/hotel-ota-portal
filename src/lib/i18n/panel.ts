/**
 * Staff-panel translations (hotel-admin + super-admin only — never the guest
 * site). Reception staff here read some English but not fluently, so the Hindi
 * side deliberately keeps the English words that are already part of everyday
 * hotel vocabulary ("बुकिंग", "चेक-इन", "GST", "WhatsApp") instead of forcing
 * unfamiliar formal Hindi. The aim is a screen a Chhattisgarh front-desk
 * hire can scan quickly, not a purist translation.
 *
 * Both languages sit side by side so a key is never half-translated. Add a key
 * here and it's available to server components via getPanelT() and to client
 * components via usePanelT().
 *
 * Guest data (names, refs, amounts) and anything typed into an input is never
 * translated — only the surrounding labels.
 */

export type PanelLang = "en" | "hi";

/** Cookie is readable by both the server and the browser, so the toggle can flip
 *  server-rendered pages too. Not sensitive, so no httpOnly. */
export const PANEL_LANG_COOKIE = "panelLang";

export const PANEL_DICT = {
  // ── Navigation ──────────────────────────────────────────────────────────
  "nav.dashboard":     { en: "Dashboard",      hi: "डैशबोर्ड" },
  "nav.bookings":      { en: "Bookings",       hi: "बुकिंग" },
  "nav.rooms":         { en: "Rooms",          hi: "कमरे" },
  "nav.guests":        { en: "Guests",         hi: "मेहमान" },
  "nav.accounts":      { en: "Accounts",       hi: "अकाउंट्स" },
  "nav.gommtFinance":  { en: "GoMMT Finance",  hi: "GoMMT फाइनेंस" },
  "nav.ledger":        { en: "Ledger",         hi: "बही-खाता" },
  "nav.supportChat":   { en: "Support Chat",   hi: "सपोर्ट चैट" },
  "nav.kioskDevices":  { en: "Kiosk Devices",  hi: "कियोस्क डिवाइस" },
  "nav.myAccount":     { en: "My Account",     hi: "मेरा अकाउंट" },
  "nav.logout":        { en: "Logout",         hi: "लॉगआउट" },
  "nav.owner":         { en: "Owner",          hi: "मालिक" },
  "nav.staff":         { en: "Staff",          hi: "स्टाफ" },
  "nav.overview":      { en: "Overview",       hi: "ओवरव्यू" },
  "nav.pricing":       { en: "Pricing",        hi: "रेट / प्राइसिंग" },
  "nav.inventory":     { en: "Inventory",      hi: "इन्वेंटरी" },
  "nav.coupons":       { en: "Coupons",        hi: "कूपन" },
  "nav.promotions":    { en: "Promotions",     hi: "प्रमोशन" },
  "nav.gstReport":     { en: "GST Report",     hi: "GST रिपोर्ट" },
  "nav.staffDiscounts":{ en: "Staff Discounts",hi: "स्टाफ डिस्काउंट" },
  "nav.approvals":     { en: "Approvals",      hi: "अप्रूवल" },
  "nav.frontDesk":     { en: "Front Desk",     hi: "रिसेप्शन" },
  "nav.ownerConsole":  { en: "Owner Console",  hi: "मालिक का पैनल" },
  "nav.signOut":       { en: "Sign Out",       hi: "साइन आउट" },
  "nav.pendingApprovals": { en: "Pending Approvals", hi: "बाकी अप्रूवल" },
  "nav.newBooking":    { en: "New Booking",    hi: "नई बुकिंग" },

  // ── Language toggle ─────────────────────────────────────────────────────
  "lang.switchToHindi":   { en: "हिंदी में देखें", hi: "हिंदी में देखें" },
  "lang.switchToEnglish": { en: "View in English", hi: "English में देखें" },

  // ── Common actions ──────────────────────────────────────────────────────
  "common.save":     { en: "Save",       hi: "सेव करें" },
  "common.cancel":   { en: "Cancel",     hi: "कैंसिल" },
  "common.search":   { en: "Search",     hi: "खोजें" },
  "common.back":     { en: "Back",       hi: "वापस" },
  "common.next":     { en: "Next",       hi: "आगे" },
  "common.close":    { en: "Close",      hi: "बंद करें" },
  "common.confirm":  { en: "Confirm",    hi: "कन्फर्म करें" },
  "common.view":     { en: "View",       hi: "देखें" },
  "common.edit":     { en: "Edit",       hi: "बदलें" },
  "common.remove":   { en: "Remove",     hi: "हटाएं" },
  "common.add":      { en: "Add",        hi: "जोड़ें" },
  "common.optional": { en: "optional",   hi: "ज़रूरी नहीं" },
  "common.required": { en: "required",   hi: "ज़रूरी" },
  "common.today":    { en: "Today",      hi: "आज" },
  "common.all":      { en: "All",        hi: "सभी" },
  "common.none":     { en: "None",       hi: "कोई नहीं" },
  "common.loading":  { en: "Loading…",   hi: "लोड हो रहा है…" },
  "common.noResults":{ en: "No results", hi: "कुछ नहीं मिला" },
  "common.name":     { en: "Name",       hi: "नाम" },
  "common.phone":    { en: "Phone",      hi: "फ़ोन" },
  "common.email":    { en: "Email",      hi: "ईमेल" },
  "common.total":    { en: "Total",      hi: "कुल" },
  "common.amount":   { en: "Amount",     hi: "रकम" },
  "common.date":     { en: "Date",       hi: "तारीख" },
  "common.status":   { en: "Status",     hi: "स्टेटस" },
  "common.room":     { en: "Room",       hi: "कमरा" },
  "common.guest":    { en: "Guest",      hi: "मेहमान" },
  "common.nights":   { en: "Nights",     hi: "रातें" },

  // ── Booking status ──────────────────────────────────────────────────────
  "status.PENDING_PAYMENT": { en: "Pending Payment", hi: "पेमेंट बाकी" },
  "status.CONFIRMED":       { en: "Confirmed",       hi: "कन्फर्म" },
  "status.CHECKED_IN":      { en: "Checked In",      hi: "चेक-इन हो गया" },
  "status.CHECKED_OUT":     { en: "Checked Out",     hi: "चेक-आउट हो गया" },
  "status.CANCELLED":       { en: "Cancelled",       hi: "कैंसिल" },
  "status.NO_SHOW":         { en: "No Show",         hi: "मेहमान नहीं आया" },

  // ── Dashboard ───────────────────────────────────────────────────────────
  "dash.title":          { en: "Dashboard",              hi: "डैशबोर्ड" },
  "dash.arrivalsToday":  { en: "Arrivals Today",         hi: "आज आने वाले" },
  "dash.departuresToday":{ en: "Departures Today",       hi: "आज जाने वाले" },
  "dash.inHouse":        { en: "In House",               hi: "अभी ठहरे हुए" },
  "dash.roomsAvailable": { en: "Rooms Available",        hi: "खाली कमरे" },
  "dash.todayRevenue":   { en: "Today's Revenue",        hi: "आज की कमाई" },
  "dash.occupancy":      { en: "Occupancy",              hi: "ऑक्यूपेंसी" },
  "dash.quickActions":   { en: "Quick Actions",          hi: "जल्दी वाले काम" },
  "dash.newBooking":     { en: "New Booking",            hi: "नई बुकिंग" },
  "dash.goodMorning":    { en: "Good Morning",           hi: "सुप्रभात" },
  "dash.goodAfternoon":  { en: "Good Afternoon",         hi: "नमस्कार" },
  "dash.goodEvening":    { en: "Good Evening",           hi: "शुभ संध्या" },
  "dash.monthRevenue":   { en: "Month Revenue",          hi: "इस महीने की कमाई" },
  "dash.confirmedBookings": { en: "CONFIRMED bookings",  hi: "कन्फर्म बुकिंग" },
  "dash.dueToCheckOut":  { en: "Due to check out",       hi: "आज चेक-आउट होंगे" },
  "dash.occupancySuffix":{ en: "occupancy",              hi: "कमरे भरे" },
  "dash.todaysArrivals": { en: "Today's Arrivals",       hi: "आज आने वाले मेहमान" },
  "dash.todaysDepartures":{ en: "Today's Departures",    hi: "आज जाने वाले मेहमान" },

  // ── Bookings list ───────────────────────────────────────────────────────
  "bookings.title":        { en: "Bookings",                 hi: "बुकिंग" },
  "bookings.searchPlaceholder": { en: "Search by name, phone, ID or booking ref…", hi: "नाम, फ़ोन, ID या बुकिंग नंबर से खोजें…" },
  "bookings.checkIn":      { en: "Check-in",                 hi: "चेक-इन" },
  "bookings.checkOut":     { en: "Check-out",                hi: "चेक-आउट" },
  "bookings.arrivals":     { en: "Arrivals",                 hi: "आने वाले" },
  "bookings.departures":   { en: "Departures",               hi: "जाने वाले" },
  "bookings.upcoming":     { en: "Upcoming",                 hi: "आगे की" },
  "bookings.balanceDue":   { en: "Balance Due",              hi: "बाकी रकम" },
  "bookings.paid":         { en: "Paid",                     hi: "जमा" },
  "bookings.none":         { en: "No bookings found",        hi: "कोई बुकिंग नहीं मिली" },
  "bookings.all":          { en: "All Bookings",             hi: "सभी बुकिंग" },
  "bookings.arrivalsToday":{ en: "Arrivals Today",           hi: "आज आने वाले" },
  "bookings.departingToday":{ en: "Departing Today",         hi: "आज जाने वाले" },
  "bookings.inHouse":      { en: "In House",                 hi: "अभी ठहरे हुए" },
  "bookings.checkedOut":   { en: "Checked Out",              hi: "चेक-आउट हो गए" },

  // ── Booking detail ──────────────────────────────────────────────────────
  "bd.bookingDetails":   { en: "Booking Details",      hi: "बुकिंग की जानकारी" },
  "bd.guestDetails":     { en: "Guest Details",        hi: "मेहमान की जानकारी" },
  "bd.payment":          { en: "Payment",              hi: "पेमेंट" },
  "bd.roomRent":         { en: "Room Rent",            hi: "कमरे का किराया" },
  "bd.couponDiscount":   { en: "Coupon Discount",      hi: "कूपन छूट" },
  "bd.staffDiscount":    { en: "Staff Discount",       hi: "स्टाफ की छूट" },
  "bd.additionalCharges":{ en: "Additional Charges",   hi: "अतिरिक्त चार्ज" },
  "bd.refundableDeposit":{ en: "Refundable Deposit",   hi: "वापस होने वाली जमा राशि" },
  "bd.cashPaid":         { en: "Cash Paid",            hi: "नकद जमा" },
  "bd.onlinePaid":       { en: "Online Paid",          hi: "ऑनलाइन जमा" },
  "bd.specialRequests":  { en: "Special Requests",     hi: "खास फरमाइश" },
  "bd.companions":       { en: "Companions",           hi: "साथ में आए मेहमान" },
  "bd.idProof":          { en: "ID Proof",             hi: "ID प्रूफ" },
  "bd.noCharges":        { en: "No additional charges",hi: "कोई अतिरिक्त चार्ज नहीं" },

  // ── Guests ──────────────────────────────────────────────────────────────
  "guests.title":       { en: "Guests",                     hi: "मेहमान" },
  "guests.searchPlaceholder": { en: "Search by name, phone, email or ID number…", hi: "नाम, फ़ोन, ईमेल या ID नंबर से खोजें…" },
  "guests.pastBookings":{ en: "past bookings",              hi: "पुरानी बुकिंग" },
  "guests.none":        { en: "No guests found",            hi: "कोई मेहमान नहीं मिला" },
  "guests.registry":    { en: "Guest Registry",              hi: "मेहमानों की सूची" },
  "guests.registrySub": { en: "Walk-in registrations & returning guest lookup", hi: "नए रजिस्ट्रेशन और पुराने मेहमान खोजें" },
  "guests.registerGuest": { en: "Register Guest",            hi: "मेहमान रजिस्टर करें" },
  "guests.noneSearch":  { en: "No guests found — try a different search", hi: "कोई मेहमान नहीं मिला — कुछ और लिखकर देखें" },
  "guests.noneYet":     { en: "No guests registered yet",    hi: "अभी कोई मेहमान रजिस्टर नहीं है" },

  // ── Check-in form ───────────────────────────────────────────────────────
  "ci.title":          { en: "Counter Check-In",     hi: "काउंटर चेक-इन" },
  "ci.identityProof":  { en: "Identity Proof",       hi: "पहचान पत्र (ID)" },
  "ci.idType":         { en: "ID Type",              hi: "ID का प्रकार" },
  "ci.idNumber":       { en: "ID Number",            hi: "ID नंबर" },
  "ci.idFront":        { en: "ID Front Photo",       hi: "ID का आगे का फोटो" },
  "ci.idBack":         { en: "ID Back Photo",        hi: "ID का पीछे का फोटो" },
  "ci.travelDetails":  { en: "Travel Details",       hi: "आने-जाने की जानकारी" },
  "ci.comingFrom":     { en: "Coming From",          hi: "कहाँ से आए हैं" },
  "ci.goingTo":        { en: "Going To (after stay)",hi: "यहाँ से कहाँ जाएंगे" },
  "ci.purpose":        { en: "Purpose of Visit",     hi: "आने का कारण" },
  "ci.vehicleNo":      { en: "Vehicle Number",       hi: "गाड़ी नंबर" },
  "ci.companionDetails":{ en: "Companion Details",   hi: "साथ आए मेहमानों की जानकारी" },
  "ci.relation":       { en: "Relation",             hi: "रिश्ता" },
  "ci.collectDeposit": { en: "Collect refundable deposit now", hi: "वापस होने वाली जमा राशि अभी लें" },
  "ci.uploadTap":      { en: "Tap to upload",        hi: "अपलोड करने के लिए दबाएं" },
  "ci.uploading":      { en: "Uploading…",           hi: "अपलोड हो रहा है…" },
  "ci.saveRegistration":{ en: "Save Registration",   hi: "रजिस्ट्रेशन सेव करें" },

  // ── New booking form ────────────────────────────────────────────────────
  "nb.title":          { en: "New Booking",          hi: "नई बुकिंग" },
  "nb.selectDates":    { en: "Select Dates",         hi: "तारीख चुनें" },
  "nb.findRooms":      { en: "Find Rooms",           hi: "कमरे देखें" },
  "nb.findGuest":      { en: "Find Guest",           hi: "मेहमान खोजें" },
  "nb.registerNewGuest":{ en: "Register New Guest",  hi: "नया मेहमान रजिस्टर करें" },
  "nb.paymentDetails": { en: "Payment Details",      hi: "पेमेंट की जानकारी" },
  "nb.billSummary":    { en: "Bill Summary",         hi: "बिल का हिसाब" },
  "nb.bookingSource":  { en: "Booking Source",       hi: "बुकिंग कहाँ से" },
  "nb.paymentMode":    { en: "Payment Mode",         hi: "पेमेंट का तरीका" },
  "nb.cashAmount":     { en: "Cash Amount Paid",     hi: "नकद कितना लिया" },
  "nb.onlineAmount":   { en: "Online Amount Paid",   hi: "ऑनलाइन कितना लिया" },
  "nb.couponCode":     { en: "Coupon Code",          hi: "कूपन कोड" },
  "nb.apply":          { en: "Apply",                hi: "लगाएं" },
  "nb.staffDiscount":  { en: "Staff Discount",       hi: "स्टाफ की छूट" },
  "nb.discountNote":   { en: "off the final price, GST included", hi: "आखिरी रकम पर छूट, GST मिलाकर" },
  "nb.reasonPlaceholder": { en: "Reason (optional) — e.g. regular guest, group rate", hi: "कारण (ज़रूरी नहीं) — जैसे पुराना मेहमान, ग्रुप रेट" },
  "nb.confirmBooking": { en: "Confirm Booking",      hi: "बुकिंग कन्फर्म करें" },
  "nb.creating":       { en: "Creating Booking…",    hi: "बुकिंग बन रही है…" },
  "nb.fullyPaid":      { en: "Fully paid",           hi: "पूरा पेमेंट हो गया" },
  "nb.amountPaid":     { en: "Amount Paid",          hi: "जमा रकम" },
  "nb.noPhoneOnFile":  { en: "No phone on file",     hi: "फ़ोन नंबर नहीं है" },
  "nb.phoneRequired":  { en: "required to continue", hi: "आगे बढ़ने के लिए ज़रूरी" },
} as const;

export type PanelKey = keyof typeof PANEL_DICT;

/** Look up a key in the given language, falling back to English. */
export function translate(key: PanelKey, lang: PanelLang): string {
  const entry = PANEL_DICT[key];
  return (entry?.[lang] ?? entry?.en ?? key) as string;
}

export type PanelT = (key: PanelKey) => string;

/** Build a bound translator for a language. */
export function makeT(lang: PanelLang): PanelT {
  return (key: PanelKey) => translate(key, lang);
}

export function isPanelLang(v: unknown): v is PanelLang {
  return v === "en" || v === "hi";
}
