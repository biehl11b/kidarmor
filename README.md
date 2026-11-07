# KidArmor

A private record of what happens at school for parents: bullying, IEP and 504 problems, calls, meetings and school emails.

- Record meetings with an automatic transcript and meeting notes
- Schedule meetings with two reminders, added to the phone's calendar
- Letters, email summaries and a PDF case binder
- Everything stays on the parent's phone. No account, no server.

Test version for feedback: https://kidarmor.coastlinecode.com/

## Where things are

- `native/src/app.html`: the app (one file). The website and the phone apps are both built from it.
- `web/build.sh`: rebuilds the website (`index.html`) from the app.
- `native/`: the iPhone and Android apps (Capacitor). GitHub Actions builds them; see `native/SUBMIT.md` for store submission and `native/STORE_LISTING.md` for listing text.
- `tests/`: browser tests. Run `bash tests/run-all.sh`.

© 2026 Coastline Code LLC. All rights reserved. See LICENSE. Not open source.
