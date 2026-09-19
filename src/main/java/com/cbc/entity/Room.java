package com.cbc.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import jakarta.persistence.Id;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Getter
@Setter
@AllArgsConstructor
@NoArgsConstructor
public class Room {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private long id;
    private String name;
    
    private String roomCode;
    
    private LocalDateTime createdAt;
    
    
    @Lob
    @Column(columnDefinition = "TEXT")
    private String currentCode;
    
    @ManyToOne
    @JoinColumn(name = "created_by")
    private User createdBy;
    
    // Legacy field from the old single-transferable-host design — no longer
    // written to going forward. The primary host is now always createdBy,
    // permanently. Left in place (nullable) so it doesn't break the existing
    // schema; RoomService ignores it.
    private String hostEmail;
    
    // Co-hosts: promoted by the primary host, get moderator powers (kick
    // regular members, lock/read-only) but can never touch the primary host
    // or manage other co-hosts.
    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "room_co_hosts", joinColumns = @JoinColumn(name = "room_id"))
    @Column(name = "email")
    private java.util.Set<String> coHosts = new java.util.HashSet<>();
    
    private boolean locked = false;
    
    private boolean readOnly = false;
    
    @ManyToMany(mappedBy = "rooms")
    private List<User> joinedUsers = new ArrayList<>();
    
}