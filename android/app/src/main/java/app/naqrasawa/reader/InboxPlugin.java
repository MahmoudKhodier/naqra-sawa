package app.naqrasawa.reader;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import androidx.core.app.NotificationManagerCompat;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONObject;

import java.util.concurrent.TimeUnit;

/**
 * Cheers, nudges and replies as notifications while the app is closed, without a push service:
 * a WorkManager job asks the database about every 15 minutes (InboxCheck). The web side passes the
 * project URL, the public anon key, this phone's random token (registered with register_device) and the
 * app language; they stay in app-private SharedPreferences.
 * Also hands the web side where a tapped notification or widget wants to go (takeLaunch / "launch").
 */
@CapacitorPlugin(
        name = "Inbox",
        permissions = { @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "notifications") }
)
public class InboxPlugin extends Plugin {
    static final String WORK = "naqra-inbox";

    @Override
    public void load() {
        Launch.capture(getActivity().getIntent());
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        JSObject o = Launch.capture(intent);
        if (o != null) notifyListeners("launch", o);
    }

    /** {url, anonKey, token, lang}: remember them and keep the periodic check scheduled. */
    @PluginMethod
    public void enable(PluginCall call) {
        String url = call.getString("url", "");
        String key = call.getString("anonKey", "");
        String token = call.getString("token", "");
        String lang = InboxText.lang(call.getString("lang", "eg"));
        if (url == null || !url.startsWith("https://") && !url.startsWith("http://localhost")) {
            call.reject("bad url");
            return;
        }
        if (key == null || key.isEmpty() || token == null || token.length() < 32) {
            call.reject("missing key or token");
            return;
        }
        Context ctx = getContext();
        SharedPreferences p = InboxCheck.prefs(ctx);
        SharedPreferences.Editor ed = p.edit().putBoolean("on", true).putString("url", url).putString("key", key).putString("lang", lang);
        if (!token.equals(p.getString("token", ""))) {
            // a new token (new sign-in): start from now, nothing old pops up
            ed.putString("token", token).putString("since", InboxCheck.isoNow()).putString("seen", "[]");
        }
        ed.apply();
        InboxCheck.ensureChannel(ctx, lang);
        schedule(ctx);
        call.resolve(state());
    }

    @PluginMethod
    public void disable(PluginCall call) {
        Context ctx = getContext();
        WorkManager.getInstance(ctx).cancelUniqueWork(WORK);
        InboxCheck.prefs(ctx).edit().clear().apply();
        call.resolve(state());
    }

    @PluginMethod
    public void status(PluginCall call) {
        call.resolve(state());
    }

    /** For testing: one look right now (the database allows one a minute per phone). */
    @PluginMethod
    public void checkNow(PluginCall call) {
        final Context ctx = getContext().getApplicationContext();
        new Thread(() -> {
            JSONObject r = InboxCheck.run(ctx);
            try {
                call.resolve(JSObject.fromJSONObject(r));
            } catch (Exception e) {
                call.resolve(state());
            }
        }).start();
    }

    /** Android 13+: the system's «allow notifications?» question. {display: granted | denied | prompt} */
    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "permissionDone");
            return;
        }
        call.resolve(state());
    }

    @PermissionCallback
    private void permissionDone(PluginCall call) {
        call.resolve(state());
    }

    /** Where a tapped notification or widget asked to go ({open, book?, page?}), once; {} when nothing. */
    @PluginMethod
    public void takeLaunch(PluginCall call) {
        JSObject o = Launch.take();
        call.resolve(o != null ? o : new JSObject());
    }

    static void schedule(Context ctx) {
        Constraints c = new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
        PeriodicWorkRequest req = new PeriodicWorkRequest.Builder(InboxWorker.class, 15, TimeUnit.MINUTES)
                .setConstraints(c)
                .build();
        WorkManager.getInstance(ctx).enqueueUniquePeriodicWork(WORK, ExistingPeriodicWorkPolicy.KEEP, req);
    }

    private JSObject state() {
        Context ctx = getContext();
        SharedPreferences p = InboxCheck.prefs(ctx);
        JSObject o = new JSObject();
        o.put("enabled", p.getBoolean("on", false));
        o.put("lang", p.getString("lang", null));
        o.put("lastCheck", p.getString("lastCheck", null));
        o.put("lastError", p.getString("lastError", null));
        o.put("since", p.getString("since", null));
        String display;
        if (Build.VERSION.SDK_INT >= 33) {
            PermissionState s = getPermissionState("notifications");
            display = s == PermissionState.GRANTED ? "granted" : s == PermissionState.DENIED ? "denied" : "prompt";
        } else {
            display = NotificationManagerCompat.from(ctx).areNotificationsEnabled() ? "granted" : "denied";
        }
        if ("granted".equals(display) && !NotificationManagerCompat.from(ctx).areNotificationsEnabled()) display = "denied";
        o.put("display", display);
        return o;
    }
}
