// Register this before Firebase Messaging so the SDK does not replace the click handler.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clientsList) {
      if ('focus' in client) {
        await client.focus();
        if ('navigate' in client && client.url !== targetUrl) await client.navigate(targetUrl);
        return;
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(targetUrl);
  })());
});

importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyBGOtawcfRqXTm7jw5P3DB0qhJCUTmfyDc',
  authDomain: 'zulora-drive.firebaseapp.com',
  projectId: 'zulora-drive',
  storageBucket: 'zulora-drive.firebasestorage.app',
  messagingSenderId: '715420173020',
  appId: '1:715420173020:web:46245edda3eb0f31edaa19'
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  // FCM displays notification payloads automatically while the page is in the background.
  // Show a local notification only for data-only payloads to avoid displaying duplicates.
  if (payload.notification) return;

  const title = payload.data?.title || 'Zulora notification';
  const body = payload.data?.body || payload.data?.message || 'You have a new update.';
  return self.registration.showNotification(title, {
    body,
    icon: '/logo.svg',
    badge: '/logo.svg',
    data: { url: payload.data?.url || '/' }
  });
});
