package com.cbc.service;

import com.cbc.dto.room.CreateRoomRequest;
import com.cbc.dto.room.JoinRoomRequest;
import com.cbc.dto.room.RoomResponse;
import com.cbc.entity.Room;
import com.cbc.entity.User;
import com.cbc.repository.RoomRepo;
import com.cbc.repository.UserRepo;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class RoomService {
    
    private final RoomRepo roomRepo;
    private final UserRepo userRepo;
    private final com.cbc.repository.ChatLogRepository chatLogRepository;
    
    @Transactional
    public RoomResponse createNewRoom(String email, CreateRoomRequest createRoomRequest) {
        User user = userRepo.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("User not found"));
        Room room = new Room();
        room.setName(createRoomRequest.roomName());
        room.setCreatedAt(LocalDateTime.now());
        room.setCreatedBy(user);
        room.setHostEmail(user.getEmail());
        String roomCode;
        
        do {
            roomCode = UUID.randomUUID()
                    .toString()
                    .replace("-", "")
                    .substring(0, 6)
                    .toUpperCase();
        }
        while (roomRepo.existsByRoomCode(roomCode));
        room.setRoomCode(roomCode);
        roomRepo.save(room);
        
        user.getRooms().add(room);
        userRepo.save(user);
        
        return new RoomResponse(room.getId(), room.getName(), roomCode);
    }
    
    @Transactional
    public RoomResponse joinRoom(String email, JoinRoomRequest joinRoomRequest) {
        User user = userRepo.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("User not found"));
        Room room = roomRepo.findByRoomCode(joinRoomRequest.roomCode())
                .orElseThrow(() -> new RuntimeException("Room Not Found"));
        
        List<Room> userRooms = user.getRooms();
        boolean alreadyMember = userRooms.contains(room);
        
        if (room.isLocked() && !alreadyMember) {
            throw new RuntimeException("This room is locked and not accepting new members.");
        }
        
        if (!alreadyMember) {
            userRooms.add(room);
        }
        
        user.setRooms(userRooms);
        userRepo.save(user);
        
        return new RoomResponse(room.getId(), room.getName(), joinRoomRequest.roomCode());
    }
    
    
    @Transactional(readOnly = true)
    public List<RoomResponse> getMyRooms(String email) {
        User user = userRepo.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("User not found"));
        
        return user.getRooms()
                .stream()
                .map(room -> new RoomResponse(room.getId(), room.getName(), room.getRoomCode()))
                .toList();
    }
    
    
    @Transactional
    public void deleteRoom(Long roomId, String email) {
        Room room = roomRepo.findById(roomId)
                .orElseThrow(() ->
                        new RuntimeException("Room not found"));
        
        if (!room.getCreatedBy().getEmail().equals(email)) {
            throw new RuntimeException(
                    "You are not authorized to delete this room"
            );
        }
        
        roomRepo.deleteRoomAssociations(roomId);
        roomRepo.delete(room);
        
    }
    
    @Transactional(readOnly = true)
    public void validateRoomMembership(String email, Long roomId) {
        if (!userRepo.isUserMemberOfRoom(email, roomId)) {
            throw new org.springframework.security.access.AccessDeniedException(
                    "You are not authorized to access this room"
            );
        }
    }
    
    /**
     * True unless the room is read-only and the caller is not a moderator.
     * Used to enforce read-only mode wherever code can actually be changed —
     * both the REST save endpoint and the live Yjs update relay over STOMP,
     * since previously only the Monaco editor's client-side "readOnly" prop
     * respected this flag and nothing on the server did.
     */
    @Transactional(readOnly = true)
    public boolean isEditAllowed(Long roomId, String email) {
        Room room = roomRepo.findById(roomId)
                .orElseThrow(() -> new RuntimeException("Room not found"));
        return !room.isReadOnly() || isModerator(room, email);
    }

    @Transactional
    public void saveCode(Long roomId, String code, String email) {
        validateRoomMembership(email, roomId);
        
        Room room = roomRepo.findById(roomId)
                .orElseThrow(() ->
                        new RuntimeException("Room not found"));

        // Read-only mode was previously only enforced in the Monaco editor's
        // UI prop on the frontend — nothing stopped a direct call to this
        // save endpoint (or a modified client) from writing code to a room
        // while it was supposed to be locked to moderators only.
        if (!isEditAllowed(roomId, email)) {
            throw new org.springframework.security.access.AccessDeniedException(
                    "This room is read-only. Only the host or a co-host can save changes."
            );
        }

        room.setCurrentCode(code);
        
        roomRepo.save(room);
    }
    
    @Transactional(readOnly = true)
    public String getCode(Long roomId, String email) {
        validateRoomMembership(email, roomId);
        
        Room room = roomRepo.findById(roomId)
                .orElseThrow(() ->
                        new RuntimeException("Room not found"));
        
        String code = room.getCurrentCode();
        return code != null ? code : "public class Main {\n    public static void main(String[] args) {\n  //Start Coding  \n    System.out.println(\"Hello, World!\");\n    }\n}";
    }
    
    @Transactional(readOnly = true)
    public String getPrimaryHostEmail(Room room) {
        return room.getCreatedBy().getEmail();
    }
    
    private boolean isCoHost(Room room, String email) {
        if (email == null) return false;
        return room.getCoHosts().stream().anyMatch(e -> e.equalsIgnoreCase(email));
    }
    
    @Transactional(readOnly = true)
    public boolean isModerator(Room room, String email) {
        return getPrimaryHostEmail(room).equalsIgnoreCase(email) || isCoHost(room, email);
    }
    
    @Transactional(readOnly = true)
    public com.cbc.dto.room.RoomStateResponse getRoomState(Long roomId, String email) {
        validateRoomMembership(email, roomId);
        Room room = roomRepo.findById(roomId)
                .orElseThrow(() -> new RuntimeException("Room not found"));
        
        return new com.cbc.dto.room.RoomStateResponse(
                getPrimaryHostEmail(room),
                room.getCoHosts(),
                room.isLocked(),
                room.isReadOnly()
        );
    }

    /*
     * Was previously inlined in RoomController, calling roomRepo.findById()
     * directly with no @Transactional boundary around it. That worked only
     * by accident while spring.jpa.open-in-view=true kept a session open
     * for the whole request — with OSIV now off, the session closes the
     * instant findById() returns, and room.getJoinedUsers() (lazy) threw
     * LazyInitializationException on every single call. Every other
     * endpoint here already goes through a @Transactional service method
     * for exactly this reason; this one just hadn't been moved yet.
     */
    @Transactional(readOnly = true)
    public java.util.Set<String> getRoomMembers(Long roomId, String email) {
        validateRoomMembership(email, roomId);
        Room room = roomRepo.findById(roomId)
                .orElseThrow(() -> new RuntimeException("Room not found"));

        java.util.Set<String> members = new java.util.LinkedHashSet<>();
        members.add(room.getCreatedBy().getEmail());
        for (User u : room.getJoinedUsers()) {
            members.add(u.getEmail());
        }
        return members;
    }
    
    // Any moderator (primary host or co-host) may lock/unlock, toggle
    // read-only, and kick regular members.
    private Room requireModerator(Long roomId, String email) {
        Room room = roomRepo.findById(roomId)
                .orElseThrow(() -> new RuntimeException("Room not found"));
        
        if (!isModerator(room, email)) {
            // Previously included "DEBUG: caller=[...] primaryHost=[...]
            // coHosts=[...]" — this leaked the room owner's and every
            // co-host's email address to any regular member who simply
            // attempted a moderator-only action, which is unnecessary
            // reconnaissance value for an attacker and not something the
            // caller has any legitimate need to see.
            throw new org.springframework.security.access.AccessDeniedException(
                    "You do not have permission to perform this action."
            );
        }
        return room;
    }
    
    // Only the permanent primary host may promote/demote co-hosts.
    private Room requirePrimaryHost(Long roomId, String email) {
        Room room = roomRepo.findById(roomId)
                .orElseThrow(() -> new RuntimeException("Room not found"));
        
        if (!getPrimaryHostEmail(room).equalsIgnoreCase(email)) {
            throw new org.springframework.security.access.AccessDeniedException(
                    "Only the primary host can perform this action."
            );
        }
        return room;
    }
    
    @Transactional
    public void setLocked(Long roomId, String email, boolean locked) {
        Room room = requireModerator(roomId, email);
        room.setLocked(locked);
        roomRepo.save(room);
    }
    
    @Transactional
    public void setReadOnly(Long roomId, String email, boolean readOnly) {
        Room room = requireModerator(roomId, email);
        room.setReadOnly(readOnly);
        roomRepo.save(room);
    }
    
    @Transactional
    public void promoteToCoHost(Long roomId, String email, String targetEmail) {
        Room room = requirePrimaryHost(roomId, email);
        
        if (targetEmail == null || targetEmail.isBlank()) {
            throw new RuntimeException("No target user specified.");
        }
        if (getPrimaryHostEmail(room).equalsIgnoreCase(targetEmail)) {
            throw new RuntimeException("The primary host is already the top-level host.");
        }
        if (!userRepo.isUserMemberOfRoom(targetEmail, roomId)) {
            throw new RuntimeException("That user is not a member of this room.");
        }
        
        room.getCoHosts().add(targetEmail);
        roomRepo.save(room);
    }
    
    @Transactional
    public void demoteCoHost(Long roomId, String email, String targetEmail) {
        Room room = requirePrimaryHost(roomId, email);
        room.getCoHosts().removeIf(e -> e.equalsIgnoreCase(targetEmail));
        roomRepo.save(room);
    }
    
    @Transactional(readOnly = true)
    public void validateKick(Long roomId, String email, String targetEmail) {
        Room room = requireModerator(roomId, email);
        
        if (targetEmail == null || targetEmail.isBlank()) {
            throw new RuntimeException("No target user specified.");
        }
        if (getPrimaryHostEmail(room).equalsIgnoreCase(targetEmail)) {
            throw new RuntimeException("The primary host cannot be kicked.");
        }
        if (email.equalsIgnoreCase(targetEmail)) {
            throw new RuntimeException("You cannot kick yourself.");
        }
        // A co-host may only kick regular members — removing another
        // co-host is reserved for the primary host (via demote, then kick).
        boolean actorIsPrimary = getPrimaryHostEmail(room).equalsIgnoreCase(email);
        if (!actorIsPrimary && isCoHost(room, targetEmail)) {
            throw new RuntimeException("Only the primary host can remove a co-host.");
        }
    }

    /**
     * Validates the kick, then actually removes the target from the room's
     * membership (and clears any co-host status) so they can't simply
     * rejoin immediately afterwards. Previously "kick" was UI-only — it
     * broadcast a message telling the target's own client to disconnect,
     * but never touched the database, so a kicked (non-locked) room could
     * be freely rejoined via POST /room/join a moment later.
     */
    @Transactional
    public void kickMember(Long roomId, String email, String targetEmail) {
        validateKick(roomId, email, targetEmail);
        removeMemberFromRoom(roomId, targetEmail);
    }

    /**
     * Lets a non-host member remove themselves from a room. The primary
     * host can't leave this way (a room always needs its permanent owner —
     * delete the room instead if you no longer want it to exist).
     */
    @Transactional
    public void leaveRoom(Long roomId, String email) {
        Room room = roomRepo.findById(roomId)
                .orElseThrow(() -> new RuntimeException("Room not found"));
        if (getPrimaryHostEmail(room).equalsIgnoreCase(email)) {
            throw new RuntimeException("The primary host cannot leave the room. Delete the room instead.");
        }
        removeMemberFromRoom(roomId, email);
    }

    private void removeMemberFromRoom(Long roomId, String targetEmail) {
        User targetUser = userRepo.findByEmail(targetEmail)
                .orElseThrow(() -> new RuntimeException("User not found"));
        targetUser.getRooms().removeIf(r -> r.getId() == roomId);
        userRepo.save(targetUser);

        roomRepo.findById(roomId).ifPresent(room -> {
            room.getCoHosts().removeIf(e -> e.equalsIgnoreCase(targetEmail));
            roomRepo.save(room);
        });
    }
    
    // A message can be deleted by whoever sent it, or by any moderator
    // (host/co-host) for basic chat moderation.
    @Transactional
    public void deleteChatMessage(Long roomId, String email, Long messageId) {
        com.cbc.entity.ChatLog log = chatLogRepository.findById(messageId)
                .orElseThrow(() -> new RuntimeException("Message not found"));
        
        if (!log.getRoomId().equals(String.valueOf(roomId))) {
            throw new RuntimeException("This message does not belong to this room.");
        }
        
        Room room = roomRepo.findById(roomId)
                .orElseThrow(() -> new RuntimeException("Room not found"));
        
        boolean isOwnMessage = log.getSender().equalsIgnoreCase(email);
        if (!isOwnMessage && !isModerator(room, email)) {
            throw new org.springframework.security.access.AccessDeniedException(
                    "You can only delete your own messages."
            );
        }
        
        chatLogRepository.deleteById(messageId);
    }
    
}