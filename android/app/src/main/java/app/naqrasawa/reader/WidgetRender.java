package app.naqrasawa.reader;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * Draws the «وردك النهارده» widgets from the JSON the app last sent (Widget.update), kept in SharedPreferences.
 * The texts arrive ready in the app's language (numbers included), so Java only places them.
 * {v, lang, rtl, day, book, bookId, page, line, short, pct, done, progress, streak, risk, goal, goalDone,
 *  goalNew, cta, empty}
 */
final class WidgetRender {
    static final String PREFS = "naqra_widget";

    private WidgetRender() {}

    static void save(Context ctx, String json) {
        SharedPreferences.Editor ed = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit();
        if (json == null) ed.remove("data");
        else ed.putString("data", json);
        ed.apply();
    }

    static JSONObject data(Context ctx) {
        String s = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("data", null);
        if (s == null) return null;
        try {
            return new JSONObject(s);
        } catch (Exception e) {
            return null;
        }
    }

    static void refreshAll(Context ctx) {
        AppWidgetManager m = AppWidgetManager.getInstance(ctx);
        if (m == null) return;
        update(ctx, m, m.getAppWidgetIds(new ComponentName(ctx, WidgetWide.class)), false);
        update(ctx, m, m.getAppWidgetIds(new ComponentName(ctx, WidgetSmall.class)), true);
    }

    static void update(Context ctx, AppWidgetManager m, int[] ids, boolean small) {
        if (ids == null || ids.length == 0) return;
        JSONObject d = data(ctx);
        for (int id : ids) {
            try {
                m.updateAppWidget(id, render(ctx, d, small, id));
            } catch (Exception ignored) {
                // a launcher that went away mid-update
            }
        }
    }

    private static String today() {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
    }

    private static void text(RemoteViews rv, int id, String s) {
        if (s == null || s.isEmpty()) rv.setViewVisibility(id, View.GONE);
        else {
            rv.setViewVisibility(id, View.VISIBLE);
            rv.setTextViewText(id, s);
        }
    }

    static RemoteViews render(Context ctx, JSONObject d, boolean small, int widgetId) {
        boolean rtl = d == null || d.optBoolean("rtl", true);
        int layout = small ? (rtl ? R.layout.widget_small_rtl : R.layout.widget_small_ltr)
                : (rtl ? R.layout.widget_wide_rtl : R.layout.widget_wide_ltr);
        RemoteViews rv = new RemoteViews(ctx.getPackageName(), layout);
        int base = (small ? 9300 : 9100) + (widgetId & 0xffff) * 4;
        rv.setOnClickPendingIntent(R.id.w_root, Launch.pending(ctx, base, "home", null, 0));
        String empty = d == null ? ctx.getString(R.string.widget_empty) : d.optString("empty", "");
        if (!empty.isEmpty()) {
            rv.setViewVisibility(R.id.w_content, View.GONE);
            rv.setViewVisibility(R.id.w_empty, View.VISIBLE);
            rv.setTextViewText(R.id.w_empty, empty);
            return rv;
        }
        rv.setViewVisibility(R.id.w_content, View.VISIBLE);
        rv.setViewVisibility(R.id.w_empty, View.GONE);
        // A new day since the app last spoke: today's pages start again from zero.
        boolean stale = !today().equals(d.optString("day", ""));
        text(rv, R.id.w_title, d.optString("book", ""));
        text(rv, R.id.w_line, small ? d.optString("short", d.optString("line", "")) : d.optString("line", ""));
        String streak = d.optString("streak", "");
        text(rv, R.id.w_streak, streak.isEmpty() ? "" : "🔥 " + streak);
        int pct = Math.max(0, Math.min(100, d.optInt("pct", 0)));
        boolean done = d.optBoolean("done", false);
        boolean hasBar = d.has("pct");
        rv.setViewVisibility(R.id.w_bar, hasBar && !done ? View.VISIBLE : View.GONE);
        rv.setViewVisibility(R.id.w_bar_done, hasBar && done ? View.VISIBLE : View.GONE);
        rv.setProgressBar(R.id.w_bar, 100, pct, false);
        rv.setProgressBar(R.id.w_bar_done, 100, 100, false);
        if (!small) {
            text(rv, R.id.w_prog, d.optString("progress", ""));
            String goal = stale ? d.optString("goalNew", "") : d.optString("goal", "");
            text(rv, R.id.w_goal, goal);
            String cta = d.optString("cta", "");
            String bookId = d.optString("bookId", "");
            if (!cta.isEmpty() && !bookId.isEmpty()) {
                text(rv, R.id.w_cta, cta);
                rv.setOnClickPendingIntent(R.id.w_cta, Launch.pending(ctx, base + 1, "book", bookId, d.optInt("page", 0)));
            } else rv.setViewVisibility(R.id.w_cta, View.GONE);
        }
        return rv;
    }
}
