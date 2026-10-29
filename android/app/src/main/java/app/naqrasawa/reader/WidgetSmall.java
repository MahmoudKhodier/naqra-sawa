package app.naqrasawa.reader;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;

/** «وردك النهارده», small (2×1): book, the streak, the portion's progress bar and pages. */
public class WidgetSmall extends AppWidgetProvider {
    @Override
    public void onUpdate(Context ctx, AppWidgetManager m, int[] ids) {
        WidgetRender.update(ctx, m, ids, true);
    }
}
