/**
 * AccessBridge — Background Service Worker (Manifest V3)
 * Orchestrates multimodal Gemini captioning, badge instrumentation,
 * global extension persistence, and native text-to-speech reading.
 */

// Initialize default storage on install
chrome.runtime.onInstalled.addListener(async (details) => {
  const defaults = {
    extensionEnabled: true,
    pausedDomains: [],
    geminiApiKey: '',
    geminiModel: 'gemini-2.0-flash',
    highlightRepairs: false,
    remediateAria: true,
    remediateFocus: true,
    remediateLayout: true
  };

  const stored = await chrome.storage.sync.get(Object.keys(defaults));
  const toSet = {};
  for (const [key, val] of Object.entries(defaults)) {
    if (stored[key] === undefined) {
      toSet[key] = val;
    }
  }
  if (Object.keys(toSet).length > 0) {
    await chrome.storage.sync.set(toSet);
  }

  // Set default badge appearance
  if (chrome.action && chrome.action.setBadgeBackgroundColor) {
    chrome.action.setBadgeBackgroundColor({ color: '#0B5FFF' });
  }
});

// Central message dispatcher
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return false;

  switch (message.type) {
    case 'CALL_GEMINI_VISION':
      handleGeminiVision(message.payload)
        .then(res => sendResponse(res))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true; // Keep channel open for async response

    case 'TEST_GEMINI_KEY':
      testGeminiKey(message.payload?.apiKey, message.payload?.model)
        .then(res => sendResponse(res))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'UPDATE_BADGE':
      handleBadgeUpdate(sender?.tab?.id, message.payload);
      sendResponse({ success: true });
      return false;

    case 'START_TTS':
      handleStartTTS(message.payload)
        .then(res => sendResponse(res))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'STOP_TTS':
      handleStopTTS();
      sendResponse({ success: true });
      return false;

    case 'GET_TTS_STATUS':
      handleGetTTSStatus().then(res => sendResponse(res));
      return true;

    case 'OPEN_TAB':
      if (message.payload?.url) {
        chrome.tabs.create({ url: message.payload.url });
        sendResponse({ success: true });
      }
      return false;

    default:
      return false;
  }
});

// Tab update listener to maintain badge accuracy across tab navigations
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && !tab.url.startsWith('chrome://')) {
    chrome.storage.sync.get(['extensionEnabled', 'pausedDomains'], (data) => {
      const globallyEnabled = data.extensionEnabled !== false;
      let isPaused = false;
      try {
        const domain = new URL(tab.url).hostname;
        const pausedList = Array.isArray(data.pausedDomains) ? data.pausedDomains : [];
        isPaused = pausedList.includes(domain);
      } catch (_) {}

      if (!globallyEnabled || isPaused) {
        handleBadgeUpdate(tabId, { active: false, totalFixed: 0 });
      }
    });
  }
});

/**
 * Updates extension action badge for a tab
 */
function handleBadgeUpdate(tabId, payload) {
  if (!tabId || !chrome.action) return;

  const { active, totalFixed } = payload || {};
  if (active && totalFixed > 0) {
    chrome.action.setBadgeText({ tabId, text: String(totalFixed > 99 ? '99+' : totalFixed) });
    chrome.action.setBadgeBackgroundColor({ tabId, color: '#0B5FFF' });
    chrome.action.setTitle({ tabId, title: `AccessBridge: ${totalFixed} problems fixed (On)` });
  } else if (active) {
    chrome.action.setBadgeText({ tabId, text: '✓' });
    chrome.action.setBadgeBackgroundColor({ tabId, color: '#0B5FFF' });
    chrome.action.setTitle({ tabId, title: 'AccessBridge: On' });
  } else {
    chrome.action.setBadgeText({ tabId, text: 'OFF' });
    chrome.action.setBadgeBackgroundColor({ tabId, color: '#C2410C' });
    chrome.action.setTitle({ tabId, title: 'AccessBridge: Off' });
  }
}

/**
 * Starts native Chrome Text-to-Speech reading
 */
async function handleStartTTS(payload) {
  const text = payload?.text?.trim();
  if (!text) {
    return { success: false, error: 'NO_TEXT' };
  }

  if (!chrome.tts) {
    return { success: false, error: 'TTS_API_UNAVAILABLE' };
  }

  // Stop any ongoing speech first
  chrome.tts.stop();

  return new Promise((resolve) => {
    chrome.tts.speak(text, {
      rate: payload.rate || 1.0,
      pitch: 1.0,
      lang: 'en-US',
      onEvent: (event) => {
        if (event.type === 'error') {
          console.warn('TTS error event:', event.errorMessage);
        }
      }
    }, () => {
      if (chrome.runtime.lastError) {
        resolve({ success: false, error: chrome.runtime.lastError.message });
      } else {
        resolve({ success: true, speaking: true });
      }
    });
  });
}

/**
 * Stops ongoing Chrome Text-to-Speech
 */
function handleStopTTS() {
  if (chrome.tts) {
    chrome.tts.stop();
  }
}

/**
 * Checks if Text-to-Speech is currently speaking
 */
function handleGetTTSStatus() {
  return new Promise((resolve) => {
    if (!chrome.tts) {
      resolve({ isSpeaking: false });
      return;
    }
    chrome.tts.isSpeaking((speaking) => {
      resolve({ isSpeaking: Boolean(speaking) });
    });
  });
}

/**
 * Validates a Gemini API Key via a minimal text ping
 */
async function testGeminiKey(apiKey, modelName) {
  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
    return { success: false, error: 'No API key provided.' };
  }

  const model = modelName || 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey.trim())}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: 'Respond with the single word: "READY".' }]
        }],
        generationConfig: {
          maxOutputTokens: 10,
          temperature: 0.1
        }
      })
    });

    if (!response.ok) {
      const errorJson = await response.json().catch(() => ({}));
      const msg = errorJson.error?.message || `HTTP ${response.status} ${response.statusText}`;
      return { success: false, error: msg };
    }

    const data = await response.json();
    const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    return { success: true, model, sample: candidateText };
  } catch (err) {
    return { success: false, error: `Connection failed: ${err.message}` };
  }
}

/**
 * Calls Gemini Vision to generate concise, WCAG-compliant alt text for an image
 */
async function handleGeminiVision({ imageUrl, imageBase64, mimeType, contextHint }) {
  const syncData = await chrome.storage.sync.get(['geminiApiKey', 'geminiModel']);
  const apiKey = syncData.geminiApiKey?.trim();
  const model = syncData.geminiModel || 'gemini-2.0-flash';

  if (!apiKey) {
    return { success: false, error: 'NO_KEY_CONFIGURED' };
  }

  const prompt = [
    'You are an elite accessibility engineer generating WCAG 2.2 AA compliant alternative text for a screen reader user.',
    'Write a concise, objective description under 100 characters.',
    'Do NOT use phrases like "image of", "picture of", or "graphic showing".',
    'Focus on the primary subject, intent, or action.',
    contextHint ? `Context hint from webpage: "${contextHint}".` : ''
  ].filter(Boolean).join(' ');

  try {
    let parts = [];

    if (imageBase64) {
      // Inlined base64 data
      const cleanBase64 = imageBase64.replace(/^data:[^;]+;base64,/, '');
      parts = [
        {
          inlineData: {
            mimeType: mimeType || 'image/jpeg',
            data: cleanBase64
          }
        },
        { text: prompt }
      ];
    } else if (imageUrl && !imageUrl.startsWith('blob:') && !imageUrl.startsWith('data:')) {
      // Try to fetch image buffer in service worker
      const imgRes = await fetch(imageUrl, { mode: 'cors' }).catch(() => null);
      if (imgRes && imgRes.ok) {
        const arrayBuf = await imgRes.arrayBuffer();
        const base64 = btoa(
          new Uint8Array(arrayBuf).reduce((data, byte) => data + String.fromCharCode(byte), '')
        );
        const resolvedMime = imgRes.headers.get('content-type') || 'image/jpeg';
        parts = [
          {
            inlineData: {
              mimeType: resolvedMime.split(';')[0],
              data: base64
            }
          },
          { text: prompt }
        ];
      } else {
        // Fallback to text prompt with URL / context
        parts = [{ text: `${prompt} The image is referenced at URL: ${imageUrl}` }];
      }
    } else {
      return { success: false, error: 'INVALID_IMAGE_PAYLOAD' };
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          maxOutputTokens: 60,
          temperature: 0.2
        }
      })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      return { success: false, error: errData.error?.message || `HTTP ${response.status}` };
    }

    const data = await response.json();
    let text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';

    // Strip surrounding quotes or redundant "image of" prefixes if any leaked through
    text = text.replace(/^["']|["']$/g, '');
    text = text.replace(/^(image|photo|graphic|picture|icon) of\s+/i, '');

    return {
      success: true,
      altText: text,
      source: 'gemini',
      model
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
