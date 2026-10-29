package app.naqrasawa.reader;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;

/**
 * One look at the inbox: asks the database (RPC device_inbox, with the anon key and this phone's token) for
 * cheers, nudges and replies newer than the last one shown, and shows them as notifications.
 * Runs from InboxWorker (about every 15 minutes, when online) and from Inbox.checkNow().
 */
final class InboxCheck {
    static final String PREFS = "naqra_inbox";
    static final String CHANNEL = "naqra_inbox";
    private static final int SUMMARY_ID = 7100;
    private static final int MAX_SINGLE = 3; // more than this at once: one summary notification

    private InboxCheck() {}

    static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static String isoNow() {
        SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        f.setTimeZone(TimeZone.getTimeZone("UTC"));
        return f.format(new Date());
    }

    static boolean canPost(Context ctx) {
        if (!NotificationManagerCompat.from(ctx).areNotificationsEnabled()) return false;
        return Build.VERSION.SDK_INT < 33
                || ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
    }

    static void ensureChannel(Context ctx, String lang) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL, InboxText.channelName(lang), NotificationManager.IMPORTANCE_DEFAULT);
        ch.setDescription(InboxText.channelDescription(lang));
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        if (nm != null) nm.createNotificationChannel(ch); // also renames it when the language changed
    }

    /** {ok, posted, events, limited?, error?}. Never throws. */
    static synchronized JSONObject run(Context ctx) {
        JSONObject out = new JSONObject();
        SharedPreferences p = prefs(ctx);
        try {
            String url = p.getString("url", "");
            String key = p.getString("key", "");
            String token = p.getString("token", "");
            String lang = InboxText.lang(p.getString("lang", "eg"));
            if (!p.getBoolean("on", false) || url.isEmpty() || key.isEmpty() || token.isEmpty()) {
                out.put("ok", false);
                out.put("error", "off");
                return out;
            }
            JSONObject body = new JSONObject();
            body.put("p_token", token);
            body.put("p_since", p.getString("since", isoNow()));
            JSONObject res = post(url.replaceAll("/+$", "") + "/rest/v1/rpc/device_inbox", key, body.toString());
            p.edit().putString("lastCheck", isoNow()).remove("lastError").apply();
            if (res.optBoolean("limited", false)) {
                out.put("ok", true);
                out.put("limited", true);
                out.put("posted", 0);
                return out;
            }
            JSONArray events = res.optJSONArray("events");
            if (events == null) events = new JSONArray();
            JSONArray seen = new JSONArray(p.getString("seen", "[]"));
            List<String> seenIds = new ArrayList<>();
            for (int i = 0; i < seen.length(); i++) seenIds.add(seen.optString(i));
            List<JSONObject> fresh = new ArrayList<>();
            String since = p.getString("since", null);
            for (int i = 0; i < events.length(); i++) {
                JSONObject e = events.optJSONObject(i);
                if (e == null) continue;
                String id = e.optString("id", "");
                String at = e.optString("at", "");
                if (!at.isEmpty()) since = at; // events come oldest first
                if (id.isEmpty() || seenIds.contains(id)) continue;
                seenIds.add(id);
                fresh.add(e);
            }
            while (seenIds.size() > 80) seenIds.remove(0);
            SharedPreferences.Editor ed = p.edit().putString("seen", new JSONArray(seenIds).toString());
            if (since != null) ed.putString("since", since);
            ed.apply();
            int posted = fresh.isEmpty() ? 0 : show(ctx, fresh, lang);
            out.put("ok", true);
            out.put("events", fresh.size());
            out.put("posted", posted);
        } catch (Exception e) {
            p.edit().putString("lastError", String.valueOf(e.getMessage())).apply();
            try {
                out.put("ok", false);
                out.put("error", String.valueOf(e.getMessage()));
            } catch (Exception ignored) {}
        }
        return out;
    }

    private static JSONObject post(String url, String key, String json) throws Exception {
        if (!url.startsWith("https://") && !url.startsWith("http://localhost") && !url.startsWith("http://10.0.2.2")) throw new Exception("bad url");
        HttpURLConnection con = (HttpURLConnection) new URL(url).openConnection();
        try {
            con.setRequestMethod("POST");
            con.setConnectTimeout(15000);
            con.setReadTimeout(20000);
            con.setUseCaches(false);
            con.setDoOutput(true);
            con.setRequestProperty("Content-Type", "application/json");
            con.setRequestProperty("Accept", "application/json");
            con.setRequestProperty("apikey", key);
            // A legacy anon key is a JWT and also goes in Authorization; a publishable key (sb_publishable_…) is
            // not a JWT and needs only the apikey header (the anon role).
            if (!key.startsWith("sb_")) con.setRequestProperty("Authorization", "Bearer " + key);
            byte[] b = json.getBytes(StandardCharsets.UTF_8);
            try (OutputStream os = con.getOutputStream()) {
                os.write(b);
            }
            int code = con.getResponseCode();
            InputStream in = code >= 400 ? con.getErrorStream() : con.getInputStream();
            String text = read(in);
            if (code >= 400) throw new Exception("HTTP " + code + ": " + text);
            Object v = text.trim().isEmpty() ? new JSONObject() : new org.json.JSONTokener(text).nextValue();
            return v instanceof JSONObject ? (JSONObject) v : new JSONObject();
        } finally {
            con.disconnect();
        }
    }

    private static String read(InputStream in) throws Exception {
        if (in == null) return "";
        try (InputStream s = in; ByteArrayOutputStream bo = new ByteArrayOutputStream()) {
            byte[] buf = new byte[8192];
            int n;
            while ((n = s.read(buf)) > 0) {
                bo.write(buf, 0, n);
                if (bo.size() > 512 * 1024) throw new Exception("answer too large");
            }
            return bo.toString("UTF-8");
        }
    }

    private static String title(JSONObject e, String lang) {
        return InboxText.line(e.optString("kind"), e.optString("from", ""), e.optString("book", ""), e.optInt("wird", 0), lang);
    }

    private static String text(JSONObject e, String lang) {
        String kind = e.optString("kind");
        String t = e.optString("text", "").trim();
        if (("reply".equals(kind) || "msgreply".equals(kind)) && !t.isEmpty()) return t;
        String book = e.optString("book", "").trim();
        if (!book.isEmpty() && !"reply".equals(kind)) return InboxText.quote(book, lang);
        return "";
    }

    private static int show(Context ctx, List<JSONObject> list, String lang) {
        if (!canPost(ctx)) return 0;
        ensureChannel(ctx, lang);
        NotificationManagerCompat nm = NotificationManagerCompat.from(ctx);
        int color = ContextCompat.getColor(ctx, R.color.naqra_lapis);
        try {
            if (list.size() <= MAX_SINGLE) {
                for (JSONObject e : list) {
                    String id = e.optString("id");
                    int nid = 7200 + (id.hashCode() & 0x3fffffff) % 100000;
                    String body = text(e, lang);
                    NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CHANNEL)
                            .setSmallIcon(R.drawable.ic_stat_naqra)
                            .setColor(color)
                            .setContentTitle(title(e, lang))
                            .setAutoCancel(true)
                            .setCategory(NotificationCompat.CATEGORY_SOCIAL)
                            .setContentIntent(Launch.pending(ctx, nid, "inbox", null, 0));
                    String circle = e.optString("circle", "");
                    if (!circle.isEmpty()) b.setSubText(circle);
                    if (!body.isEmpty()) b.setContentText(body).setStyle(new NotificationCompat.BigTextStyle().bigText(body));
                    nm.notify(nid, b.build());
                }
                return list.size();
            }
            NotificationCompat.InboxStyle style = new NotificationCompat.InboxStyle();
            int shown = 0;
            for (int i = list.size() - 1; i >= 0 && shown < 5; i--, shown++) style.addLine(title(list.get(i), lang));
            if (list.size() > shown) style.setSummaryText(InboxText.more(list.size() - shown, lang));
            String sum = InboxText.summary(list.size(), lang);
            NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CHANNEL)
                    .setSmallIcon(R.drawable.ic_stat_naqra)
                    .setColor(color)
                    .setContentTitle(sum)
                    .setContentText(title(list.get(list.size() - 1), lang))
                    .setNumber(list.size())
                    .setStyle(style)
                    .setAutoCancel(true)
                    .setCategory(NotificationCompat.CATEGORY_SOCIAL)
                    .setContentIntent(Launch.pending(ctx, SUMMARY_ID, "inbox", null, 0));
            nm.notify(SUMMARY_ID, b.build());
            return 1;
        } catch (SecurityException se) {
            return 0; // permission taken away between the check and the post
        }
    }
}
