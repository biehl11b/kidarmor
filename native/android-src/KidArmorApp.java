/* KidArmor phone app. Copyright (c) 2026 Coastline Code LLC. */
package com.coastlinecode.kidarmor;

import android.app.Application;
import android.util.Log;
import android.webkit.WebSettings;

/**
 * Loads the phone's web viewer (Android System WebView) once, before KidArmor's screen is created.
 *
 * On some phones (seen on Android 10) the very first time an app uses the web viewer, Android adds the
 * viewer's resources to the app and restarts the app's screen to pick them up. Capacitor's screen doesn't
 * come back from that restart, so the app stayed blank. Loading the viewer here, before any screen
 * exists, means there is nothing to restart.
 */
public class KidArmorApp extends Application {
    @Override
    public void onCreate() {
        super.onCreate();
        try {
            WebSettings.getDefaultUserAgent(this);
            Log.i("KA_LIFE", "web viewer ready before the first screen");
        } catch (Throwable t) {
            Log.w("KA_LIFE", "couldn't load the web viewer early: " + t);
        }
    }
}
