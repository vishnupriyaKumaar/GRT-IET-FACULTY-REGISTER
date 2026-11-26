
# Make the Faculty Register work on every phone and computer (Firebase – one-time setup, free)

Every teacher, semester record, NPTEL certificate and the admin password is saved permanently in your
**Firebase Firestore** database. The web app on **Vercel** talks to it through a small secure server function,
so any phone or computer that opens the link sees the same data, updated automatically within a few seconds.
No Firebase key is ever placed inside the app's public code, so the data stays private.

> Why Firestore and not "Firebase Storage"? Firestore is Firebase's free permanent database (Spark plan, no card).
> Storage buckets now need the paid Blaze plan, and are not needed: certificates are kept in Firestore in small pieces.

## 1. Create the Firestore database
1. https://console.firebase.google.com → open your Firebase project (or **Add project**, e.g. `grt-faculty`).
2. Left menu **Build → Firestore Database → Create database** → *Production mode* → location nearest you (e.g. `asia-south1` Mumbai) → **Enable**.
   (Rules can stay "deny all" – only the app's server uses the database, with the secret key below.)

## 2. Get the secret key (service account)
1. ⚙ **Project settings → Service accounts → Generate new private key → Generate key**. A `.json` file downloads.
2. Keep it private. Never upload it to GitHub or show it to anyone.
3. Turn it into one line of text (easiest): open the file, select everything, copy.
   (Optional: paste it at https://www.base64encode.org and use the encoded text instead – both work.)

## 3. Give the key to Vercel
Vercel → your project → **Settings → Environment Variables** → add

| Name | Value |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | the whole contents of the .json file (or its base64 text) |

Tick Production, Preview, Development → **Save**.

## 4. Deploy this version
Windows: double-click `DEPLOY.bat` · Mac/Linux: `bash deploy-vercel.sh` · or `npm install` then `npm run deploy`.
Open your link: the first screen must **not** show the red "database is not connected" message.

## 5. Check on two devices
1. PC → **Admin Login** (password `grtcse@1234`) → **Change Password** to set your own.
2. Phone → same link → **Teacher Access** → add a teacher (try **📎 Upload File**) → **Save**.
3. Within a few seconds the teacher appears on the PC under **Search** (no refresh needed).

Old browser-only data: in the old app ⚙ → *Download backup*; in the new app (Admin) ⚙ → *Restore from a backup file*.

## Good to know
* **Free limits (Spark):** 1 GiB stored, 50,000 reads and 20,000 writes per day. While an Admin has the app open it checks a tiny change counter every few seconds (1 read each), and downloads data only when something changed, so a few admins are fine. Certificates (≤ 5 MB each) use the most space.
* **Teacher Access has no password** (as you asked): anyone with the link can add a teacher, and typing an existing teacher's full name loads and lets them re-save that teacher's semester data. They can never open Search, Update, Relieved, Excel, backup or delete.
* **Forgot the admin password:** Firebase console → Firestore → `settings` → delete the document `pwhash`. The password becomes `grtcse@1234` again.
* **Test on your PC without Firebase:** `npm install`, `npm run dev` uses a local test file (`.data/db.json`); nothing goes online.
* Saving and loading need internet now, because the data is shared online.
