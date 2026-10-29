import { createContext, useContext, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

const SocketContext = createContext(null);

const getSocketURL = () => {
    if (import.meta.env.VITE_SOCKET_URL) return import.meta.env.VITE_SOCKET_URL;
    const hostname = window.location.hostname;
    if (hostname === "localhost" || hostname === "127.0.0.1") return "http://localhost:5000";
    if (hostname.includes("devtunnels.ms")) {
        return window.location.origin.replace("-5173", "-5000");
    }
    return window.location.origin;
};

const SOCKET_URL = getSocketURL();

export function SocketProvider({ children }) {
    const socketRef = useRef(null);
    const [connected, setConnected] = useState(false);

    useEffect(() => {
        // Create socket connection
        socketRef.current = io(SOCKET_URL);

        socketRef.current.on("connect", () => {
            console.log("[Socket.io] Connected:", socketRef.current.id);
            setConnected(true);
        });

        socketRef.current.on("disconnect", () => {
            console.log("[Socket.io] Disconnected");
            setConnected(false);
        });

        // Cleanup on unmount
        return () => {
            if (socketRef.current) {
                socketRef.current.disconnect();
            }
        };
    }, []);

    return (
        <SocketContext.Provider value={{ socket: socketRef.current, connected }}>
            {children}
        </SocketContext.Provider>
    );
}

export function useSocket() {
    return useContext(SocketContext);
}
