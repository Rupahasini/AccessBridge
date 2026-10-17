# AccessBridge

> **Automatic web accessibility that works on any website.**
> AccessBridge makes websites easier to use by fixing missing button names, keyboard controls, and enlarged text.

---

## 🌟 How AccessBridge Works

* **On by default**: Works automatically on every website you visit.
* **Stays on**: Never turns off when you switch tabs, click links, or return to Chrome.
* **Plain and simple**: No technical jargon, no complicated dashboards.
* **100% private**: All fixes happen directly on your device. Passwords and payment details are never read or sent anywhere.
* **Optional advanced settings**: Works completely without any API keys or extra setup.

---

## 🚀 Installation

1. Open Google Chrome (or any Chromium browser: Brave, Edge, Arc, Opera).
2. Go to:
   ```text
   chrome://extensions/
   ```
3. Turn on **Developer mode** in the top-right corner.
4. Click **Load unpacked** in the top-left corner.
5. Select the `AccessBridge` folder.
6. Click the puzzle icon in your toolbar and pin **AccessBridge**.

---

## 🕹️ Simple Controls

Click the **AccessBridge** icon in your toolbar:

1. **Main Switch**:
   - One large switch: **AccessBridge is ON for this site** / **AccessBridge is OFF for this site**.
   - Lets you turn AccessBridge on or off for the website you are currently visiting.

2. **Fixes on this page**:
   - Shows **Fixed N problems on this page** (or **Nothing to fix on this page**).
   - Lists up to three clear lines when fixes are made:
     - *Added names to N buttons and images*
     - *Made N items usable with the keyboard*
     - *Fixed N areas that cut off enlarged text*

3. **Highlight fixes**:
   - Turn on to outline what AccessBridge changed on the page.

4. **More settings**:
   - Opens the settings page to choose what fixes you want or manage websites where AccessBridge is turned off.

---

## ⚙️ Settings

Right-click the icon and choose **Options**, or click **More settings** in the popup:

* **What AccessBridge fixes**: Three simple checkboxes to turn specific fixes on or off.
* **Sites where AccessBridge is off**: List and manage any websites where you prefer AccessBridge to stay off.
* **Advanced (optional)**: Collapsed by default. Contains optional key settings—not needed for normal use.

---

## 📂 File Structure

```text
AccessBridge/
├── manifest.json                        # Extension configuration
├── README.md                            # Documentation and guide
├── background/
│   └── service-worker.js                # Background worker & storage sync
├── content/
│   ├── core-engine.js                   # Fix engine & live page updates
│   ├── content.css                      # Accessible focus rings & skip links
│   └── modules/
│       ├── semantic-aria-fixer.js       # Adds missing names to buttons & images
│       ├── focus-tree-rebuilder.js      # Restores keyboard controls & skip links
│       ├── layout-elasticizer.js        # Prevents text cutoff when zoomed
│       └── visual-highlighter.js        # Outlines changed elements when requested
├── popup/
│   ├── popup.html                       # Simple, plain-language popup interface
│   ├── popup.css                        # High-contrast accessible styling (min 16px font)
│   └── popup.js                         # Site switch & fix summary logic
├── options/
│   ├── options.html                     # Clean settings page with plain language
│   ├── options.css                      # Accessible options styling (min 16px font)
│   └── options.js                       # Settings save and load logic
└── icons/
    ├── icon16.png
    ├── icon32.png
    ├── icon48.png
    └── icon128.png
```
