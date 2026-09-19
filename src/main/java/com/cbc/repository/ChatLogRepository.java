package com.cbc.repository;

import com.cbc.entity.ChatLog;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ChatLogRepository extends JpaRepository<ChatLog, Long> {
    List<ChatLog> findByRoomIdOrderByTimestampAsc(String roomId);
}