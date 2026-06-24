/**
 * Single source of truth for all PTEC contact info, social links, and map URLs.
 * Import this wherever you need links — never hardcode them again.
 */

export const PTEC = {
  // ── Organisation ──────────────────────────────────────────────────────────
  name: {
    en: "Phnom Penh Teacher Education College",
    km: "វិទ្យាស្ថានគរុកោសល្យរាជធានីភ្នំពេញ",
    short: "PTEC",
  },

  // ── Contact ───────────────────────────────────────────────────────────────
  phone: "012 950 192",
  phoneTel: "tel:012950192",       // use in href="tel:..."
  email: "info@ptec.edu.kh",

  // ── Address ───────────────────────────────────────────────────────────────
  address: {
    en: "St. 271, Sangkat Teuk Laork 3, Khan Toul Kork, Phnom Penh, Cambodia",
    km: "ផ្លូវ ២៧១ សង្កាត់ទឹកល្អក់៣ ខណ្ឌទួលគោក រាជធានីភ្នំពេញ ព្រះរាជាណាចក្រកម្ពុជា",
    streetAddress: "St. 271, Sangkat Teuk Laork 3",
    city: "Phnom Penh",
    country: "KH",
    postalCode: "120406",
  },

  // ── Opening hours ─────────────────────────────────────────────────────────
  hours: {
    en: "Monday – Saturday: 7:00 AM – 5:00 PM (Sunday: Closed)",
    km: "ច័ន្ទ – សៅរ៍: ម៉ោង ៧:០០ ព្រឹក – ៥:០០ ល្ងាច (ថ្ងៃអាទិត្យ: បិទ)",
    openingHoursSpec: "Mon-Sat 07:00-17:00",
  },

  // ── Social & external links ───────────────────────────────────────────────
  links: {
    website:   "https://www.ptec.edu.kh",
    facebook:  "https://web.facebook.com/ptec.edu",
    messenger: "https://m.me/ptec.edu",
    youtube:   "https://www.youtube.com/@phnompenhteachereducationc3430",
    telegram:  "https://t.me/ptec_edu",

    // Google Maps — place link (opens directions)
    mapPlace:
      "https://www.google.com/maps/place/Phnom+Penh+Teacher+Education+College/@11.5574509,104.8872382,1090m/data=!3m1!1e3!4m6!3m5!1s0x310951a618265c67:0x159b1d2bb350bbae!8m2!3d11.5568858!4d104.8872782!16s%2Fg%2F1q665w1lh",

    // Google Maps — embed iframe src
    mapEmbed:
      "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3908.772583842131!2d104.88470327464049!3d11.568153444093952!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x310951a618265c67%3A0x159b1d2bb350bbae!2sPhnom%20Penh%20Teacher%20Education%20College!5e0!3m2!1sen!2skh!4v1717904033000!5m2!1sen!2skh",
  },

  // ── Schema.org sameAs list (all official profiles) ────────────────────────
  sameAs: [
    "https://www.ptec.edu.kh",
    "https://web.facebook.com/ptec.edu",
    "https://www.youtube.com/@phnompenhteachereducationc3430",
    "https://t.me/ptec_edu",
  ],
} as const;
