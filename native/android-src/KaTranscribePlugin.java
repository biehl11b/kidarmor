/* KidArmor: writes a meeting transcript from a saved recording, on the phone.
 * Copyright (c) 2026 Coastline Code LLC. All rights reserved.
 *
 * Why: while KidArmor records, Android gives the microphone to the recording and silence
 * to the speech recognizer, so live transcripts come out empty. Instead, after the
 * parent taps Stop, this decodes the saved recording and feeds the sound to Android's
 * speech recognizer (Android 13+ can take audio from the app instead of the microphone).
 * Nothing is uploaded by KidArmor. With "On this phone only" it uses the phone's
 * on-device recognizer; otherwise the phone's speech service (Google's). */
package com.coastlinecode.kidarmor;

import android.content.Intent;
import androidx.annotation.RequiresApi;
import android.media.AudioFormat;
import android.media.MediaCodec;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelFileDescriptor;
import android.speech.RecognitionListener;
import android.speech.RecognitionSupport;
import android.speech.RecognitionSupportCallback;
import java.util.List;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.ArrayList;

@CapacitorPlugin(name = "KaTranscribe")
public class KaTranscribePlugin extends Plugin {

    private static final int RATE = 16000;
    private final Handler main = new Handler(Looper.getMainLooper());

    @PluginMethod
    public void available(PluginCall call) {
        JSObject r = new JSObject();
        boolean api = Build.VERSION.SDK_INT >= 33;
        boolean service = false, onDevice = false;
        try { service = SpeechRecognizer.isRecognitionAvailable(getContext()); } catch (Exception e) { }
        try { if (Build.VERSION.SDK_INT >= 31) onDevice = SpeechRecognizer.isOnDeviceRecognitionAvailable(getContext()); } catch (Exception e) { }
        r.put("supported", api && (service || onDevice));
        r.put("api", Build.VERSION.SDK_INT);
        r.put("service", service);
        r.put("onDevice", onDevice);
        call.resolve(r);
    }

    /** Whether the phone has its speech files for this language on the phone.
     * Returns {state: "ready" | "downloading" | "missing" | "unknown"}. With download:true and the
     * files missing, asks the phone to fetch them (Android shows its own "Download" box). */
    @PluginMethod
    public void speechFiles(PluginCall call) {
        final String lang = call.getString("language", "en-US");
        final boolean download = Boolean.TRUE.equals(call.getBoolean("download", false));
        if (Build.VERSION.SDK_INT < 33) { JSObject r = new JSObject(); r.put("state", "unknown"); call.resolve(r); return; }
        main.post(() -> checkFiles(call, lang, download));
    }

    @RequiresApi(33)
    private void checkFiles(PluginCall call, String lang, boolean download) {
        final SpeechRecognizer sr;
        try {
            if (!SpeechRecognizer.isOnDeviceRecognitionAvailable(getContext())) { JSObject r = new JSObject(); r.put("state", "unknown"); call.resolve(r); return; }
            sr = SpeechRecognizer.createOnDeviceSpeechRecognizer(getContext());
        } catch (Exception e) { JSObject r = new JSObject(); r.put("state", "unknown"); call.resolve(r); return; }
        final boolean[] answered = {false};
        final Intent it = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        it.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        it.putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang);
        try {
            sr.checkRecognitionSupport(it, getContext().getMainExecutor(), new RecognitionSupportCallback() {
                @Override public void onSupportResult(RecognitionSupport s) {
                    if (answered[0]) return; answered[0] = true;
                    String state = "missing";
                    if (has(s.getInstalledOnDeviceLanguages(), lang)) state = "ready";
                    else {
                        try { if (Build.VERSION.SDK_INT >= 34 && has(s.getPendingOnDeviceLanguages(), lang)) state = "downloading"; } catch (Throwable t) { }
                        if (!"downloading".equals(state) && !has(s.getSupportedOnDeviceLanguages(), lang) && !s.getSupportedOnDeviceLanguages().isEmpty()) state = "unsupported";
                    }
                    if (download && "missing".equals(state)) { try { sr.triggerModelDownload(it); state = "downloading"; } catch (Exception e) { } }
                    try { sr.destroy(); } catch (Exception e) { }
                    JSObject r = new JSObject(); r.put("state", state); call.resolve(r);
                }
                @Override public void onError(int code) {
                    if (answered[0]) return; answered[0] = true;
                    try { sr.destroy(); } catch (Exception e) { }
                    JSObject r = new JSObject(); r.put("state", "unknown"); r.put("error", code); call.resolve(r);
                }
            });
        } catch (Exception e) { try { sr.destroy(); } catch (Exception x) { } JSObject r = new JSObject(); r.put("state", "unknown"); call.resolve(r); return; }
        main.postDelayed(() -> { if (!answered[0]) { answered[0] = true; try { sr.destroy(); } catch (Exception e) { } JSObject r = new JSObject(); r.put("state", "unknown"); r.put("error", "timeout"); call.resolve(r); } }, 8000);
    }

    private static boolean has(List<String> langs, String lang) {
        if (langs == null) return false;
        String want = lang.toLowerCase().replace('_', '-'), base = want.split("-")[0];
        for (String l : langs) { if (l == null) continue; String x = l.toLowerCase().replace('_', '-'); if (x.equals(want)) return true; }
        for (String l : langs) { if (l == null) continue; String x = l.toLowerCase().replace('_', '-'); if (x.equals(base) || x.startsWith(base + "-")) return true; }
        return false;
    }

    @PluginMethod
    public void transcribe(PluginCall call) {
        if (Build.VERSION.SDK_INT < 33) { call.reject("This Android version can't write transcripts from a recording.", "unsupported"); return; }
        String path = call.getString("path", "");
        final boolean onDevice = Boolean.TRUE.equals(call.getBoolean("onDevice", false));
        final String lang = call.getString("language", "en-US");
        if (path.startsWith("file://")) path = Uri.parse(path).getPath();
        final File in = new File(path);
        if (!in.exists()) { call.reject("Recording file not found", "missing"); return; }
        final File pcm = new File(getContext().getCacheDir(), "kidarmor-tx-" + System.currentTimeMillis() + ".pcm");
        new Thread(() -> {
            long samples;
            try { samples = decodeToPcm(in, pcm); }
            catch (Exception e) { pcm.delete(); call.reject("Couldn't read the recording: " + e.getMessage(), "decode"); return; }
            if (samples <= 0) { pcm.delete(); JSObject r = new JSObject(); r.put("segments", new JSArray()); r.put("seconds", 0); call.resolve(r); return; }
            final double seconds = samples / (double) RATE;
            main.post(() -> recognize(call, pcm, seconds, onDevice, lang, true, 0));
        }, "KaTranscribe-decode").start();
    }

    /** Feeds the decoded sound to the recognizer. If the chosen recognizer can't take sound from
     * the app, tries the other kind once (never sends to the speech service when the parent chose
     * "On this phone only"). */
    @RequiresApi(33)
    private void recognize(PluginCall call, File pcm, double seconds, boolean onDevice, String lang, boolean firstTry, int earlierCode) {
        final SpeechRecognizer sr;
        try {
            boolean useOnDevice = onDevice && Build.VERSION.SDK_INT >= 31 && SpeechRecognizer.isOnDeviceRecognitionAvailable(getContext());
            if (onDevice && !useOnDevice) { pcm.delete(); call.reject("This phone can't make transcripts on the phone itself.", "on-device-unavailable"); return; }
            if (!useOnDevice && !SpeechRecognizer.isRecognitionAvailable(getContext())) {
                if (Build.VERSION.SDK_INT >= 31 && SpeechRecognizer.isOnDeviceRecognitionAvailable(getContext())) useOnDevice = true;
                else { pcm.delete(); call.reject("No speech service on this phone.", "service-not-allowed"); return; }
            }
            sr = useOnDevice ? SpeechRecognizer.createOnDeviceSpeechRecognizer(getContext()) : SpeechRecognizer.createSpeechRecognizer(getContext());
        } catch (Exception e) { pcm.delete(); call.reject("Couldn't start the speech recognizer: " + e.getMessage(), "start"); return; }

        final ParcelFileDescriptor[] pipe;
        try { pipe = ParcelFileDescriptor.createPipe(); } catch (Exception e) { sr.destroy(); pcm.delete(); call.reject("pipe", "start"); return; }
        final long[] fed = {0};             // bytes handed to the recognizer so far (for timestamps)
        final boolean[] done = {false};
        final ArrayList<JSObject> segs = new ArrayList<>();

        final Runnable finish = () -> {
            if (done[0]) return; done[0] = true;
            try { sr.destroy(); } catch (Exception e) { }
            try { pipe[0].close(); } catch (Exception e) { }
            pcm.delete();
            JSObject r = new JSObject(); JSArray a = new JSArray(); for (JSObject s : segs) a.put(s);
            r.put("segments", a); r.put("seconds", seconds); call.resolve(r);
        };

        sr.setRecognitionListener(new RecognitionListener() {
            private void add(Bundle b) {
                ArrayList<String> m = b == null ? null : b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                if (m == null || m.isEmpty() || m.get(0) == null || m.get(0).trim().isEmpty()) return;
                // the pipe only holds ~64 KB, so what's been fed is close to what's been heard
                double t = Math.max(0, fed[0] / 2.0 / RATE - 2.0);
                JSObject s = new JSObject(); s.put("t", Math.min(t, seconds)); s.put("text", m.get(0).trim()); segs.add(s);
                JSObject p = new JSObject(); p.put("done", Math.min(1.0, fed[0] / 2.0 / RATE / Math.max(seconds, 1)));
                notifyListeners("progress", p);
            }
            @Override public void onSegmentResults(Bundle b) { add(b); }
            @Override public void onEndOfSegmentedSession() { finish.run(); }
            @Override public void onResults(Bundle b) { add(b); finish.run(); }
            @Override public void onError(int code) {
                if (done[0]) return;
                // any failure before words come back on the speech service: try the phone's own recognizer once
                if (segs.isEmpty() && firstTry && !onDevice && code != SpeechRecognizer.ERROR_NO_MATCH && code != SpeechRecognizer.ERROR_SPEECH_TIMEOUT && Build.VERSION.SDK_INT >= 31 && SpeechRecognizer.isOnDeviceRecognitionAvailable(getContext())) {
                    done[0] = true; try { sr.destroy(); } catch (Exception e) { } try { pipe[0].close(); } catch (Exception e) { }
                    main.postDelayed(() -> recognize(call, pcm, seconds, true, lang, false, code), 300); return;
                }
                if (code == 13 /* ERROR_LANGUAGE_UNAVAILABLE */ && Build.VERSION.SDK_INT >= 33) {
                    try { Intent d = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH); d.putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang); sr.triggerModelDownload(d); } catch (Exception e) { }
                    done[0] = true; try { sr.destroy(); } catch (Exception e) { } pcm.delete();
                    call.reject("The phone is downloading its English speech files. Try again in a few minutes." + (earlierCode != 0 ? " (speech service error " + earlierCode + ")" : ""), "language-downloading"); return;
                }
                // no words heard, or the session ended: keep whatever was written
                if (!segs.isEmpty() || code == SpeechRecognizer.ERROR_NO_MATCH || code == SpeechRecognizer.ERROR_SPEECH_TIMEOUT) { finish.run(); return; }
                done[0] = true; try { sr.destroy(); } catch (Exception e) { } pcm.delete();
                call.reject("Speech recognizer error " + code + (earlierCode != 0 ? " (speech service error " + earlierCode + ")" : ""), "error-" + code);
            }
            @Override public void onReadyForSpeech(Bundle b) { }
            @Override public void onBeginningOfSpeech() { }
            @Override public void onRmsChanged(float v) { }
            @Override public void onBufferReceived(byte[] b) { }
            @Override public void onEndOfSpeech() { }
            @Override public void onEvent(int t, Bundle b) { }
            @Override public void onPartialResults(Bundle b) { }
        });

        Intent it = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        it.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        it.putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang);
        it.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false);
        it.putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE, pipe[0]);
        it.putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_CHANNEL_COUNT, 1);
        it.putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_ENCODING, AudioFormat.ENCODING_PCM_16BIT);
        it.putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_SAMPLING_RATE, RATE);
        it.putExtra(RecognizerIntent.EXTRA_SEGMENTED_SESSION, RecognizerIntent.EXTRA_AUDIO_SOURCE);
        it.putExtra(RecognizerIntent.EXTRA_ENABLE_FORMATTING, RecognizerIntent.FORMATTING_OPTIMIZE_QUALITY);
        if (onDevice) it.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true);

        // writer: streams the decoded sound into the pipe, then closes it (= end of the meeting)
        new Thread(() -> {
            try (BufferedInputStream fi = new BufferedInputStream(new FileInputStream(pcm));
                 OutputStream out = new ParcelFileDescriptor.AutoCloseOutputStream(pipe[1])) {
                byte[] buf = new byte[3200]; int n;
                while ((n = fi.read(buf)) > 0) { if (done[0]) break; out.write(buf, 0, n); fed[0] += n; }
                out.flush();
            } catch (Exception e) { /* recognizer stopped reading */ }
        }, "KaTranscribe-feed").start();

        try { sr.startListening(it); }
        catch (Exception e) { done[0] = true; try { sr.destroy(); } catch (Exception x) { } pcm.delete(); call.reject("Couldn't start: " + e.getMessage(), "start"); return; }
        // safety net: never leave the parent waiting forever
        long limitMs = (long) (seconds * 1000 * 2) + 120000;
        main.postDelayed(() -> { if (!done[0]) finish.run(); }, limitMs);
    }

    /** Decodes the recording (WebM/Opus or MP4/AAC) to 16 kHz mono 16-bit PCM. Returns samples written. */
    private long decodeToPcm(File in, File out) throws Exception {
        MediaExtractor ex = new MediaExtractor();
        ex.setDataSource(in.getAbsolutePath());
        int track = -1; MediaFormat fmt = null;
        for (int i = 0; i < ex.getTrackCount(); i++) {
            MediaFormat f = ex.getTrackFormat(i); String mime = f.getString(MediaFormat.KEY_MIME);
            if (mime != null && mime.startsWith("audio/")) { track = i; fmt = f; break; }
        }
        if (track < 0) { ex.release(); throw new Exception("no audio track"); }
        ex.selectTrack(track);
        MediaCodec dec = MediaCodec.createDecoderByType(fmt.getString(MediaFormat.KEY_MIME));
        dec.configure(fmt, null, null, 0); dec.start();
        int srcRate = fmt.containsKey(MediaFormat.KEY_SAMPLE_RATE) ? fmt.getInteger(MediaFormat.KEY_SAMPLE_RATE) : 48000;
        int ch = fmt.containsKey(MediaFormat.KEY_CHANNEL_COUNT) ? fmt.getInteger(MediaFormat.KEY_CHANNEL_COUNT) : 1;
        long written = 0; double pos = 0; // resampler position in source samples
        MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
        boolean inDone = false, outDone = false;
        try (OutputStream os = new BufferedOutputStream(new FileOutputStream(out), 1 << 16)) {
            ByteBuffer ob = ByteBuffer.allocate(8192).order(ByteOrder.LITTLE_ENDIAN);
            while (!outDone) {
                if (!inDone) {
                    int ii = dec.dequeueInputBuffer(10000);
                    if (ii >= 0) {
                        ByteBuffer ib = dec.getInputBuffer(ii);
                        int n = ex.readSampleData(ib, 0);
                        if (n < 0) { dec.queueInputBuffer(ii, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM); inDone = true; }
                        else { dec.queueInputBuffer(ii, 0, n, ex.getSampleTime(), 0); ex.advance(); }
                    }
                }
                int oi = dec.dequeueOutputBuffer(info, 10000);
                if (oi == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                    MediaFormat of = dec.getOutputFormat();
                    if (of.containsKey(MediaFormat.KEY_SAMPLE_RATE)) srcRate = of.getInteger(MediaFormat.KEY_SAMPLE_RATE);
                    if (of.containsKey(MediaFormat.KEY_CHANNEL_COUNT)) ch = of.getInteger(MediaFormat.KEY_CHANNEL_COUNT);
                } else if (oi >= 0) {
                    ByteBuffer b = dec.getOutputBuffer(oi);
                    if (b != null && info.size > 0) {
                        b.position(info.offset); b.limit(info.offset + info.size);
                        ByteBuffer s = b.slice().order(ByteOrder.LITTLE_ENDIAN);
                        int frames = info.size / 2 / ch; double step = srcRate / (double) RATE;
                        // simple resampler: average the channels, pick samples at the 16 kHz positions
                        while (pos < frames) {
                            int f = (int) pos; int sum = 0;
                            for (int c = 0; c < ch; c++) sum += s.getShort((f * ch + c) * 2);
                            short v = (short) (sum / ch);
                            if (ob.remaining() < 2) { os.write(ob.array(), 0, ob.position()); ob.clear(); }
                            ob.putShort(v); written++; pos += step;
                        }
                        pos -= frames;
                    }
                    dec.releaseOutputBuffer(oi, false);
                    if ((info.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) outDone = true;
                }
            }
            os.write(ob.array(), 0, ob.position());
        } finally {
            try { dec.stop(); } catch (Exception e) { } dec.release(); ex.release();
        }
        return written;
    }
}
