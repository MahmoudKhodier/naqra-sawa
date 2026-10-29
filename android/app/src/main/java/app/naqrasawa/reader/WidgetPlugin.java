package app.naqrasawa.reader;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** The app tells the home-screen widget what to show (site/js/widget.js): update({data}) and clear(). */
@CapacitorPlugin(name = "Widget")
public class WidgetPlugin extends Plugin {

    @PluginMethod
    public void update(PluginCall call) {
        JSObject d = call.getObject("data");
        if (d == null) {
            call.reject("no data");
            return;
        }
        String json = d.toString();
        if (json.length() > 16000) {
            call.reject("too large");
            return;
        }
        WidgetRender.save(getContext(), json);
        WidgetRender.refreshAll(getContext());
        call.resolve();
    }

    /** Signed out: back to «open the app to set up the widget». */
    @PluginMethod
    public void clear(PluginCall call) {
        WidgetRender.save(getContext(), null);
        WidgetRender.refreshAll(getContext());
        call.resolve();
    }
}
