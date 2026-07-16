/**
 * All kiosk-facing strings in one place, English + Hindi. The reception tablet
 * serves a Chhattisgarh audience, so हिंदी is a first-class toggle, not an
 * afterthought. Add a key here and it's available to every kiosk screen via
 * useKioskCopy().
 */

export type Lang = "en" | "hi";

export const KIOSK_COPY = {
  en: {
    // Attract
    welcome: "Welcome to The Urban Escape",
    welcomeSub: "Check in or book a room — it only takes a minute",
    haveBooking: "I Have a Booking",
    haveBookingSub: "Check in for your stay",
    newBooking: "New Booking",
    newBookingSub: "Book a room now",
    tapToStart: "Touch anywhere to start",

    // Common
    back: "Back",
    next: "Next",
    cancel: "Cancel",
    tryAgain: "Try Again",
    askAtDesk: "Please ask at the reception desk.",
    loading: "Please wait…",

    // Inactivity
    stillThere: "Are you still there?",
    stillThereSub: "This will reset in a few seconds.",
    yesContinue: "Yes, continue",

    // Staff exit
    staffAccess: "Staff Access",
    enterPin: "Enter staff PIN",
    exit: "Exit Kiosk",
    wrongPin: "Wrong PIN.",

    langName: "English",
  },
  hi: {
    // Attract
    welcome: "द अर्बन एस्केप में आपका स्वागत है",
    welcomeSub: "चेक-इन करें या कमरा बुक करें — बस एक मिनट",
    haveBooking: "मेरी बुकिंग है",
    haveBookingSub: "अपने ठहरने के लिए चेक-इन करें",
    newBooking: "नई बुकिंग",
    newBookingSub: "अभी कमरा बुक करें",
    tapToStart: "शुरू करने के लिए कहीं भी छुएँ",

    // Common
    back: "पीछे",
    next: "आगे",
    cancel: "रद्द करें",
    tryAgain: "फिर कोशिश करें",
    askAtDesk: "कृपया रिसेप्शन डेस्क पर पूछें।",
    loading: "कृपया प्रतीक्षा करें…",

    // Inactivity
    stillThere: "क्या आप वहाँ हैं?",
    stillThereSub: "कुछ ही सेकंड में यह रीसेट हो जाएगा।",
    yesContinue: "हाँ, जारी रखें",

    // Staff exit
    staffAccess: "स्टाफ़ एक्सेस",
    enterPin: "स्टाफ़ पिन दर्ज करें",
    exit: "कियोस्क से बाहर",
    wrongPin: "ग़लत पिन।",

    langName: "हिंदी",
  },
} as const;

export type KioskCopyKey = keyof typeof KIOSK_COPY["en"];
