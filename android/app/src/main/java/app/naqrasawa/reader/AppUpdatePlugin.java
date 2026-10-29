package app.naqrasawa.reader;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * In-app updates: downloads the newer APK (GitHub release android-latest) into the app's cache
 * and hands it to Android's package installer. The new APK must be signed with the same key.
 */
@CapacitorPlugin(name = "AppUpdate")
public class AppUpdatePlugin extends Plugin {

    /** Whether this app may open the installer (Android 8+ asks once per app: "install unknown apps"). */
    @PluginMethod
    public void canInstall(PluginCall call) {
        boolean allowed = Build.VERSION.SDK_INT < Build.VERSION_CODES.O
                || getContext().getPackageManager().canRequestPackageInstalls();
        JSObject r = new JSObject();
        r.put("allowed", allowed);
        call.resolve(r);
    }

    /** Opens the system screen where the person allows installs from this app. */
    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Intent i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
        }
        call.resolve();
    }

    /** Downloads {url} (https only, redirects followed) with "progress" events, then opens the installer. */
    @PluginMethod
    public void install(PluginCall call) {
        String url = call.getString("url");
        Integer mb = call.getInt("minBuild", 0); // small JS numbers arrive as Integer
        final long minBuild = mb == null ? 0L : mb.longValue();
        if (url == null || !url.startsWith("https://")) {
            call.reject("bad url");
            return;
        }
        new Thread(() -> {
            HttpURLConnection con = null;
            try {
                File dir = new File(getContext().getCacheDir(), "updates");
                if (!dir.exists() && !dir.mkdirs()) throw new Exception("cannot create the download folder");
                File apk = new File(dir, "naqra-sawa.apk");
                URL u = new URL(url);
                for (int hop = 0; ; hop++) {
                    if (hop > 5) throw new Exception("too many redirects");
                    con = (HttpURLConnection) u.openConnection();
                    con.setInstanceFollowRedirects(false);
                    con.setUseCaches(false);
                    con.setRequestProperty("Cache-Control", "no-cache");
                    con.setConnectTimeout(20000);
                    con.setReadTimeout(30000);
                    int code = con.getResponseCode();
                    if (code >= 300 && code < 400) {
                        String loc = con.getHeaderField("Location");
                        con.disconnect();
                        con = null;
                        if (loc == null) throw new Exception("redirect without a location");
                        u = new URL(u, loc);
                        if (!"https".equals(u.getProtocol())) throw new Exception("insecure redirect");
                        continue;
                    }
                    if (code != 200) throw new Exception("HTTP " + code);
                    break;
                }
                long total = con.getContentLengthLong();
                try (InputStream in = con.getInputStream(); OutputStream out = new FileOutputStream(apk)) {
                    byte[] buf = new byte[64 * 1024];
                    long got = 0;
                    long lastEmit = 0;
                    int n;
                    while ((n = in.read(buf)) != -1) {
                        out.write(buf, 0, n);
                        got += n;
                        long now = System.currentTimeMillis();
                        if (now - lastEmit > 250) {
                            lastEmit = now;
                            JSObject p = new JSObject();
                            p.put("loaded", got);
                            p.put("total", total);
                            notifyListeners("progress", p);
                        }
                    }
                }
                // The file must be this app, and at least the build the app was told about (never an older copy).
                PackageManager pm = getContext().getPackageManager();
                PackageInfo pi = pm.getPackageArchiveInfo(apk.getPath(), 0);
                if (pi == null || !getContext().getPackageName().equals(pi.packageName)) throw new Exception("not this app");
                long vc = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? pi.getLongVersionCode() : pi.versionCode;
                if (minBuild > 0 && vc < minBuild) throw new Exception("stale " + vc + " < " + minBuild);
                Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
                Intent i = new Intent(Intent.ACTION_VIEW);
                i.setDataAndType(uri, "application/vnd.android.package-archive");
                i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(i);
                call.resolve();
            } catch (Exception e) {
                call.reject(e.getMessage() != null ? e.getMessage() : "download failed");
            } finally {
                if (con != null) con.disconnect();
            }
        }).start();
    }
}
