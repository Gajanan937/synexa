const socket = io();
let peer;
let roomCode;
let connectedPeers = {};
let myUserInfo = {};

const senderBtn = document.getElementById('sender-btn');
const receiverBtn = document.getElementById('receiver-btn');
const roleSelection = document.getElementById('role-selection');
const senderUi = document.getElementById('sender-ui');
const receiverUi = document.getElementById('receiver-ui');
const roomCodeDisplay = document.getElementById('room-code');
const deviceCountDisplay = document.getElementById('device-count');
const peersContainer = document.getElementById('peers-container');
const peerListDiv = document.getElementById('peer-list');

const recName = document.getElementById('rec-name');
const joinCodeInput = document.getElementById('join-code-input');
const joinBtn = document.getElementById('join-btn');

const uploadQrBtn = document.getElementById('upload-qr-btn');
const qrFileInput = document.getElementById('qr-file-input');
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const statusBox = document.getElementById('status-box');
const statusText = document.getElementById('status-text');
const progressBar = document.getElementById('progress-bar');
const speedInfo = document.getElementById('speed-info');
const leaveBtn = document.getElementById('leave-btn');

const peerConfig = { host: window.location.hostname, port: 3000, path: '/peerjs' };

let startTime;
let incomingFileInfo = {};
let receiveBuffer = [];
let receivedSize = 0;

function updateSpeed(processedBytes, totalBytes) {
    const timeElapsed = (Date.now() - startTime) / 1000;
    const speedBps = processedBytes / timeElapsed;
    const speedMBps = (speedBps / (1024 * 1024)).toFixed(2);
    const remainingBytes = totalBytes - processedBytes;
    const timeLeft = speedBps > 0 ? Math.round(remainingBytes / speedBps) : 0;
    const percentage = Math.round((processedBytes / totalBytes) * 100);

    progressBar.style.width = percentage + "%";
    progressBar.innerText = percentage + "%";
    speedInfo.classList.remove('hidden');
    speedInfo.innerText = `🚀 Speed: ${speedMBps} MB/s | ⏳ Time Left: ${timeLeft}s`;
}

// Auto-detect room from URL query parameters (QR Scan link)
window.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const autoRoom = urlParams.get('room');

    if (autoRoom) {
        roleSelection.classList.add('hidden');
        receiverUi.classList.remove('hidden');
        joinCodeInput.value = autoRoom;
        statusBox.classList.remove('hidden');
        statusText.innerText = `QR Scanned! Room ${autoRoom} detected. Apna naam daal kar Join karein.`;
        leaveBtn.classList.remove('hidden');
    }
});

senderBtn.addEventListener('click', () => {
    roleSelection.classList.add('hidden');
    senderUi.classList.remove('hidden');
    statusBox.classList.remove('hidden');
    statusText.innerText = "Room created! Waiting for devices to join...";
    leaveBtn.classList.remove('hidden');

    roomCode = Math.floor(1000 + Math.random() * 9000).toString();
    roomCodeDisplay.innerText = roomCode;
    socket.emit('create-room', roomCode);

    const joinUrl = window.location.href.split('?')[0] + "?room=" + roomCode;
    document.getElementById("qrcode").innerHTML = "";
    new QRCode(document.getElementById("qrcode"), { text: joinUrl, width: 160, height: 160 });

    peer = new Peer('sender-' + roomCode, peerConfig);

    peer.on('connection', (conn) => {
        conn.on('data', (data) => {
            if (data.type === 'metadata') {
                connectedPeers[conn.peer] = { conn, info: data.userInfo, socketId: data.socketId };
                renderPeerList();
            }
        });
    });

    socket.on('peer-joined', (data) => {
        showActivityLog(`🟢 ${data.userInfo.name} joined the room!`);
    });

    socket.on('peer-left', (data) => {
        showActivityLog(`🔴 ${data.name} left the room.`);
        Object.keys(connectedPeers).forEach(key => {
            if (connectedPeers[key].socketId === data.socketId) {
                delete connectedPeers[key];
            }
        });
        renderPeerList();
    });
});

function showActivityLog(msg) {
    statusBox.classList.remove('hidden');
    statusText.innerText = msg;
    leaveBtn.classList.remove('hidden');
    setTimeout(() => {
        if (statusText.innerText === msg) {
            statusText.innerText = "Ready for transfer...";
        }
    }, 4000);
}

receiverBtn.addEventListener('click', () => {
    roleSelection.classList.add('hidden');
    receiverUi.classList.remove('hidden');
    statusBox.classList.remove('hidden');
    statusText.innerText = "Please enter your details to join.";
    leaveBtn.classList.remove('hidden');
});

function validateAndJoin(code) {
    if (!recName.value.trim()) {
        alert("Please enter your name!");
        recName.focus();
        return;
    }
    myUserInfo = { name: recName.value.trim() };
    roomCode = code;
    socket.emit('join-room', { roomId: roomCode, userInfo: myUserInfo });
}

joinBtn.addEventListener('click', () => {
    const code = joinCodeInput.value.trim();
    if (code.length === 4) validateAndJoin(code);
    else alert("Enter valid 4-digit room code!");
});

uploadQrBtn.addEventListener('click', () => {
    const name = recName.value.trim();
    if (!name) {
        alert("Pehle apna naam enter box mein likho, phir QR upload karo!");
        recName.focus();
        return;
    }
    qrFileInput.click();
});

qrFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const name = recName.value.trim();
    if (!name) {
        alert("Pehle apna naam enter karo!");
        return;
    }

    const reader = new FileReader();
    reader.onload = function (event) {
        const img = new Image();
        img.onload = function () {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);

            const codeData = jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);

            if (codeData) {
                try {
                    const url = new URL(codeData.data);
                    const extRoom = url.searchParams.get('room');
                    if (extRoom) {
                        myUserInfo = { name: name };
                        roomCode = extRoom;
                        receiverUi.classList.add('hidden');
                        statusBox.classList.remove('hidden');
                        statusText.innerText = `QR Scanned! Joining Room ${roomCode}... ⏳`;
                        leaveBtn.classList.remove('hidden');
                        socket.emit('join-room', { roomId: roomCode, userInfo: myUserInfo });
                    } else {
                        alert("Invalid QR code! Sahi SYNEXA QR image select karein.");
                    }
                } catch (err) {
                    alert("QR link read nahi ho payi!");
                }
            } else {
                alert("QR Code detect nahi hua! Saaf image select karein.");
            }
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
});

socket.on('room-joined-success', (roomId) => {
    receiverUi.classList.add('hidden');
    statusBox.classList.remove('hidden');
    statusText.innerText = "Joined Room! Connected & waiting for files... 🟢";
    leaveBtn.classList.remove('hidden');

    peer = new Peer(peerConfig);
    peer.on('open', (id) => {
        const conn = peer.connect('sender-' + roomId);

        conn.on('open', () => {
            statusText.innerText = "Connected! Waiting for files... 🟢";
            leaveBtn.classList.remove('hidden');
            conn.send({ type: 'metadata', userInfo: myUserInfo, socketId: socket.id });
        });

        conn.on('data', (data) => {
            if (data.type === 'header') {
                incomingFileInfo = { filename: data.filename, size: data.size };
                receiveBuffer = []; receivedSize = 0; startTime = Date.now();
                statusText.innerText = `Receiving: ${data.filename} 🚀`;
            } else if (data.type === 'chunk') {
                receiveBuffer.push(data.data);
                receivedSize += data.data.byteLength;
                updateSpeed(receivedSize, incomingFileInfo.size);
            } else if (data.type === 'eof') {
                statusText.innerText = "File Received! Saving... ⬇️";
                speedInfo.innerText = "Transfer Complete! 🎉";
                const blob = new Blob(receiveBuffer);
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = incomingFileInfo.filename; a.click();
            }
        });
    });
});

// Leave Room button functionality
leaveBtn.addEventListener('click', () => {
    window.location.href = window.location.pathname; // Reloads and clears all room/peer sessions cleanly
});

function renderPeerList() {
    peerListDiv.innerHTML = "";
    const peerIds = Object.keys(connectedPeers);
    deviceCountDisplay.innerText = peerIds.length;

    if (peerIds.length > 0) {
        peersContainer.classList.remove('hidden');
        dropZone.classList.remove('hidden');
    } else {
        peersContainer.classList.add('hidden');
    }

    peerIds.forEach(id => {
        const peerObj = connectedPeers[id];
        const div = document.createElement('div');
        div.className = 'peer-card';
        div.innerHTML = `
            <label>
                <input type="checkbox" class="peer-checkbox" value="${id}" checked>
                <strong>${peerObj.info.name}</strong>
            </label>
        `;
        peerListDiv.appendChild(div);
    });
}

dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    const checkboxes = document.querySelectorAll('.peer-checkbox:checked');

    if (!file || checkboxes.length === 0) {
        alert("Please select a file and at least one receiver!");
        return;
    }

    statusBox.classList.remove('hidden');
    statusText.innerText = `Sending to ${checkboxes.length} device(s)... 🚀`;
    const chunkSize = 128 * 1024;
    startTime = Date.now();

    checkboxes.forEach(cb => {
        const peerId = cb.value;
        const conn = connectedPeers[peerId].conn;
        let offset = 0;

        conn.send({ type: 'header', filename: file.name, size: file.size });

        const readSlice = (o) => {
            const slice = file.slice(o, o + chunkSize);
            const reader = new FileReader();
            reader.onload = (event) => {
                conn.send({ type: 'chunk', data: event.target.result });
                offset += event.target.result.byteLength;
                updateSpeed(offset, file.size);
                if (offset < file.size) {
                    setTimeout(() => readSlice(offset), 0);
                } else {
                    conn.send({ type: 'eof' });
                    statusText.innerText = "Files sent successfully! ✅";
                }
            };
            reader.readAsArrayBuffer(slice);
        };
        readSlice(0);
    });
});