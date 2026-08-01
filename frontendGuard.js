// Deters casual right-click "Inspect"/"View source" access and the most
// common devtools keyboard shortcuts.
//
// This is a deterrent only, not real security -- it cannot be. Any
// browser that renders this page has already downloaded the full
// HTML/CSS/JS; devtools can still be opened from the browser's own menu
// (not just these shortcuts), as a separate detached window, or by
// disabling JavaScript entirely before this file even runs. Nothing
// that runs *in* the browser can change that. This exists purely to
// raise the bar for casual right-click curiosity -- never rely on it to
// protect anything that actually needs to stay secret. Secrets belong
// server-side, behind RLS, same as everything else in this app already
// is.

document.addEventListener('contextmenu', event => event.preventDefault());

document.addEventListener('keydown', event => {
  const key = event.key;
  const devtoolsCombo = (event.ctrlKey || event.metaKey) && event.shiftKey && ['I', 'i', 'J', 'j', 'C', 'c'].includes(key);
  const viewSourceCombo = (event.ctrlKey || event.metaKey) && ['U', 'u'].includes(key);
  if (key === 'F12' || devtoolsCombo || viewSourceCombo) {
    event.preventDefault();
  }
});
