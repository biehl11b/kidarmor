# Getting KidArmor into the App Store and Google Play

Everything the app needs is built by GitHub Actions ("Build phone apps") on every push to `main`. The steps below are the parts only the account owner (Josh) can do. Listing text and form answers are in `STORE_LISTING.md`.

## Before either store

1. ~~Publish the Privacy Policy and Terms pages~~ **Done Nov 7, 2026.** Both are live with the effective date, and linked from the KidArmor page (177).
2. ~~Effective date in the app~~ **Done** (`LEGAL_EFFECTIVE = "November 7, 2026"`).
3. ~~Decide the price~~ **$1.99 one-time download.** Paid apps need extra setup in both stores (below): Apple's Paid Apps agreement with tax and bank info, and a Google merchant account. On Google, choose **Paid** before the first release, because a free app can't be switched to paid later.

## Apple App Store

1. ~~Apple Developer enrollment~~ **Submitted Nov 10, 2026** in the Apple Developer app: Organization, Coastline Code LLC, D-U-N-S 149653843, account holder Josh's personal Apple ID, work email info@coastlinecode.com. Enrollment ID D78QBJSV5F. Apple asked for documents; photo ID, MS Certificate of Formation and EIN letter all uploaded Nov 10. Waiting on Apple's review (they may call 228-304-5333), then accept terms and pay $99. (info@ is a Managed Apple Account under Apple Business, verification sent Nov 10; add it to the team later.)
2. In **App Store Connect → Apps → +**, create the app: name *KidArmor*, bundle ID `com.coastlinecode.kidarmor` (register it under Certificates, Identifiers & Profiles first), SKU `kidarmor`, primary language English (U.S.).
3. In **Users and Access → Integrations → App Store Connect API**, make a **Team key with the Admin role**. Download the `.p8` file (you can only download it once) and note the Key ID and Issuer ID. Your Team ID is under Membership.
4. In GitHub → kidarmor repo → **Settings → Secrets and variables → Actions**, add:
   - `APPLE_TEAM_ID`, `ASC_KEY_ID`, `ASC_ISSUER_ID`
   - `ASC_KEY_P8`: open the .p8 file in a text editor and paste all of it, including the BEGIN and END lines.
5. Re-run "Build phone apps" (Actions tab → Run workflow). The iOS job now builds the App Store version with Xcode 26 and uploads it. It shows up in **TestFlight** 10–30 minutes later. No Mac needed.
6. In TestFlight, install it on your iPhone and try the main features (record a meeting, schedule, Face ID, share with a professional).
7. In **Business** (App Store Connect), accept the **Paid Apps agreement** and add tax forms (W-9) and the business bank account; apply for the **App Store Small Business Program** (15% instead of 30%). Then, on the app's App Store page, fill in the text, screenshots (`native/store/screenshots/iphone`), App Privacy (**Data Not Collected**), age rating, review notes and export compliance answers from `STORE_LISTING.md`. Pick the TestFlight build and **Submit for Review**.

## Google Play

1. Create the **Google Play Console** developer account as an **organization** (Coastline Code LLC, with the D-U-N-S number). Organization accounts skip the 12-tester, 14-day closed test that new personal accounts must run.
2. Make an **upload key** once (on any computer with Java):
   `keytool -genkeypair -v -keystore upload.jks -alias kidarmor -keyalg RSA -keysize 2048 -validity 10000`
   Keep `upload.jks` and its password somewhere safe (a password manager); Google can reset a lost upload key, but it takes days.
3. In GitHub secrets add `ANDROID_KEYSTORE_B64` (the file as base64: `base64 -i upload.jks` on a Mac, or `certutil -encode` on Windows, removing the header lines), `ANDROID_KEYSTORE_PASSWORD` and `ANDROID_KEY_ALIAS` (`kidarmor`).
4. Re-run "Build phone apps". Download **KidArmor-store-bundle** (the `.aab`) from the run's page.
5. In Play Console, set up the **merchant account** (Setup → Payments profile) with the business bank account. Create the app as **Paid**, set the price to **$1.99** in Monetize → Products → App pricing, turn on **Play App Signing** (default), and upload the `.aab` to **Internal testing** first. Install it from the testing link and try it.
6. Fill in the store listing, Data safety, content rating, health declaration and target audience (adults; parents) from `STORE_LISTING.md`, upload `native/store/screenshots/android`, the 512 icon and the 1024×500 feature graphic, then promote the build to **Production**.

## What's already done in the code

- Built with Xcode 26 / iOS 26 SDK (Apple's requirement since April 28, 2026) and targets Android API 36 (Google's requirement since August 31, 2026).
- Apple privacy manifest, permission explanations, export-compliance flag; iPhone-only so no iPad screenshots are needed.
- Android: only the permissions KidArmor uses; records are kept out of Google cloud backups and phone-to-phone transfers (parents use KidArmor's own encrypted backup).
- Signing keys are only loaded in the final signing step, after all packages are installed.
- 21 automated test files (about 200 checks), including a click-every-button test and security tests: `bash tests/run-all.sh`.
