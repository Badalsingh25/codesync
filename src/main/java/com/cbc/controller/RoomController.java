package com.cbc.controller;

import com.cbc.dto.room.CreateRoomRequest;
import com.cbc.dto.room.JoinRoomRequest;
import com.cbc.dto.room.RoomResponse;
import com.cbc.dto.room.RoomStateResponse;
import com.cbc.dto.room.LockRoomRequest;
import com.cbc.dto.room.ReadOnlyRequest;
import com.cbc.dto.room.CoHostRequest;
import com.cbc.dto.room.KickMemberRequest;
import com.cbc.dto.code.SaveCodeRequest;
import com.cbc.dto.code.ChatMessage;
import com.cbc.entity.ChatLog;
import com.cbc.entity.MessageType;
import com.cbc.entity.Room;
import com.cbc.entity.User;
import com.cbc.repository.ChatLogRepository;
import com.cbc.repository.RoomRepo;
import com.cbc.service.RoomService;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;

@RestController
@RequestMapping("/room")
public class RoomController {
    
    @Autowired
    private RoomService roomService;

    @Autowired
    private ChatLogRepository chatLogRepository;

    @Autowired
    private RoomRepo roomRepo;
    
    @Autowired
    private SimpMessagingTemplate simpMessagingTemplate;
    
    @Autowired
    private ObjectMapper objectMapper;
    
    @Valid
    @PostMapping("/create")
    public ResponseEntity<RoomResponse> createRoom(
            Authentication authentication,
            @RequestBody CreateRoomRequest createRoomRequest
    ) {
        return ResponseEntity.ok(
                roomService.createNewRoom(
                        authentication.getName(),
                        createRoomRequest
                )
        );
    }
    
    @PostMapping("/join")
    public ResponseEntity<RoomResponse> joinRoom(
            Authentication authentication,
            @RequestBody JoinRoomRequest joinRoomRequest
    ) {
        return ResponseEntity.ok(
                roomService.joinRoom(
                        authentication.getName(),
                        joinRoomRequest
                )
        );
    }
    
    @GetMapping("/myRooms")
    public ResponseEntity<List<RoomResponse>> getRoom(
            Authentication authentication
    ) {
        return ResponseEntity.ok(
                roomService.getMyRooms(
                        authentication.getName()
                )
        );
    }
    
    @DeleteMapping("/{roomId}")
    public ResponseEntity<String> deleteRoom(
            @PathVariable Long roomId,
            Authentication authentication
    ) {
        roomService.deleteRoom(
                roomId,
                authentication.getName()
        );
        
        return ResponseEntity.ok(
                "Room deleted successfully"
        );
    }
    
    @GetMapping("/{roomId}/code")
    public ResponseEntity<String> getRoomCode(
            @PathVariable Long roomId,
            Authentication authentication
    ) {
        return ResponseEntity.ok(
                roomService.getCode(
                        roomId,
                        authentication.getName()
                )
        );
    }
    
    @GetMapping("/{roomId}/messages")
    public ResponseEntity<List<ChatLog>> getRoomMessages(
            @PathVariable Long roomId,
            Authentication authentication
    ) {
        // Reuses the same membership check pattern as getCode —
        // anyone fetching history must already belong to the room.
        roomService.getCode(
                roomId,
                authentication.getName()
        );
        
        return ResponseEntity.ok(
                chatLogRepository.findByRoomIdOrderByTimestampAsc(
                        String.valueOf(roomId)
                )
        );
    }
    
    @DeleteMapping("/{roomId}/messages/{messageId}")
    public ResponseEntity<String> deleteMessage(
            @PathVariable Long roomId,
            @PathVariable Long messageId,
            Authentication authentication
    ) {
        roomService.deleteChatMessage(
                roomId,
                authentication.getName(),
                messageId
        );
        
        ChatMessage message = new ChatMessage(
                String.valueOf(roomId),
                authentication.getName(),
                String.valueOf(messageId),
                LocalDateTime.now(),
                MessageType.MESSAGE_DELETED
        );
        simpMessagingTemplate.convertAndSend("/topic/room/" + roomId, message);
        
        return ResponseEntity.ok("Message deleted");
    }
    
    @GetMapping("/{roomId}/state")
    public ResponseEntity<RoomStateResponse> getRoomState(
            @PathVariable Long roomId,
            Authentication authentication
    ) {
        return ResponseEntity.ok(
                roomService.getRoomState(
                        roomId,
                        authentication.getName()
                )
        );
    }
    
    private void broadcastState(
            Long roomId,
            Authentication authentication
    ) {
        RoomStateResponse state =
                roomService.getRoomState(
                        roomId,
                        authentication.getName()
                );
        
        try {
            String stateJson =
                    objectMapper.writeValueAsString(state);
            
            ChatMessage message = new ChatMessage(
                    String.valueOf(roomId),
                    authentication.getName(),
                    stateJson,
                    LocalDateTime.now(),
                    MessageType.ROOM_STATE_UPDATE
            );
            
            simpMessagingTemplate.convertAndSend(
                    "/topic/room/" + roomId,
                    message
            );
            
        } catch (JsonProcessingException e) {
            throw new RuntimeException(
                    "Failed to serialize room state",
                    e
            );
        }
    }
    
    @PostMapping("/{roomId}/lock")
    public ResponseEntity<String> setLocked(
            @PathVariable Long roomId,
            @RequestBody LockRoomRequest request,
            Authentication authentication
    ) {
        roomService.setLocked(
                roomId,
                authentication.getName(),
                request.locked()
        );
        
        broadcastState(
                roomId,
                authentication
        );
        
        return ResponseEntity.ok(
                request.locked()
                        ? "Room locked"
                        : "Room unlocked"
        );
    }
    
    @PostMapping("/{roomId}/readonly")
    public ResponseEntity<String> setReadOnly(
            @PathVariable Long roomId,
            @RequestBody ReadOnlyRequest request,
            Authentication authentication
    ) {
        roomService.setReadOnly(
                roomId,
                authentication.getName(),
                request.readOnly()
        );
        
        broadcastState(
                roomId,
                authentication
        );
        
        return ResponseEntity.ok(
                request.readOnly()
                        ? "Read-only mode enabled"
                        : "Read-only mode disabled"
        );
    }
    
    @PostMapping("/{roomId}/promote")
    public ResponseEntity<String> promoteToCoHost(
            @PathVariable Long roomId,
            @RequestBody CoHostRequest request,
            Authentication authentication
    ) {
        roomService.promoteToCoHost(
                roomId,
                authentication.getName(),
                request.targetEmail()
        );
        
        broadcastState(
                roomId,
                authentication
        );
        
        return ResponseEntity.ok(
                request.targetEmail() + " is now a co-host"
        );
    }
    
    @PostMapping("/{roomId}/demote")
    public ResponseEntity<String> demoteCoHost(
            @PathVariable Long roomId,
            @RequestBody CoHostRequest request,
            Authentication authentication
    ) {
        roomService.demoteCoHost(
                roomId,
                authentication.getName(),
                request.targetEmail()
        );
        
        broadcastState(
                roomId,
                authentication
        );
        
        return ResponseEntity.ok(
                request.targetEmail() + " is no longer a co-host"
        );
    }
    
    @PostMapping("/{roomId}/kick")
    public ResponseEntity<String> kickMember(
            @PathVariable Long roomId,
            @RequestBody KickMemberRequest request,
            Authentication authentication
    ) {
        roomService.kickMember(
                roomId,
                authentication.getName(),
                request.targetEmail()
        );
        
        // Broadcast to the room; every connected client checks if they are
        // the target and, if so, disconnects. Membership is now actually
        // revoked in the database too (see RoomService.kickMember), so the
        // target can no longer simply rejoin an unlocked room afterwards.
        ChatMessage message = new ChatMessage(
                String.valueOf(roomId),
                authentication.getName(),
                request.targetEmail(),
                LocalDateTime.now(),
                MessageType.KICKED
        );
        
        simpMessagingTemplate.convertAndSend(
                "/topic/room/" + roomId,
                message
        );
        
        return ResponseEntity.ok(
                request.targetEmail() + " was kicked"
        );
    }

    @PostMapping("/{roomId}/leave")
    public ResponseEntity<String> leaveRoom(
            @PathVariable Long roomId,
            Authentication authentication
    ) {
        roomService.leaveRoom(roomId, authentication.getName());

        ChatMessage message = new ChatMessage(
                String.valueOf(roomId),
                authentication.getName(),
                authentication.getName(),
                LocalDateTime.now(),
                MessageType.LEFT
        );
        simpMessagingTemplate.convertAndSend(
                "/topic/room/" + roomId,
                message
        );

        return ResponseEntity.ok("You have left the room");
    }
    
    @GetMapping("/{roomId}/members")
    public ResponseEntity<java.util.Set<String>> getRoomMembers(
            @PathVariable Long roomId,
            Authentication authentication
    ) {
        return ResponseEntity.ok(
                roomService.getRoomMembers(roomId, authentication.getName())
        );
    }

    @PostMapping("/{roomId}/save")
    public ResponseEntity<String> saveRoomCode(
            @PathVariable Long roomId,
            @RequestBody SaveCodeRequest request,
            Authentication authentication
    ) {
        roomService.saveCode(
                roomId,
                request.code(),
                authentication.getName()
        );
        
        return ResponseEntity.ok(
                "Code saved successfully"
        );
    }
}