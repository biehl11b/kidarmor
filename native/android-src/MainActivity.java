/* KidArmor phone app. Copyright (c) 2026 Coastline Code LLC. */
package com.coastlinecode.kidarmor;

import android.content.res.Configuration;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private final Handler main = new Handler(Looper.getMainLooper());
    private int reloads = 0;
    private boolean checking = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // KA_LIFE lines show in the phone log even in the store version, so a start-up problem can be traced.
        Log.i("KA_LIFE", "onCreate restored=" + (savedInstanceState != null));
        registerPlugin(KaTranscribePlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onResume() {
        super.onResume();
        checkPageSoon(10000);
    }

    @Override
    public void onConfigurationChanged(Configuration c) {
        Log.i("KA_LIFE", "configuration changed (handled, no restart)");
        super.onConfigurationChanged(c);
    }

    @Override
    public void onDestroy() {
        Log.i("KA_LIFE", "onDestroy finishing=" + isFinishing() + " changingConfig=" + isChangingConfigurations());
        main.removeCallbacksAndMessages(null);
        super.onDestroy();
    }

    /**
     * Safety net: a few seconds after the screen appears, make sure KidArmor's page actually loaded.
     * On some phones (seen on Android 10) Android restarts the screen while the app is starting, and the
     * page could stay blank. If the page isn't there, load it again (at most twice).
     */
    private void checkPageSoon(long delay) {
        if (checking || reloads >= 2) return;
        checking = true;
        main.postDelayed(() -> {
            checking = false;
            try {
                if (bridge == null || isFinishing()) { Log.w("KA_LIFE", "page check: no bridge"); return; }
                final WebView wv = bridge.getWebView();
                if (wv == null) { Log.w("KA_LIFE", "page check: no web view"); return; }
                Log.i("KA_LIFE", "page check: url=" + wv.getUrl() + " progress=" + wv.getProgress() + " size=" + wv.getWidth() + "x" + wv.getHeight()
                    + " shown=" + wv.isShown() + " attached=" + wv.isAttachedToWindow() + " parent=" + (wv.getParent() != null) + " content=" + (findViewById(android.R.id.content) != null ? ((android.view.ViewGroup) findViewById(android.R.id.content)).getChildCount() : -1));
                wv.evaluateJavascript(
                    "(function(){try{if(document.readyState==='loading')return 'loading';"
                        + "return document.querySelector('nav.tabs')?'ok':'empty'}catch(e){return 'error'}})()",
                    v -> {
                        Log.i("KA_LIFE", "page check result: " + v);
                        if ("\"ok\"".equals(v)) return;
                        if ("\"loading\"".equals(v)) { Log.i("KA_LIFE", "page still loading"); checkPageSoon(5000); return; }
                        reloads++;
                        Log.w("KA_LIFE", "page didn't come up (" + v + ", shown=" + wv.isShown() + "); loading it again");
                        bridge.reload();
                        checkPageSoon(10000);
                    });
            } catch (Throwable t) {
                Log.w("KA_LIFE", "page check failed: " + t);
            }
        }, delay);
    }
}
