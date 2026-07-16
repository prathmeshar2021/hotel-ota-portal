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

    // Check-in wizard
    findTitle: "Find your booking",
    findSub: "Enter your booking number (from your WhatsApp confirmation)",
    bookingNumber: "Booking number",
    noBookingFound: "No booking found. Please check the number or ask at the desk.",
    verifyTitle: "Verify it's you",
    verifySub: "Enter the last 4 digits of the phone number on the booking",
    last4: "Last 4 digits of phone",
    confirmTitle: "Is this you?",
    guests: "Guests",
    nights: "Nights",
    room: "Room",
    yesThatsMe: "Yes, that's me",
    alreadyCheckedInMsg: "This booking is already checked in. Please collect your keys at the desk.",
    guestTitle: "Your ID details",
    guestSub: "As per your government photo ID",
    fullName: "Full name",
    idTypeLabel: "ID type",
    idNumberLabel: "ID number",
    idPhotoTitle: "Photo of your ID",
    idPhotoSub: "Take a clear photo of the front and back",
    idFront: "Front",
    idBack: "Back",
    retake: "Retake",
    takePhoto: "Take photo",
    companionsTitle: "Other guests",
    companionsSub: "Add ID details for everyone staying with you",
    addGuest: "Add guest",
    tripTitle: "A few trip details",
    comingFrom: "Coming from",
    goingTo: "Going to",
    purpose: "Purpose of visit",
    vehicle: "Vehicle number (optional)",
    other: "Other",
    reviewSubmit: "Complete check-in",
    doneTitle: "Check-in complete!",
    doneSub: "Please collect your keys at the reception desk.",
    finish: "Done",

    // Walk-in wizard
    pickRoomTitle: "Choose a room",
    pickRoomSub: "Available tonight",
    available: "available",
    soldOut: "Sold out",
    perNight: "/night",
    stayTitle: "How many?",
    guestsCount: "Guests",
    nightsCount: "Nights",
    detailsTitle: "Your details",
    detailsSub: "So we can confirm your booking",
    mobileNumber: "Mobile number",
    summaryTitle: "Confirm booking",
    total: "Total",
    plusTaxesDeposit: "Includes taxes & ₹200 refundable deposit",
    payAtDesk: "Book — Pay at desk",
    walkinDoneTitle: "Booking created!",
    walkinDoneSub: "Please complete payment at the reception desk.",
    maxGuestsNote: "Max guests for this room",

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

    // Check-in wizard
    findTitle: "अपनी बुकिंग खोजें",
    findSub: "अपना बुकिंग नंबर दर्ज करें (WhatsApp पुष्टि से)",
    bookingNumber: "बुकिंग नंबर",
    noBookingFound: "कोई बुकिंग नहीं मिली। कृपया नंबर जाँचें या डेस्क पर पूछें।",
    verifyTitle: "पुष्टि करें कि यह आप हैं",
    verifySub: "बुकिंग पर दिए फ़ोन नंबर के अंतिम 4 अंक दर्ज करें",
    last4: "फ़ोन के अंतिम 4 अंक",
    confirmTitle: "क्या यह आप हैं?",
    guests: "मेहमान",
    nights: "रातें",
    room: "कमरा",
    yesThatsMe: "हाँ, यह मैं हूँ",
    alreadyCheckedInMsg: "इस बुकिंग का चेक-इन हो चुका है। कृपया डेस्क से चाबी लें।",
    guestTitle: "आपकी आईडी जानकारी",
    guestSub: "आपकी सरकारी फ़ोटो आईडी के अनुसार",
    fullName: "पूरा नाम",
    idTypeLabel: "आईडी प्रकार",
    idNumberLabel: "आईडी नंबर",
    idPhotoTitle: "आपकी आईडी की फ़ोटो",
    idPhotoSub: "आगे और पीछे की साफ़ फ़ोटो लें",
    idFront: "आगे",
    idBack: "पीछे",
    retake: "फिर से लें",
    takePhoto: "फ़ोटो लें",
    companionsTitle: "अन्य मेहमान",
    companionsSub: "अपने साथ ठहरने वाले सभी की आईडी जानकारी जोड़ें",
    addGuest: "मेहमान जोड़ें",
    tripTitle: "कुछ यात्रा जानकारी",
    comingFrom: "कहाँ से आ रहे हैं",
    goingTo: "कहाँ जा रहे हैं",
    purpose: "आने का उद्देश्य",
    vehicle: "वाहन नंबर (वैकल्पिक)",
    other: "अन्य",
    reviewSubmit: "चेक-इन पूरा करें",
    doneTitle: "चेक-इन पूरा हुआ!",
    doneSub: "कृपया रिसेप्शन डेस्क से अपनी चाबी लें।",
    finish: "पूर्ण",

    // Walk-in wizard
    pickRoomTitle: "कमरा चुनें",
    pickRoomSub: "आज रात उपलब्ध",
    available: "उपलब्ध",
    soldOut: "उपलब्ध नहीं",
    perNight: "/रात",
    stayTitle: "कितने?",
    guestsCount: "मेहमान",
    nightsCount: "रातें",
    detailsTitle: "आपकी जानकारी",
    detailsSub: "ताकि हम आपकी बुकिंग की पुष्टि कर सकें",
    mobileNumber: "मोबाइल नंबर",
    summaryTitle: "बुकिंग की पुष्टि करें",
    total: "कुल",
    plusTaxesDeposit: "कर और ₹200 वापसी योग्य जमा शामिल",
    payAtDesk: "बुक करें — डेस्क पर भुगतान",
    walkinDoneTitle: "बुकिंग हो गई!",
    walkinDoneSub: "कृपया रिसेप्शन डेस्क पर भुगतान पूरा करें।",
    maxGuestsNote: "इस कमरे के लिए अधिकतम मेहमान",

    langName: "हिंदी",
  },
} as const;

export type KioskCopyKey = keyof typeof KIOSK_COPY["en"];
