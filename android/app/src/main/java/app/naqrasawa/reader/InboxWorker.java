package app.naqrasawa.reader;

import android.content.Context;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

/** The periodic look at the inbox (WorkManager, ~every 15 minutes while online), plus a widget refresh. */
public class InboxWorker extends Worker {
    public InboxWorker(@NonNull Context ctx, @NonNull WorkerParameters params) {
        super(ctx, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        InboxCheck.run(getApplicationContext());
        // A new day: the widget's "today" numbers go back to zero even while the app stays closed.
        WidgetRender.refreshAll(getApplicationContext());
        // Errors (offline, server down) wait for the next run instead of retrying sooner: easy on the battery.
        return Result.success();
    }
}
