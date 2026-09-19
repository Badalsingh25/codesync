package com.cbc.service;

import org.springframework.stereotype.Service;
import java.io.OutputStream;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class ExecutionSessionManager {
    
    public static class Session {
        public final Process process;
        public final String containerName;
        public final OutputStream stdin;
        
        public Session(Process process, String containerName) {
            this.process = process;
            this.containerName = containerName;
            this.stdin = process.getOutputStream();
        }
    }
    
    private final Map<String, Session> sessions = new ConcurrentHashMap<>();
    
    public void register(String roomId, Session session) {
        Session old = sessions.put(roomId, session);
        if (old != null) terminate(old); // only one live run per room at a time
    }
    
    public Session get(String roomId) {
        return sessions.get(roomId);
    }
    
    public void remove(String roomId) {
        sessions.remove(roomId);
    }
    
    public void terminate(Session session) {
        try {
            session.process.destroyForcibly();
            new ProcessBuilder("docker", "kill", session.containerName).start().waitFor();
        } catch (Exception ignored) {}
    }
}