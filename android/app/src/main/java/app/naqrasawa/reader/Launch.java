package app.naqrasawa.reader;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;

import com.getcapacitor.JSObject;

/**
 * Where a notification or the widget asks the app to open: extras on the intent that starts MainActivity,
 * read once by the web side through Inbox.takeLaunch() (and the "launch" event).
 *   naqra_open = "inbox" | "home" | "book"; naqra_book = book id, naqra_page = page (for "book").
 */
final class Launch {
    static final String OPEN = "naqra_open";
    static final String BOOK = "naqra_book";
    static final String PAGE = "naqra_page";

    private static JSObject pending;

    private Launch() {}

    static Intent intent(Context ctx, String open, String book, int page) {
        Intent i = new Intent(ctx, MainActivity.class);
        i.setAction("app.naqrasawa.reader.OPEN_" + open);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        i.putExtra(OPEN, open);
        if (book != null && !book.isEmpty()) i.putExtra(BOOK, book);
        if (page > 0) i.putExtra(PAGE, page);
        return i;
    }

    static PendingIntent pending(Context ctx, int requestCode, String open, String book, int page) {
        return PendingIntent.getActivity(ctx, requestCode, intent(ctx, open, book, page),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Remembers the intent's target (and removes it from the intent so it is used once). */
    static synchronized JSObject capture(Intent i) {
        if (i == null || !i.hasExtra(OPEN)) return null;
        JSObject o = new JSObject();
        o.put("open", i.getStringExtra(OPEN));
        String b = i.getStringExtra(BOOK);
        if (b != null) o.put("book", b);
        int p = i.getIntExtra(PAGE, 0);
        if (p > 0) o.put("page", p);
        i.removeExtra(OPEN);
        i.removeExtra(BOOK);
        i.removeExtra(PAGE);
        pending = o;
        return o;
    }

    static synchronized JSObject take() {
        JSObject o = pending;
        pending = null;
        return o;
    }
}
