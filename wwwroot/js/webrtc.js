////const client = io("http://localhost:3000/");    // Edit to your web socket server url
const client = io("https://ictrobot.hknu.ac.kr:8089/");    // Edit to your web socket server url

const roomName = "test";        // Socket.io Room Name

let myRtcpConnection = null;    // RTCP Connection


function ConnectClient() {
    client.connect();   // Socket manual connection

    makeConnection();   // Make RTCP Connection

    client.emit("join_room", roomName);
}


function makeConnection() {
    myRtcpConnection = new RTCPeerConnection({
        iceServers: [
            {
                urls: [
                    "stun:stun.l.google.com:19302",
                    "stun:stun1.l.google.com:19302",
                    "stun:stun2.l.google.com:19302",
                    "stun:stun3.l.google.com:19302",
                    "stun:stun4.l.google.com:19302",
                ],
            },
        ],
    });

    myRtcpConnection.addEventListener("icecandidate", handleIce);

    myRtcpConnection.addEventListener("addstream", handleAddStream);
    // 위 앱은 Stream을 받기만 하므로 track에 stream을 추가할 필요 없음
//  myStream
//      .getTracks()
//      .forEach((track) => myRtcpConnection.addTrack(track, myStream));
}


function handleIce(data) {
    console.log("sent candidate");
    
    client.emit("ice", data.candidate, roomName);
}


function handleAddStream(data) {
    const myRtcpStream = document.getElementById("myRtcpStream");
    myRtcpStream.srcObject = data.stream;
}

client.on("welcome", async () => {
    console.log("someone joined");

    const offer = await myRtcpConnection.createOffer();
    myRtcpConnection.setLocalDescription(offer);

    client.emit("offer", offer, roomName);
    console.log("sent the offer");
});

client.on("offer", async (offer) => {
    console.log("received the offer");

    myRtcpConnection.setRemoteDescription(offer);

    const answer = await myRtcpConnection.createAnswer();
    myRtcpConnection.setLocalDescription(answer);

    client.emit("answer", answer, roomName);
    console.log("sent the answer");
});

client.on("answer", (answer) => {
    myRtcpConnection.setRemoteDescription(answer);
    console.log("received the answer");
});

client.on("ice", (ice) => {
    myRtcpConnection.addIceCandidate(ice);
    console.log("received candidate");
});