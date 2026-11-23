/* KidArmor phone app. Copyright (c) 2026 Coastline Code LLC. */
package com.coastlinecode.kidarmor;

import android.content.res.Configuration;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.webkit.WebView;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.os.Build;
import android.view.PixelCopy;
import android.view.View;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private final Handler main = new Handler(Looper.getMainLooper());
    private static int reloads = 0; // for the whole time the app is open, so a rebuilt screen never loops
    private boolean checking = false;
    private boolean restored = false;
    private static final int SPLASH = 0x1f5d70; // the launch screen's background colour

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // KA_LIFE lines show in the phone log even in the store version, so a start-up problem can be traced.
        restored = savedInstanceState != null;
        Log.i("KA_LIFE", "onCreate restored=" + restored);
        if (restored) Log.i("KA_LIFE", "settings before restart: " + savedInstanceState.getString("ka_cfg") + " | now: " + getResources().getConfiguration());
        registerPlugin(KaTranscribePlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onSaveInstanceState(Bundle out) {
        out.putString("ka_cfg", String.valueOf(getResources().getConfiguration()));
        super.onSaveInstanceState(out);
    }

    @Override
    public void onResume() {
        super.onResume();
        checkPageSoon(restored ? 4000 : 10000);
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
     * The page can be loaded but never drawn (seen on Android 10 after Android restarts the screen during
     * start-up): the phone keeps showing the launch screen. Look at the real screen pixels; if it's still
     * the launch screen, load the page again, and if that doesn't help, rebuild the screen.
     */
    private void checkDrawn(final WebView wv) {
        if (Build.VERSION.SDK_INT < 26) return;
        try {
            final View root = getWindow().getDecorView();
            final int w = root.getWidth(), h = root.getHeight();
            if (w <= 0 || h <= 0) return;
            final Bitmap bm = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
            PixelCopy.request(getWindow(), bm, result -> {
                if (result != PixelCopy.SUCCESS) { Log.w("KA_LIFE", "screen check: couldn't read screen (" + result + ")"); return; }
                int[][] pts = {{w / 10, h / 4}, {w * 9 / 10, h / 4}, {w / 10, h * 3 / 4}, {w * 9 / 10, h * 3 / 4}, {w / 2, h / 5}};
                int splash = 0;
                for (int[] p : pts) if (near(bm.getPixel(p[0], p[1]), SPLASH)) splash++;
                bm.recycle();
                Log.i("KA_LIFE", "screen check: " + splash + " of " + pts.length + " spots look like the launch screen");
                if (splash < pts.length) return;
                reloads++;
                if (reloads == 1) { Log.w("KA_LIFE", "page loaded but not drawn; loading it again"); bridge.reload(); checkPageSoon(5000); }
                else { Log.w("KA_LIFE", "page still not drawn; rebuilding the screen"); recreate(); }
            }, main);
        } catch (Throwable t) {
            Log.w("KA_LIFE", "screen check failed: " + t);
        }
    }

    private static boolean near(int c, int rgb) {
        return Math.abs(Color.red(c) - ((rgb >> 16) & 255)) < 12 && Math.abs(Color.green(c) - ((rgb >> 8) & 255)) < 12 && Math.abs(Color.blue(c) - (rgb & 255)) < 12;
    }

    /**
     * Safety net: a few seconds after the screen appears, make sure KidArmor's page actually loaded.
     * On some phones (seen on Android 10) Android restarts the screen while the app is starting, and the
     * page could stay blank. If the page isn't there, load it again (at most twice).
     */
    private void checkPageSoon(long delay) {
        if (checking || reloads >= 3) return;
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
                        if ("\"ok\"".equals(v)) { checkDrawn(wv); return; }
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
