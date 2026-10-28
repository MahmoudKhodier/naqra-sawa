package app.naqrasawa.reader;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(KeepAwakePlugin.class);
        registerPlugin(AppUpdatePlugin.class);
        registerPlugin(SystemUiPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
