# ChromeLab: put it on your Chromebook (no terminal)

An installed web app has to be served from a real https website. GitHub Pages does that for free, and you can set it up entirely in the browser.

## 1. Host it (about 5 minutes)
1. Unzip `chromelab.zip` in your Files app.
2. Go to github.com, sign in (or make a free account), then click **New repository**.
3. Name it `chromelab`, set it to **Public**, and click **Create repository**.
4. Click **uploading an existing file**. Drag in everything from the unzipped folder: `index.html`, `app.js`, `style.css`, `sw.js`, `manifest.webmanifest`, and the whole `icons` folder. Click **Commit changes**.
5. Go to **Settings → Pages**. Under "Branch", pick `main` and `/ (root)`, then click **Save**.
6. Wait about a minute. Your app will be at `https://YOUR-USERNAME.github.io/chromelab/`.

## 2. Install it
Open that link in Chrome and click the install icon at the right end of the address bar (or ⋮ → **Cast, save and share → Install page as app**). ChromeLab gets its own window, a launcher icon and a spot on the shelf.

## 3. Things to try
- **Files:** Open a file, edit it and press Ctrl+S. It saves straight back to the original.
- **Open with:** In the Files app, right-click a `.txt` file → **Open with → ChromeLab**.
- **Offline:** Turn Wi-Fi off, then open ChromeLab from the launcher. It still runs.
- **Badge:** In the System tab, press +1 a few times and look at the shelf icon.
- **Title bar:** Click the small chevron next to the window's minimize button to switch to ChromeLab's own title bar.
- **Shortcuts:** Right-click the shelf icon to jump straight to a tab.
- **Hardware:** Plug in an Arduino (Serial), a game controller, or any USB device.

## To update it later
Upload the changed files to the same repo. If the app keeps showing the old version, change `chromelab-v1` to `chromelab-v2` in `sw.js` so the offline cache refreshes.

Heads up: a school-managed Chromebook may block installing apps or some device permissions. That's set by the admin.
