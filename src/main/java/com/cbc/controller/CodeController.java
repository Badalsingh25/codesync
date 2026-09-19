package com.cbc.controller;

import com.cbc.dto.code.ChatMessage;
import com.cbc.entity.ChatLog;
import com.cbc.entity.MessageType;
import com.cbc.repository.ChatLogRepository;
import com.cbc.service.RoomService;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

import java.security.Principal;
import java.time.LocalDateTime;
import java.util.Map;

@Controller
@RequiredArgsConstructor
public class CodeController {
    private final SimpMessagingTemplate simpMessagingTemplate;
    private final RoomService roomService;
    private final ChatLogRepository chatLogRepository;
    private final ObjectMapper objectMapper;
    
    @MessageMapping("/chat.send")
    public void sendMessage(@Payload ChatMessage chatMessage, SimpMessageHeaderAccessor headerAccessor, Principal principal) {
        roomService.validateRoomMembership(principal.getName(), Long.parseLong(chatMessage.roomId()));

        // Read-only mode used to be enforced only by the Monaco editor's UI
        // prop on the frontend — a modified/stale client could still push
        // real Yjs document edits through here even while the room was
        // supposed to be locked down. Silently drop the edit instead of
        // relaying it; awareness/cursor/join-leave/chat messages are
        // unaffected since they aren't document mutations.
        if (chatMessage.messageType() == MessageType.YJS_UPDATE
                && !roomService.isEditAllowed(Long.parseLong(chatMessage.roomId()), principal.getName())) {
            return;
        }
        
        headerAccessor.getSessionAttributes().put("username", chatMessage.creator());
        headerAccessor.getSessionAttributes().put("roomId", chatMessage.roomId());
        
        // Only persist genuine chat text — every other message type (YJS sync,
        // cursor awareness, join/leave, execution output) still flows through
        // this same relay endpoint but is never written to the database.
        if (chatMessage.messageType() == MessageType.CHAT) {
            ChatLog log = ChatLog.builder()
                    .roomId(chatMessage.roomId())
                    .sender(chatMessage.creator())
                    .content(chatMessage.content())
                    .timestamp(chatMessage.localDateTime() != null ? chatMessage.localDateTime() : LocalDateTime.now())
                    .build();
            chatLogRepository.save(log);
            
            // Wrap the content with the real DB id so the sender's own client
            // can offer a delete action immediately, not just after a refresh.
            try {
                String wrapped = objectMapper.writeValueAsString(
                        Map.of("id", log.getId(), "text", chatMessage.content())
                );
                ChatMessage enriched = new ChatMessage(
                        chatMessage.roomId(),
                        chatMessage.creator(),
                        wrapped,
                        chatMessage.localDateTime(),
                        chatMessage.messageType()
                );
                simpMessagingTemplate.convertAndSend("/topic/room/" + chatMessage.roomId(), enriched);
                return;
            } catch (Exception e) {
                // fall through to the generic broadcast below if wrapping fails
            }
        }
        
        simpMessagingTemplate.convertAndSend(
                "/topic/room/" + chatMessage.roomId(), chatMessage
        );
    }
    
}