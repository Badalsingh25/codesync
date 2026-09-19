package com.cbc.controller;

import com.cbc.dto.execution.ExecutionInputMessage;
import com.cbc.dto.execution.ExecutionStopMessage;
import com.cbc.service.ExecutionSessionManager;
import com.cbc.service.RoomService;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.stereotype.Controller;

import java.nio.charset.StandardCharsets;
import java.security.Principal;

@Controller
@RequiredArgsConstructor
public class ExecutionInputController {
    
    private final ExecutionSessionManager sessionManager;
    private final RoomService roomService;
    
    @MessageMapping("/execution.input")
    public void handleInput(@Payload ExecutionInputMessage message, Principal principal) throws java.io.IOException {
        // Without this check, any authenticated user of the platform could
        // send stdin to — or stop — a stranger's running execution just by
        // guessing/knowing a room ID, since the payload's roomId is entirely
        // client-supplied and was previously never checked against the
        // caller's actual room membership.
        roomService.validateRoomMembership(principal.getName(), Long.parseLong(message.roomId()));
        var session = sessionManager.get(message.roomId());
        if (session != null) {
            session.stdin.write((message.input() + "\n").getBytes(StandardCharsets.UTF_8));
            session.stdin.flush();
        }
    }
    
    @MessageMapping("/execution.stop")
    public void handleStop(@Payload ExecutionStopMessage message, Principal principal) {
        roomService.validateRoomMembership(principal.getName(), Long.parseLong(message.roomId()));
        var session = sessionManager.get(message.roomId());
        if (session != null) {
            sessionManager.terminate(session);
            sessionManager.remove(message.roomId());
        }
    }
}