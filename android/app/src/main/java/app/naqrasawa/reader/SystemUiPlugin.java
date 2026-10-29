package app.naqrasawa.reader;

import android.content.res.Configuration;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.ColorFilter;
import android.graphics.Paint;
import android.graphics.PixelFormat;
import android.graphics.Rect;
import android.graphics.drawable.Drawable;
import android.os.Build;
import android.view.View;
import android.view.Window;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * The strips around the page (status bar, navigation bar, camera cut-out) take the colours of what is on screen:
 * the app's background, or the reader's bars and page colour. Capacitor's SystemBars pads the window by those
 * strips and repaints them with the theme colour on every rotation, so the last colours are put back after it.
 * Also hides the status bar (clock, battery) while reading; a swipe from the top shows it for a moment.
 * The navigation bar (back / home, or the gesture line) always stays: the page is laid out above it.
 */
@CapacitorPlugin(name = "SystemUi")
public class SystemUiPlugin extends Plugin {

    private int top = Color.TRANSPARENT, bottom = Color.TRANSPARENT, side = Color.TRANSPARENT;
    private boolean light = true;
    private boolean painted = false;
    private boolean fullscreen = false;
    private StripsDrawable strips;

    /** {top, bottom, side} as #rrggbb; light = light colours, so the bar icons should be dark. */
    @PluginMethod
    public void paint(PluginCall call) {
        final int t = parse(call.getString("top"), Color.WHITE);
        final int b = parse(call.getString("bottom"), t);
        final int s = parse(call.getString("side"), t);
        final boolean l = Boolean.TRUE.equals(call.getBoolean("light", true));
        getActivity().runOnUiThread(() -> {
            top = t;
            bottom = b;
            side = s;
            light = l;
            painted = true;
            applyColours();
            call.resolve();
        });
    }

    @PluginMethod
    public void fullscreen(PluginCall call) {
        final boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        getActivity().runOnUiThread(() -> {
            fullscreen = on;
            applyFullscreen();
            call.resolve();
        });
    }

    @Override
    protected void handleOnConfigurationChanged(Configuration newConfig) {
        super.handleOnConfigurationChanged(newConfig);
        // Runs after SystemBars has reset the window colour for the new orientation.
        View decor = getActivity().getWindow().getDecorView();
        decor.post(() -> {
            if (painted) applyColours();
            if (fullscreen) applyFullscreen();
        });
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        if (fullscreen) getActivity().runOnUiThread(this::applyFullscreen);
    }

    private void applyColours() {
        Window w = getActivity().getWindow();
        View decor = w.getDecorView();
        if (strips == null) {
            strips = new StripsDrawable(decor);
            // The strips follow the window padding, which changes with rotation, the keyboard and fullscreen.
            decor.addOnLayoutChangeListener((v, l, t, r, b, ol, ot, or, ob) -> v.invalidate());
        }
        strips.set(top, bottom, side);
        if (decor.getBackground() != strips) decor.setBackground(strips);
        if (Build.VERSION.SDK_INT < 35) {
            // Android 14 and older still draw their own bar backgrounds.
            w.setStatusBarColor(top);
            w.setNavigationBarColor(bottom);
        }
        WindowInsetsControllerCompat c = WindowCompat.getInsetsController(w, decor);
        c.setAppearanceLightStatusBars(light);
        c.setAppearanceLightNavigationBars(light);
    }

    private void applyFullscreen() {
        Window w = getActivity().getWindow();
        WindowInsetsControllerCompat c = WindowCompat.getInsetsController(w, w.getDecorView());
        c.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        if (fullscreen) c.hide(WindowInsetsCompat.Type.statusBars());
        else c.show(WindowInsetsCompat.Type.statusBars());
        c.show(WindowInsetsCompat.Type.navigationBars());
    }

    private static int parse(String s, int fallback) {
        if (s == null || s.isEmpty()) return fallback;
        try {
            return Color.parseColor(s);
        } catch (IllegalArgumentException e) {
            return fallback;
        }
    }

    /** Fills the window's padding: top strip, bottom strip, and the sides (landscape). */
    static final class StripsDrawable extends Drawable {
        private final Paint paint = new Paint();
        private final View host;
        private int top, bottom, side;

        StripsDrawable(View host) {
            this.host = host;
        }

        void set(int t, int b, int s) {
            top = t;
            bottom = b;
            side = s;
            invalidateSelf();
        }

        @Override
        public void draw(Canvas c) {
            Rect r = getBounds();
            paint.setColor(side);
            c.drawRect(r, paint);
            int pt = host.getPaddingTop();
            int pb = host.getPaddingBottom();
            if (pt > 0) {
                paint.setColor(top);
                c.drawRect(r.left, r.top, r.right, r.top + pt, paint);
            }
            if (pb > 0) {
                paint.setColor(bottom);
                c.drawRect(r.left, r.bottom - pb, r.right, r.bottom, paint);
            }
        }

        @Override
        public void setAlpha(int alpha) {}

        @Override
        public void setColorFilter(ColorFilter cf) {}

        @Override
        public int getOpacity() {
            return PixelFormat.OPAQUE;
        }
    }
}
