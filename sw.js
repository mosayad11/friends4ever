
const CACHE_NAME = "friends4ever-shell-v5";

const APP_FILES = [
    "./",
    "./index.html",
    "./login.html",
    "./setup-profile.html",
    "./publisher.html",

    // CSS
    "./css/style.css",

    // JavaScript
    "./js/main.js",
    "./js/firebase.js",
    "./js/auth.js",
    "./js/login.js",
    "./js/profile.js",
    "./js/setup-profile.js",
    "./js/sounds.js",

    // PWA
    "./manifest.json",
    "./sw.js",

    // Sounds
    "./sound/click.wav",
    "./sound/recieve_msg.wav",
    "./sound/send_msg.wav",
    "./sound/hover.mp3",

    // Images
    "./images/icons/logo.png"
];

// Install the new version
self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(APP_FILES))
            .then(() => self.skipWaiting())
    );
});

// Activate the new version and remove old app caches
self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) =>
                Promise.all(
                    keys
                        .filter((key) =>
                            key.startsWith("friends4ever-shell-") &&
                            key !== CACHE_NAME
                        )
                        .map((key) => caches.delete(key))
                )
            )
            .then(() => self.clients.claim())
    );
});

// Keep app requests fresh and use cached files when offline
self.addEventListener("fetch", (event) => {
    const request = event.request;

    if (request.method !== "GET") return;

    const url = new URL(request.url);

    if (url.origin !== self.location.origin) return;

    event.respondWith(
        fetch(request)
            .then((response) => {
                if (response.ok) {
                    const copy = response.clone();

                    caches.open(CACHE_NAME)
                        .then((cache) => cache.put(request, copy))
                        .catch(() => {});

                }

                return response;
            })
            .catch(async () => {
                const cached = await caches.match(request);

                if (cached) return cached;

                if (request.mode === "navigate") {
                    const home = await caches.match("./index.html");
                    if (home) return home;
                }

                return new Response("You are offline.", {
                    status: 503,
                    statusText: "Offline"
                });
            })
    );
});
