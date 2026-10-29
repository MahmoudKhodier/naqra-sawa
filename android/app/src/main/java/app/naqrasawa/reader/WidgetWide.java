package app.naqrasawa.reader;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;

/** «وردك النهارده», medium (4×2): book, today's portion, its progress, the streak, today's goal, «كمّل». */
public class WidgetWide extends AppWidgetProvider {
    @Override
    public void onUpdate(Context ctx, AppWidgetManager m, int[] ids) {
        WidgetRender.update(ctx, m, ids, false);
    }
}
