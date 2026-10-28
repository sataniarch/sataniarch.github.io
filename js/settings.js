import { $, $$ } from './util.js';
import { store } from './store.js';
import { toast } from './ui.js';
import { pwa } from './pwa.js';

export function applyCalm() {
  document.documentElement.classList.toggle('calm', !!store.pref('calm'));
}

export function applyPlayback() {
  document.documentElement.dataset.mode = store.pref('mode');
}

export function initSettings() {
  const dialog = $('#settings');
  const installField = $('#installField');
  const installBtn = $('#installBtn');
  const installHint = $('#installHint');

  const sourceField = $('#sourceField');
  const sourceHint = $('#sourceHint');
  const sourceHintText = sourceHint.textContent;

  const sync = () => {
    const audio = store.pref('mode') === 'audio';
    $$('input[name="mode"]', dialog).forEach((r) => (r.checked = r.value === store.pref('mode')));
    $$('input[name="source"]', dialog).forEach((r) => (r.checked = r.value === store.pref('source')));
    sourceField.disabled = audio;
    sourceHint.textContent = audio ? 'Applies to video only. Set Playback to Video to change it.' : sourceHintText;
    $$('input[name="after"]', dialog).forEach((r) => (r.checked = r.value === store.pref('after')));
    $('input[name="calm"]', dialog).checked = !!store.pref('calm');
    syncInstall();
  };

  const syncInstall = () => {
    if (pwa.isStandalone) {
      installField.hidden = true;
      return;
    }
    if (pwa.canPrompt) {
      installField.hidden = false;
      installBtn.hidden = false;
      installHint.textContent = 'Opens from your home screen like an app, with no browser bars.';
    } else if (pwa.isIOS) {
      installField.hidden = false;
      installBtn.hidden = true;
      installHint.textContent = 'To install on iPhone or iPad, tap Share in Safari, then Add to Home Screen.';
    } else {
      installField.hidden = true;
    }
  };

  $('#openSettings').addEventListener('click', () => {
    sync();
    dialog.showModal();
  });

  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });

  dialog.addEventListener('change', (e) => {
    const t = e.target;
    if (t.name === 'mode') store.setPref('mode', t.value);
    if (t.name === 'source') store.setPref('source', t.value);
    if (t.name === 'after') store.setPref('after', t.value);
    if (t.name === 'calm') {
      store.setPref('calm', t.checked);
      applyCalm();
    }
  });

  store.on((what) => {
    if (what === 'prefs' && dialog.open) sync();
  });

  installBtn.addEventListener('click', () => pwa.prompt());
  pwa.onChange(syncInstall);

  $('#clearData').addEventListener('click', () => {
    if (window.confirm('Remove all favorites, history and saved positions from this device?')) {
      store.clearAll();
      toast('Saved data cleared');
    }
  });
}
