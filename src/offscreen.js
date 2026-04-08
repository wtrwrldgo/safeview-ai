let frameResolverMap = new Map();
let currentId = 0;
let sandboxReady = false;
let messageQueue = [];

window.addEventListener('message', (event) => {
    if (event.data && event.data.type === "sandboxReady") {
        sandboxReady = true;
        const iframe = document.getElementById('sandbox');
        for (const queued of messageQueue) {
            iframe.contentWindow.postMessage(queued, '*');
        }
        messageQueue = [];
        return;
    }
    if (event.data && event.data.type === "analyzeResult") {
        const resolver = frameResolverMap.get(event.data.id);
        if (resolver) {
            frameResolverMap.delete(event.data.id);
            resolver(event.data);
        }
    }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "analyzeFrameOffscreen") {
        const id = ++currentId;
        frameResolverMap.set(id, (result) => {
            sendResponse(result);
        });

        const iframe = document.getElementById('sandbox');
        if (!iframe) {
            sendResponse({ error: "Sandbox iframe not found" });
            return true;
        }

        const msgData = {
            type: "analyzeFrameOffscreen",
            id: id,
            imageBase64: message.imageBase64
        };

        if (sandboxReady) {
            iframe.contentWindow.postMessage(msgData, '*');
        } else {
            messageQueue.push(msgData);
        }

        return true; // async
    }
});
