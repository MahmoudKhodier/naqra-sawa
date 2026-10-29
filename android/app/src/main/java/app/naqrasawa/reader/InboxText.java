package app.naqrasawa.reader;

import java.text.NumberFormat;
import java.util.Locale;

/**
 * Notification texts in the app's three languages: "eg" (مصري, the default), "ar" (فصحى) and "en".
 * Same wording as the app's «الجديد ليك» list (v-inbox.js), so a notification reads like the app.
 */
final class InboxText {
    private InboxText() {}

    static String lang(String l) {
        return "en".equals(l) || "ar".equals(l) ? l : "eg";
    }

    private static String pick(String lang, String eg, String en, String ar) {
        lang = lang(lang);
        return "en".equals(lang) ? en : "ar".equals(lang) ? ar : eg;
    }

    /** Arabic-Indic digits for the Arabic texts, like the app (L.num). */
    static String num(long n, String lang) {
        if ("en".equals(lang(lang))) return String.valueOf(n);
        return NumberFormat.getIntegerInstance(Locale.forLanguageTag("ar-EG-u-nu-arab")).format(n);
    }

    static String who(String from, String lang) {
        if (from != null && !from.trim().isEmpty()) return from.trim();
        return pick(lang, "قارئ", "A reader", "قارئ");
    }

    static String quote(String s, String lang) {
        return "en".equals(lang(lang)) ? "“" + s + "”" : "«" + s + "»";
    }

    /** The notification's title for one event (kind = cheer | poke | reply | msgreply). */
    static String line(String kind, String from, String book, int wird, String lang) {
        String w = who(from, lang);
        boolean hasBook = book != null && !book.trim().isEmpty();
        switch (kind) {
            case "cheer":
                return pick(lang, "تشجيع من " + w + " 👏", w + " cheered you on 👏", "تشجيع من " + w + " 👏");
            case "poke":
                if (wird > 0) {
                    String n = num(wird, lang);
                    return pick(lang, "تذكير من " + w + " بالورد " + n + " 👋", w + " nudged you about portion " + n + " 👋", "تذكير من " + w + " بالورد " + n + " 👋");
                }
                return pick(lang, "تذكير من " + w + " بالقراية 👋", w + " nudged you to read 👋", "تذكير من " + w + " بالقراءة 👋");
            case "reply":
                if (hasBook) {
                    String q = quote(book.trim(), lang);
                    return pick(lang, "رد من " + w + " على ملاحظتك في " + q, w + " replied to your note in " + q, "رد من " + w + " على ملاحظتك في " + q);
                }
                return pick(lang, "رد من " + w + " على ملاحظتك", w + " replied to your note", "رد من " + w + " على ملاحظتك");
            case "msgreply":
                return pick(lang, "رد من " + w + " على رسالتك", w + " replied to your message", "رد من " + w + " على رسالتك");
            default:
                return pick(lang, "جديد من " + w, "Something new from " + w, "جديد من " + w);
        }
    }

    static String summary(int n, String lang) {
        String c = num(n, lang);
        return pick(lang, "الجديد ليك (" + c + ")", n + " new for you", "الجديد لك (" + c + ")");
    }

    static String more(int n, String lang) {
        String c = num(n, lang);
        return pick(lang, "و" + c + " كمان", "and " + n + " more", "و" + c + " أخرى");
    }

    static String channelName(String lang) {
        return pick(lang, "التشجيع والردود", "Cheers and replies", "التشجيع والردود");
    }

    static String channelDescription(String lang) {
        return pick(lang, "لما حد في الحلقة يشجعك أو يفكّرك أو يرد عليك", "When someone in your circle cheers, nudges or replies to you", "عندما يشجعك أحد في الحلقة أو يذكّرك أو يرد عليك");
    }
}
