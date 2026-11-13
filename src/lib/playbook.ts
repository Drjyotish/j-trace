import type { Country } from "./config";

export type Locale = "en" | "hi" | "ne";
export const LOCALES: Locale[] = ["en", "hi", "ne"];

export type Capability =
  | "AVAILABLE_NOW"
  | "REQUIRES_USER_PERMISSION"
  | "REQUIRES_TELECOM_PARTNERSHIP"
  | "REQUIRES_GOVERNMENT_AUTHORIZATION"
  | "NOT_TECHNICALLY_FEASIBLE";

export type Platform = "android" | "ios" | "other";

type L10n = Record<Locale, string>;

export interface StepLink {
  label: string;
  url: string;
}
export interface StepPhone {
  label: string;
  number: string;
}
export interface PlaybookStep {
  key: string;
  urgency: "now" | "today" | "later";
  /** Who actually performs the action: TRACE can only guide and hand off. */
  capability: Capability;
  title: string;
  body: string;
  links: StepLink[];
  phones: StepPhone[];
}

/** Official entry points. Every URL here is a first-party government, regulator, operator or vendor page. */
export const OFFICIAL = {
  googleFind: "https://www.google.com/android/find",
  googleDevices: "https://myaccount.google.com/device-activity",
  appleFind: "https://www.icloud.com/find",
  appleAccount: "https://account.apple.com",
  samsungFind: "https://samsungfind.samsung.com",
  IN: {
    sancharSaathi: "https://sancharsaathi.gov.in",
    ceirBlock: "https://ceir.sancharsaathi.gov.in/Request/CeirUserBlockRequestDirect.jsp",
    ceirStatus: "https://ceir.sancharsaathi.gov.in/Request/CeirRequestStatus.jsp",
    cybercrime: "https://www.cybercrime.gov.in",
  },
  NP: {
    mdms: "https://mdms.nta.gov.np/public?lang=en",
    nta: "https://www.nta.gov.np",
    cyberBureau: "https://cyberbureau.nepalpolice.gov.np",
  },
  AE: {
    tdra: "https://tdra.gov.ae",
    dubaiPolice: "https://www.dubaipolice.gov.ae",
    adPolice: "https://www.adpolice.gov.ae",
  },
} as const;

const OPERATORS: Record<Country, StepPhone[]> = {
  IN: [
    { label: "Jio", number: "199" },
    { label: "Airtel", number: "121" },
    { label: "Vi", number: "199" },
    { label: "BSNL", number: "1503" },
  ],
  NP: [
    { label: "Nepal Telecom", number: "1498" },
    { label: "Ncell", number: "9005" },
  ],
  AE: [
    { label: "e& (Etisalat)", number: "101" },
    { label: "du", number: "155" },
  ],
};

const POLICE: Record<Country, StepPhone[]> = {
  IN: [
    { label: "Emergency", number: "112" },
    { label: "Cyber-fraud helpline", number: "1930" },
  ],
  NP: [{ label: "Nepal Police", number: "100" }],
  AE: [
    { label: "Emergency", number: "999" },
    { label: "Non-emergency", number: "901" },
  ],
};

interface StepText {
  title: L10n;
  body: L10n | Partial<Record<Country | Platform | "default", L10n>>;
}

function isL10n(v: unknown): v is L10n {
  return !!v && typeof (v as L10n).en === "string";
}

const TEXT: Record<string, StepText> = {
  locate: {
    title: {
      en: "Try to find or ring your phone",
      hi: "अपना फ़ोन खोजने या बजाने की कोशिश करें",
      ne: "आफ्नो फोन खोज्ने वा बजाउने प्रयास गर्नुहोस्",
    },
    body: {
      android: {
        en: "Open Google Find Hub in any browser and sign in with the Google account that was on the phone. You can play a sound or see the last known location. This only works if the phone is switched on, still signed in and Find Hub was enabled. If the map shows an address, do not go there yourself — give it to the police.",
        hi: "किसी भी ब्राउज़र में Google Find Hub खोलें और उसी Google खाते से साइन इन करें जो फ़ोन में था। आप फ़ोन की घंटी बजा सकते हैं या आख़िरी लोकेशन देख सकते हैं। यह तभी काम करता है जब फ़ोन चालू हो, खाते में साइन इन हो और Find Hub पहले से चालू रहा हो। अगर नक्शे पर कोई पता दिखे तो खुद वहाँ न जाएँ — वह जानकारी पुलिस को दें।",
        ne: "कुनै पनि ब्राउजरमा Google Find Hub खोल्नुहोस् र फोनमा भएकै Google खाताबाट साइन इन गर्नुहोस्। तपाईं फोनमा घण्टी बजाउन वा अन्तिम लोकेसन हेर्न सक्नुहुन्छ। फोन खुला, खातामा साइन इन भएको र Find Hub पहिल्यै सक्रिय भएको अवस्थामा मात्र यो काम गर्छ। नक्सामा ठेगाना देखिएमा आफैँ त्यहाँ नजानुहोस् — त्यो जानकारी प्रहरीलाई दिनुहोस्।",
      },
      ios: {
        en: "Open iCloud Find Devices in any browser and sign in with your Apple Account. You can play a sound or see the last known location. This only works if Find My was turned on before the phone was lost. If the map shows an address, do not go there yourself — give it to the police.",
        hi: "किसी भी ब्राउज़र में iCloud Find Devices खोलें और अपने Apple खाते से साइन इन करें। आप फ़ोन की घंटी बजा सकते हैं या आख़िरी लोकेशन देख सकते हैं। यह तभी काम करता है जब फ़ोन खोने से पहले Find My चालू था। अगर नक्शे पर कोई पता दिखे तो खुद वहाँ न जाएँ — वह जानकारी पुलिस को दें।",
        ne: "कुनै पनि ब्राउजरमा iCloud Find Devices खोल्नुहोस् र आफ्नो Apple खाताबाट साइन इन गर्नुहोस्। तपाईं फोनमा घण्टी बजाउन वा अन्तिम लोकेसन हेर्न सक्नुहुन्छ। फोन हराउनुअघि Find My सक्रिय भएको भए मात्र यो काम गर्छ। नक्सामा ठेगाना देखिएमा आफैँ त्यहाँ नजानुहोस् — त्यो जानकारी प्रहरीलाई दिनुहोस्।",
      },
      default: {
        en: "Basic (keypad) phones have no remote-locate feature. Call the number from another phone — an honest finder may answer. Then move straight to blocking the SIM.",
        hi: "साधारण (कीपैड) फ़ोन में दूर से खोजने की सुविधा नहीं होती। किसी दूसरे फ़ोन से अपने नंबर पर कॉल करें — हो सकता है किसी ईमानदार व्यक्ति को मिला हो। इसके बाद तुरंत सिम ब्लॉक कराएँ।",
        ne: "साधारण (किप्याड) फोनमा टाढाबाट खोज्ने सुविधा हुँदैन। अर्को फोनबाट आफ्नो नम्बरमा कल गर्नुहोस् — इमानदार व्यक्तिले भेट्टाएको हुन सक्छ। त्यसपछि तुरुन्तै सिम ब्लक गराउनुहोस्।",
      },
    },
  },
  lock: {
    title: {
      en: "Lock it and show a call-back message",
      hi: "फ़ोन लॉक करें और संपर्क संदेश दिखाएँ",
      ne: "फोन लक गर्नुहोस् र सम्पर्क सन्देश देखाउनुहोस्",
    },
    body: {
      android: {
        en: "In Find Hub choose “Secure device” to lock the screen and show a number where you can be reached. Erase the phone only as a last resort — once an Android phone is erased you can no longer locate it.",
        hi: "Find Hub में “Secure device” चुनें ताकि स्क्रीन लॉक हो जाए और आपका संपर्क नंबर दिखे। फ़ोन का डेटा मिटाना (Erase) आख़िरी विकल्प रखें — Android फ़ोन मिटाने के बाद उसकी लोकेशन नहीं देखी जा सकती।",
        ne: "Find Hub मा “Secure device” रोज्नुहोस् ताकि स्क्रिन लक होस् र तपाईंको सम्पर्क नम्बर देखियोस्। फोनको डेटा मेटाउने (Erase) काम अन्तिम विकल्पका रूपमा मात्र गर्नुहोस् — Android फोन मेटाएपछि त्यसको लोकेसन हेर्न सकिँदैन।",
      },
      ios: {
        en: "In Find Devices choose “Mark As Lost”. This locks the iPhone, suspends Apple Pay and shows your message. Do not remove the device from your Apple Account — that would switch off Activation Lock and make the phone easy to resell.",
        hi: "Find Devices में “Mark As Lost” चुनें। इससे iPhone लॉक हो जाता है, Apple Pay रुक जाता है और आपका संदेश दिखता है। डिवाइस को अपने Apple खाते से न हटाएँ — ऐसा करने से Activation Lock बंद हो जाएगा और फ़ोन बेचना आसान हो जाएगा।",
        ne: "Find Devices मा “Mark As Lost” रोज्नुहोस्। यसले iPhone लक गर्छ, Apple Pay रोक्छ र तपाईंको सन्देश देखाउँछ। डिभाइसलाई आफ्नो Apple खाताबाट नहटाउनुहोस् — त्यसो गर्दा Activation Lock बन्द हुन्छ र फोन बेच्न सजिलो हुन्छ।",
      },
      default: {
        en: "A keypad phone cannot be locked remotely. Blocking the SIM (next step) and the IMEI is your protection.",
        hi: "कीपैड फ़ोन को दूर से लॉक नहीं किया जा सकता। सिम (अगला चरण) और IMEI ब्लॉक कराना ही आपकी सुरक्षा है।",
        ne: "किप्याड फोन टाढाबाट लक गर्न सकिँदैन। सिम (अर्को चरण) र IMEI ब्लक गराउनु नै तपाईंको सुरक्षा हो।",
      },
    },
  },
  sim_block: {
    title: {
      en: "Block your SIM card",
      hi: "अपना सिम कार्ड ब्लॉक कराएँ",
      ne: "आफ्नो सिम कार्ड ब्लक गराउनुहोस्",
    },
    body: {
      en: "Call your mobile operator from another phone and ask them to suspend the SIM. Then collect a replacement SIM with the same number from an operator store (carry your ID). This stops someone receiving your OTPs and misusing your banking or wallet apps.",
      hi: "किसी दूसरे फ़ोन से अपने मोबाइल ऑपरेटर को कॉल करें और सिम बंद करने को कहें। फिर ऑपरेटर के स्टोर से उसी नंबर का नया सिम लें (पहचान पत्र साथ रखें)। इससे कोई आपके OTP नहीं ले पाएगा और बैंकिंग या वॉलेट ऐप का दुरुपयोग नहीं होगा।",
      ne: "अर्को फोनबाट आफ्नो मोबाइल सेवा प्रदायकलाई कल गरी सिम बन्द गर्न भन्नुहोस्। त्यसपछि सेवा प्रदायकको केन्द्रबाट सोही नम्बरको नयाँ सिम लिनुहोस् (परिचयपत्र साथमा लैजानुहोस्)। यसले अरूलाई तपाईंको OTP लिन र बैंकिङ वा वालेट एप दुरुपयोग गर्नबाट रोक्छ।",
    },
  },
  accounts: {
    title: {
      en: "Protect your money and accounts",
      hi: "अपने पैसे और खातों को सुरक्षित करें",
      ne: "आफ्नो पैसा र खाताहरू सुरक्षित गर्नुहोस्",
    },
    body: {
      IN: {
        en: "Change the password of your Google or Apple account and sign the lost phone out. Tell your bank and ask them to block UPI and mobile banking on the old device. If money has already been taken, call 1930 immediately or report at cybercrime.gov.in.",
        hi: "अपने Google या Apple खाते का पासवर्ड बदलें और खोए हुए फ़ोन को साइन आउट करें। अपने बैंक को बताएँ और पुराने फ़ोन पर UPI व मोबाइल बैंकिंग बंद कराएँ। अगर पैसे निकल चुके हैं तो तुरंत 1930 पर कॉल करें या cybercrime.gov.in पर शिकायत करें।",
        ne: "आफ्नो Google वा Apple खाताको पासवर्ड बदल्नुहोस् र हराएको फोनलाई साइन आउट गर्नुहोस्। आफ्नो बैंकलाई जानकारी दिनुहोस् र पुरानो फोनमा UPI तथा मोबाइल बैंकिङ बन्द गराउनुहोस्। पैसा गइसकेको छ भने तुरुन्तै 1930 मा कल गर्नुहोस् वा cybercrime.gov.in मा उजुरी दिनुहोस्।",
      },
      default: {
        en: "Change the password of your Google or Apple account and sign the lost phone out. Tell your bank and ask them to block mobile banking and wallet apps (eSewa, Khalti, bank apps, Apple Pay and similar) on the old device.",
        hi: "अपने Google या Apple खाते का पासवर्ड बदलें और खोए हुए फ़ोन को साइन आउट करें। अपने बैंक को बताएँ और पुराने फ़ोन पर मोबाइल बैंकिंग व वॉलेट ऐप बंद कराएँ।",
        ne: "आफ्नो Google वा Apple खाताको पासवर्ड बदल्नुहोस् र हराएको फोनलाई साइन आउट गर्नुहोस्। आफ्नो बैंकलाई जानकारी दिनुहोस् र पुरानो फोनमा मोबाइल बैंकिङ तथा वालेट एप (eSewa, Khalti, बैंक एप आदि) बन्द गराउनुहोस्।",
      },
    },
  },
  find_imei: {
    title: {
      en: "Find your IMEI number",
      hi: "अपना IMEI नंबर खोजें",
      ne: "आफ्नो IMEI नम्बर पत्ता लगाउनुहोस्",
    },
    body: {
      en: "The IMEI is the 15-digit identity of your handset. Police and blocking requests need it. Look on the phone's box, on the purchase invoice, in Google Find Hub (tap the ⓘ beside your device) or in your Apple Account device list. If you saved the phone in the TRACE vault earlier, you can recover the IMEI from the “Protect a phone” page. No one can lawfully look up an IMEI from a phone number for you except your operator or the police.",
      hi: "IMEI आपके हैंडसेट की 15 अंकों की पहचान है। पुलिस रिपोर्ट और ब्लॉक कराने के लिए यह ज़रूरी है। इसे फ़ोन के डिब्बे पर, ख़रीद के बिल पर, Google Find Hub में (अपने डिवाइस के पास ⓘ दबाएँ) या अपने Apple खाते की डिवाइस सूची में देखें। अगर आपने पहले फ़ोन को TRACE वॉल्ट में सहेजा था तो “फ़ोन सुरक्षित करें” पेज से IMEI वापस पा सकते हैं। फ़ोन नंबर से IMEI केवल आपका ऑपरेटर या पुलिस ही क़ानूनी रूप से निकाल सकते हैं।",
      ne: "IMEI तपाईंको ह्यान्डसेटको १५ अङ्कको पहिचान हो। प्रहरी उजुरी र ब्लक गराउन यो चाहिन्छ। यसलाई फोनको बाकसमा, खरिद बिलमा, Google Find Hub मा (आफ्नो डिभाइस छेउको ⓘ थिच्नुहोस्) वा आफ्नो Apple खाताको डिभाइस सूचीमा हेर्नुहोस्। पहिले फोनलाई TRACE भल्टमा सुरक्षित गर्नुभएको छ भने “फोन सुरक्षित गर्नुहोस्” पृष्ठबाट IMEI फिर्ता पाउन सक्नुहुन्छ। फोन नम्बरबाट IMEI कानुनी रूपमा तपाईंको सेवा प्रदायक वा प्रहरीले मात्र निकाल्न सक्छन्।",
    },
  },
  police: {
    title: {
      en: "Report it to the police",
      hi: "पुलिस में रिपोर्ट दर्ज कराएँ",
      ne: "प्रहरीमा उजुरी दिनुहोस्",
    },
    body: {
      IN: {
        en: "File a lost-article report or FIR on your State Police citizen portal, or at the nearest police station. Keep the complaint copy — Sanchar Saathi needs it before it will block the IMEI. TRACE can prepare the complaint text for you below.",
        hi: "अपने राज्य पुलिस के नागरिक पोर्टल पर या नज़दीकी थाने में गुमशुदगी रिपोर्ट या FIR दर्ज कराएँ। शिकायत की प्रति सँभालकर रखें — IMEI ब्लॉक करने के लिए संचार साथी को इसकी ज़रूरत होती है। नीचे TRACE आपके लिए शिकायत का मसौदा तैयार कर सकता है।",
        ne: "आफ्नो राज्य प्रहरीको नागरिक पोर्टलमा वा नजिकको प्रहरी चौकीमा हराएको सामानको रिपोर्ट वा FIR दर्ता गराउनुहोस्। उजुरीको प्रति सुरक्षित राख्नुहोस् — IMEI ब्लक गर्न संचार साथीलाई यो चाहिन्छ। तल TRACE ले तपाईंका लागि उजुरीको मस्यौदा तयार गर्न सक्छ।",
      },
      NP: {
        en: "Report at the nearest police office with the IMEI, the purchase bill and your citizenship certificate. For theft linked to online fraud, contact the Nepal Police Cyber Bureau. Police may need a court order before operators trace a handset, so file early. TRACE can prepare the complaint text for you below.",
        hi: "IMEI, ख़रीद का बिल और नागरिकता प्रमाणपत्र लेकर नज़दीकी पुलिस कार्यालय में रिपोर्ट करें। ऑनलाइन धोखाधड़ी से जुड़ी चोरी के लिए नेपाल पुलिस साइबर ब्यूरो से संपर्क करें। हैंडसेट ट्रेस कराने से पहले पुलिस को अदालत की अनुमति लेनी पड़ सकती है, इसलिए जल्दी रिपोर्ट करें। नीचे TRACE आपके लिए शिकायत का मसौदा तैयार कर सकता है।",
        ne: "IMEI, खरिद बिल र नागरिकता प्रमाणपत्र लिएर नजिकको प्रहरी कार्यालयमा उजुरी दिनुहोस्। अनलाइन ठगीसँग जोडिएको चोरीका लागि नेपाल प्रहरी साइबर ब्युरोमा सम्पर्क गर्नुहोस्। ह्यान्डसेट ट्रेस गराउनुअघि प्रहरीले अदालतको अनुमति लिनुपर्ने हुन सक्छ, त्यसैले चाँडै उजुरी दिनुहोस्। तल TRACE ले तपाईंका लागि उजुरीको मस्यौदा तयार गर्न सक्छ।",
      },
      AE: {
        en: "Report the loss through your emirate's police app, website or station (Dubai Police offers a “Lost Certificate” service). Call 901 for non-emergencies. A police report is also needed for insurance and for your employer.",
        hi: "अपने अमीरात की पुलिस के ऐप, वेबसाइट या थाने के माध्यम से रिपोर्ट करें (दुबई पुलिस “Lost Certificate” सेवा देती है)। गैर-आपातकालीन मामलों के लिए 901 पर कॉल करें। बीमा और नियोक्ता के लिए भी पुलिस रिपोर्ट ज़रूरी होती है।",
        ne: "आफ्नो इमिरेटको प्रहरी एप, वेबसाइट वा चौकीमार्फत उजुरी दिनुहोस् (दुबई प्रहरीले “Lost Certificate” सेवा दिन्छ)। गैर-आपत्‌कालीन अवस्थाका लागि 901 मा कल गर्नुहोस्। बिमा र रोजगारदाताका लागि पनि प्रहरी रिपोर्ट चाहिन्छ।",
      },
    },
  },
  block_imei: {
    title: {
      en: "Ask for the handset (IMEI) to be blocked",
      hi: "हैंडसेट (IMEI) ब्लॉक कराने का अनुरोध करें",
      ne: "ह्यान्डसेट (IMEI) ब्लक गराउन अनुरोध गर्नुहोस्",
    },
    body: {
      IN: {
        en: "Submit the “Block Stolen/Lost Mobile” form on Sanchar Saathi (CEIR). Keep ready: the police complaint copy, an ID proof and, if you have it, the purchase invoice. You will receive a Request ID. The block applies on every Indian network, usually within 24 hours, and lets police see if the handset is used again. Only you can submit this form — TRACE prepares your details and takes you to the official page.",
        hi: "संचार साथी (CEIR) पर “Block Stolen/Lost Mobile” फ़ॉर्म भरें। साथ रखें: पुलिस शिकायत की प्रति, पहचान पत्र और अगर हो तो ख़रीद का बिल। आपको एक Request ID मिलेगी। ब्लॉक भारत के सभी नेटवर्क पर लागू होता है, आम तौर पर 24 घंटे में, और हैंडसेट दोबारा इस्तेमाल होने पर पुलिस को पता चल सकता है। यह फ़ॉर्म केवल आप भर सकते हैं — TRACE आपकी जानकारी तैयार करके आपको आधिकारिक पेज पर ले जाता है।",
        ne: "संचार साथी (CEIR) मा “Block Stolen/Lost Mobile” फारम भर्नुहोस्। साथमा राख्नुहोस्: प्रहरी उजुरीको प्रति, परिचयपत्र र भएमा खरिद बिल। तपाईंले Request ID पाउनुहुनेछ। ब्लक भारतका सबै नेटवर्कमा लागू हुन्छ, सामान्यतया २४ घण्टाभित्र, र ह्यान्डसेट फेरि प्रयोग भएमा प्रहरीले थाहा पाउन सक्छ। यो फारम तपाईंले मात्र भर्न सक्नुहुन्छ — TRACE ले तपाईंको विवरण तयार गरी आधिकारिक पृष्ठमा लैजान्छ।",
      },
      NP: {
        en: "Register the phone as lost or stolen on the NTA MDMS portal (block your SIM first, as the portal asks). The availability of this service has been inconsistent — if the portal does not accept your request, ask the police or your operator to forward it to NTA.",
        hi: "NTA के MDMS पोर्टल पर फ़ोन को खोया या चोरी हुआ दर्ज करें (पोर्टल के अनुसार पहले सिम ब्लॉक कराएँ)। यह सेवा हमेशा उपलब्ध नहीं रही है — अगर पोर्टल आपका अनुरोध न ले तो पुलिस या अपने ऑपरेटर से इसे NTA को भेजने को कहें।",
        ne: "NTA को MDMS पोर्टलमा फोन हराएको वा चोरी भएको भनी दर्ता गर्नुहोस् (पोर्टलले भनेअनुसार पहिले सिम ब्लक गराउनुहोस्)। यो सेवा सधैँ उपलब्ध भएको छैन — पोर्टलले तपाईंको अनुरोध नलिएमा प्रहरी वा आफ्नो सेवा प्रदायकलाई NTA मा पठाइदिन भन्नुहोस्।",
      },
      AE: {
        en: "Ask e& (101) or du (155) to blacklist the handset's IMEI. TDRA says a reported device is blocked on UAE networks within about 24 hours. The block does not automatically apply outside the UAE.",
        hi: "e& (101) या du (155) से हैंडसेट का IMEI ब्लैकलिस्ट करने को कहें। TDRA के अनुसार रिपोर्ट किया गया डिवाइस लगभग 24 घंटे में UAE के नेटवर्क पर ब्लॉक हो जाता है। यह ब्लॉक UAE के बाहर अपने-आप लागू नहीं होता।",
        ne: "e& (101) वा du (155) लाई ह्यान्डसेटको IMEI ब्ल्याकलिस्ट गर्न भन्नुहोस्। TDRA का अनुसार रिपोर्ट गरिएको डिभाइस करिब २४ घण्टाभित्र UAE का नेटवर्कमा ब्लक हुन्छ। यो ब्लक UAE बाहिर स्वतः लागू हुँदैन।",
      },
    },
  },
  track_status: {
    title: {
      en: "Check the status of your request",
      hi: "अपने अनुरोध की स्थिति देखें",
      ne: "आफ्नो अनुरोधको स्थिति हेर्नुहोस्",
    },
    body: {
      en: "Use your request number on the same official portal to see whether the block is active. Add the number to this TRACE case so that an authorised officer can see it too. Any trace of the handset goes to the police, not to you — that is the law, and it protects everyone from stalking.",
      hi: "उसी आधिकारिक पोर्टल पर अपने अनुरोध नंबर से देखें कि ब्लॉक लागू हुआ या नहीं। यह नंबर इस TRACE केस में जोड़ें ताकि अधिकृत अधिकारी भी इसे देख सकें। हैंडसेट का कोई भी सुराग पुलिस को मिलता है, आपको नहीं — यही क़ानून है और यह सबको पीछा किए जाने से बचाता है।",
      ne: "सोही आधिकारिक पोर्टलमा आफ्नो अनुरोध नम्बर राखी ब्लक लागू भयो कि भएन हेर्नुहोस्। यो नम्बर यस TRACE केसमा थप्नुहोस् ताकि अधिकृत अधिकारीले पनि हेर्न सकून्। ह्यान्डसेटको कुनै पनि सुराक प्रहरीलाई जान्छ, तपाईंलाई होइन — कानुन यही हो र यसले सबैलाई पिछा गरिनबाट जोगाउँछ।",
    },
  },
  insurance: {
    title: {
      en: "Tell your insurer or employer",
      hi: "बीमा कंपनी या नियोक्ता को बताएँ",
      ne: "बिमा कम्पनी वा रोजगारदातालाई जानकारी दिनुहोस्",
    },
    body: {
      en: "If the phone is insured or belongs to your employer, tell them now — most policies have a short deadline and ask for the police report and the IMEI block reference.",
      hi: "अगर फ़ोन का बीमा है या वह आपके नियोक्ता का है तो अभी सूचित करें — ज़्यादातर पॉलिसियों में समय-सीमा कम होती है और पुलिस रिपोर्ट तथा IMEI ब्लॉक का संदर्भ माँगा जाता है।",
      ne: "फोनको बिमा छ वा त्यो रोजगारदाताको हो भने अहिले नै जानकारी दिनुहोस् — धेरैजसो पोलिसीमा समयसीमा छोटो हुन्छ र प्रहरी रिपोर्ट तथा IMEI ब्लकको सन्दर्भ मागिन्छ।",
    },
  },
  after_recovery: {
    title: {
      en: "When you get the phone back",
      hi: "जब फ़ोन वापस मिल जाए",
      ne: "फोन फिर्ता पाएपछि",
    },
    body: {
      en: "Ask for the IMEI to be unblocked on the same official channel you used to block it, then mark this case as recovered. TRACE deletes your case data on a fixed schedule after closure.",
      hi: "जिस आधिकारिक माध्यम से IMEI ब्लॉक कराया था उसी से अनब्लॉक कराएँ, फिर इस केस को “वापस मिल गया” चिह्नित करें। केस बंद होने के बाद TRACE तय समय पर आपका डेटा हटा देता है।",
      ne: "जुन आधिकारिक माध्यमबाट IMEI ब्लक गराउनुभएको थियो त्यहीँबाट अनब्लक गराउनुहोस्, अनि यो केसलाई “फिर्ता पाइयो” भनी चिह्न लगाउनुहोस्। केस बन्द भएपछि TRACE ले तोकिएको समयमा तपाईंको डेटा मेटाउँछ।",
    },
  },
};

function pickBody(key: string, country: Country, platform: Platform, locale: Locale): string {
  const body = TEXT[key].body;
  if (isL10n(body)) return body[locale];
  const variants = body as Partial<Record<string, L10n>>;
  const v = variants[country] ?? variants[platform] ?? variants.default;
  return v ? v[locale] : "";
}

export const STEP_KEYS = Object.keys(TEXT);

/** The ordered recovery plan for a case. Pure data: no network calls, no tracking. */
export function buildPlaybook(country: Country, platform: Platform, locale: Locale = "en"): PlaybookStep[] {
  const findLinks: StepLink[] =
    platform === "ios"
      ? [{ label: "iCloud Find Devices", url: OFFICIAL.appleFind }]
      : platform === "android"
        ? [
            { label: "Google Find Hub", url: OFFICIAL.googleFind },
            { label: "Samsung Find", url: OFFICIAL.samsungFind },
          ]
        : [];

  const accountLinks: StepLink[] = [
    { label: "Google account devices", url: OFFICIAL.googleDevices },
    { label: "Apple Account", url: OFFICIAL.appleAccount },
  ];
  if (country === "IN") accountLinks.push({ label: "cybercrime.gov.in", url: OFFICIAL.IN.cybercrime });

  const policeLinks: StepLink[] =
    country === "IN"
      ? [{ label: "National Cyber Crime Portal", url: OFFICIAL.IN.cybercrime }]
      : country === "NP"
        ? [{ label: "Nepal Police Cyber Bureau", url: OFFICIAL.NP.cyberBureau }]
        : [
            { label: "Dubai Police", url: OFFICIAL.AE.dubaiPolice },
            { label: "Abu Dhabi Police", url: OFFICIAL.AE.adPolice },
          ];

  const blockLinks: StepLink[] =
    country === "IN"
      ? [
          { label: "Sanchar Saathi — block form (CEIR)", url: OFFICIAL.IN.ceirBlock },
          { label: "Sanchar Saathi", url: OFFICIAL.IN.sancharSaathi },
        ]
      : country === "NP"
        ? [{ label: "NTA MDMS portal", url: OFFICIAL.NP.mdms }]
        : [{ label: "TDRA", url: OFFICIAL.AE.tdra }];

  const statusLinks: StepLink[] =
    country === "IN"
      ? [{ label: "CEIR request status", url: OFFICIAL.IN.ceirStatus }]
      : country === "NP"
        ? [{ label: "NTA MDMS portal", url: OFFICIAL.NP.mdms }]
        : [];

  const defs: Omit<PlaybookStep, "title" | "body">[] = [
    { key: "locate", urgency: "now", capability: "REQUIRES_USER_PERMISSION", links: findLinks, phones: [] },
    { key: "lock", urgency: "now", capability: "REQUIRES_USER_PERMISSION", links: findLinks.slice(0, 1), phones: [] },
    { key: "sim_block", urgency: "now", capability: "AVAILABLE_NOW", links: [], phones: OPERATORS[country] },
    { key: "accounts", urgency: "now", capability: "AVAILABLE_NOW", links: accountLinks, phones: country === "IN" ? [POLICE.IN[1]] : [] },
    { key: "find_imei", urgency: "today", capability: "AVAILABLE_NOW", links: [{ label: "Google Find Hub", url: OFFICIAL.googleFind }, { label: "Apple Account", url: OFFICIAL.appleAccount }], phones: [] },
    { key: "police", urgency: "today", capability: "AVAILABLE_NOW", links: policeLinks, phones: POLICE[country] },
    { key: "block_imei", urgency: "today", capability: "AVAILABLE_NOW", links: blockLinks, phones: country === "AE" ? OPERATORS.AE : [] },
    { key: "track_status", urgency: "later", capability: "AVAILABLE_NOW", links: statusLinks, phones: [] },
    { key: "insurance", urgency: "later", capability: "AVAILABLE_NOW", links: [], phones: [] },
    { key: "after_recovery", urgency: "later", capability: "AVAILABLE_NOW", links: blockLinks.slice(0, 1), phones: [] },
  ];

  return defs.map((d) => ({
    ...d,
    title: TEXT[d.key].title[locale],
    body: pickBody(d.key, country, platform, locale),
  }));
}
