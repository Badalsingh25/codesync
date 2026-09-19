package com.cbc.repository;

import com.cbc.entity.ExecutionHistory;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ExecutionHistoryRepository extends JpaRepository<ExecutionHistory, Long> {
    List<ExecutionHistory> findByRoomIdOrderByExecutedAtDesc(String roomId);
    List<ExecutionHistory> findByRoomIdAndExecutorEmailOrderByExecutedAtDesc(String roomId, String executorEmail);
}
