import React, { useState, useEffect, useRef } from 'react';
import socketIOClient from 'socket.io-client';
import './App.css';

const socket = socketIOClient('http://localhost:5000');

function App() {
    const [message, setMessage] = useState('');
    const [messages, setMessages] = useState([]);
    const [username, setUsername] = useState('');
    const [hasUsername, setHasUsername] = useState(false);
    const [inCall, setInCall] = useState(false);
    const localVideoRef = useRef(null);
    const remoteVideoRef = useRef(null);
    const peerConnectionRef = useRef(null);

    useEffect(() => {
        socket.on('receiveMessage', (message) => {
            setMessages((prevMessages) => [message, ...prevMessages ]);
        });

        socket.on('userJoined', async (userId) => {
            if (peerConnectionRef.current) {
                const offer = await peerConnectionRef.current.createOffer();
                await peerConnectionRef.current.setLocalDescription(offer);
                socket.emit('offer', { offer, roomId: 'default' });
            }
        });

        socket.on('offer', async (data) => {
            if (!peerConnectionRef.current) {
                await startCall();
            }
            await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.offer));
            const answer = await peerConnectionRef.current.createAnswer();
            await peerConnectionRef.current.setLocalDescription(answer);
            socket.emit('answer', { answer, roomId: 'default' });
        });

        socket.on('answer', async (data) => {
            await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
        });

        socket.on('candidate', async (data) => {
            try {
                await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
            } catch (e) {
                console.error('Error adding received ice candidate', e);
            }
        });

        return () => {
            socket.off('receiveMessage');
            socket.off('userJoined');
            socket.off('offer');
            socket.off('answer');
            socket.off('candidate');
        };
    }, []);

    const sendMessage = (e) => {
        e.preventDefault();
        if (message.trim() && username.trim()) {
            const messageObject = {
                text: message,
                user: username,
                timestamp: new Date().toLocaleTimeString(),
            };
            socket.emit('sendMessage', messageObject);
            setMessage('');
        }
    };

    const setUser = (e) => {
        e.preventDefault();
        if (username.trim()) {
            setHasUsername(true);
        }
    };

    const startCall = async () => {
        setInCall(true);
        const localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideoRef.current.srcObject = localStream;

        peerConnectionRef.current = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' }
            ]
        });

        localStream.getTracks().forEach(track => {
            peerConnectionRef.current.addTrack(track, localStream);
        });

        peerConnectionRef.current.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('candidate', { candidate: event.candidate, roomId: 'default' });
            }
        };

        peerConnectionRef.current.ontrack = (event) => {
            if (remoteVideoRef.current) {
                remoteVideoRef.current.srcObject = event.streams[0];
            }
        };

        socket.emit('joinRoom', 'default');
    };

    const stopCall = () => {
        setInCall(false);
        if (peerConnectionRef.current) {
            peerConnectionRef.current.close();
            peerConnectionRef.current = null;
        }
        if (localVideoRef.current && localVideoRef.current.srcObject) {
            localVideoRef.current.srcObject.getTracks().forEach(track => track.stop());
            localVideoRef.current.srcObject = null;
        }
        if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = null;
        }
        socket.emit('leaveRoom', 'default');
    };

    const leaveChat = () => {
        setHasUsername(false);
        setMessages([]);
        setUsername('');
        if (inCall) {
            stopCall();
        }
    };

    return (
        <div className="App">
            {!hasUsername ? (
                <form className="username-container" onSubmit={setUser}>
                    <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="Enter your username"
                    />
                    <button type="submit">Join Chat</button>
                </form>
            ) : (
                <div className="main-container">
                    <div className="video-container">
                        <video ref={remoteVideoRef} autoPlay className="remote-video"></video>
                        <video ref={localVideoRef} autoPlay muted className="local-video"></video>
                    </div>
                    <div className="chat-container">
                        <div className="messages">
                            {messages.map((msg, index) => (
                                <div key={index} className={`message ${msg.user === username ? 'my-message' : 'other-message'}`}>
                                    <strong>{msg.user}</strong>: {msg.text} <span className="timestamp">{msg.timestamp}</span>
                                </div>
                            ))}
                        </div>
                        <form className="input-container" onSubmit={sendMessage}>
                            <input
                                type="text"
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                placeholder="Type a message..."
                            />
                            <button type="submit">Send</button>
                        </form>
                        <div className="call-buttons">
                            <button onClick={startCall} disabled={inCall}>
                                {inCall ? 'In Call' : 'Start Video Call'}
                            </button>
                            {inCall && (
                                <button onClick={stopCall}>
                                    Stop Video Call
                                </button>
                            )}
                        </div>
                        <button onClick={leaveChat} className="leave-chat">
                            Leave Chat
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default App;
