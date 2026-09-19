package com.cbc.controller;

import com.cbc.dto.execution.ExecuteCodeRequest;
import com.cbc.entity.ExecutionHistory;
import com.cbc.service.ExecutionService;
import com.cbc.service.RoomService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/execute")
@RequiredArgsConstructor
public class ExecutionController {

    // No limit previously existed on the number of files or how much source
    // a single /execute/run request could carry — a request with gigabytes
    // of "code" would be accepted and written straight to disk. These are
    // generous enough for any real coding-exercise workspace while capping
    // the worst case.
    private static final int MAX_FILES = 50;
    private static final int MAX_FILE_CHARS = 300_000;       // ~300 KB per file
    private static final int MAX_TOTAL_CHARS = 2_000_000;    // ~2 MB per request

    private final ExecutionService executionService;
    private final RoomService roomService;

    @PostMapping("/run")
    public ResponseEntity<Void> execute(@RequestBody ExecuteCodeRequest request, Authentication authentication) {
        roomService.validateRoomMembership(authentication.getName(), Long.parseLong(request.roomId()));
        validateSize(request.files());
        executionService.executeAsync(request, authentication.getName());
        return ResponseEntity.accepted().build();
    }

    @GetMapping("/history/{roomId}")
    public ResponseEntity<List<ExecutionHistory>> getExecutionHistory(@PathVariable String roomId, Authentication authentication) {
        roomService.validateRoomMembership(authentication.getName(), Long.parseLong(roomId));
        return ResponseEntity.ok(executionService.getHistory(roomId));
    }

    private void validateSize(Map<String, String> files) {
        if (files == null || files.isEmpty()) {
            throw new IllegalArgumentException("No files provided to execute.");
        }
        if (files.size() > MAX_FILES) {
            throw new IllegalArgumentException("Too many files in one execution request (max " + MAX_FILES + ").");
        }
        long total = 0;
        for (Map.Entry<String, String> entry : files.entrySet()) {
            String content = entry.getValue() == null ? "" : entry.getValue();
            if (content.length() > MAX_FILE_CHARS) {
                throw new IllegalArgumentException(
                        "File '" + entry.getKey() + "' is too large (max " + MAX_FILE_CHARS + " characters)."
                );
            }
            total += content.length();
        }
        if (total > MAX_TOTAL_CHARS) {
            throw new IllegalArgumentException("Total execution payload is too large (max " + MAX_TOTAL_CHARS + " characters).");
        }
    }

}

