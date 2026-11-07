# KidArmor tests

Browser tests that drive the real app (`native/src/app.html`) with Playwright and Chromium.

    bash tests/run-all.sh

- `test_every_button.js` clicks every button on every screen and reports script errors or buttons that do nothing.
- `test_security.js` checks that crafted links and files can't inject HTML, gain write access or hang the app, and that the lock screen hides records.
- The rest cover individual features: recording, transcripts, notes, reminders, reports, letters, links, sharing with a professional, backup, the agreement screen and Face ID/PIN.
