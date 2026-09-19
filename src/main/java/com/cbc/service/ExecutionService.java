package com.cbc.service;

import com.cbc.dto.execution.ExecuteCodeRequest;
import com.cbc.dto.code.ChatMessage;
import com.cbc.entity.ExecutionHistory;
import com.cbc.entity.MessageType;
import com.cbc.repository.ExecutionHistoryRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class ExecutionService {

    private final InteractiveCodeExecutor javaExecutor;
    private final InteractiveCodeExecutor pythonExecutor;
    private final SimpMessagingTemplate simpMessagingTemplate;
    private final ExecutionHistoryRepository executionHistoryRepository;

    @Value("${RENDER:false}")
    private boolean isRender;

    @Async("executionTaskExecutor")
    public void executeAsync(ExecuteCodeRequest request, String executorEmail) {
        String roomId = request.roomId();
        String destination = "/topic/room/" + roomId;
        String language = request.language();

        try {
            // Send start notification
            ChatMessage startMessage = new ChatMessage(
                    roomId, executorEmail, "Execution started...",
                    LocalDateTime.now(), MessageType.EXECUTION_START
            );
            simpMessagingTemplate.convertAndSend(destination, startMessage);

            // Collectors for history
            StringBuilder outputCollector = new StringBuilder();
            StringBuilder errorCollector = new StringBuilder();
            int[] exitCode = { -1 };
            long[] execTime = { 0L };

            if (isRender) {
                outputCollector.append("To run code, please run on your local machine.");
                errorCollector.append("RENDER mode");
                exitCode[0] = 1;
            } else if ("java".equalsIgnoreCase(language) || "python".equalsIgnoreCase(language)) {
                InteractiveCodeExecutor executor = "java".equalsIgnoreCase(language) ? javaExecutor : pythonExecutor;

                executor.start(roomId, request.files(), request.activeFile(), new ExecutionOutputHandler() {
                    @Override
                    public void onOutput(String chunk, boolean isError) {
                        ChatMessage msg = new ChatMessage(roomId, executorEmail, chunk, LocalDateTime.now(), MessageType.EXECUTION_OUTPUT);
                        simpMessagingTemplate.convertAndSend(destination, msg);
                        if (isError) errorCollector.append(chunk);
                        else outputCollector.append(chunk);
                    }

                    @Override
                    public void onExit(int code, long timeMs) {
                        exitCode[0] = code;
                        execTime[0] = timeMs;
                        String payload = "{\"exitCode\":" + code + ",\"executionTime\":" + timeMs + "}";
                        ChatMessage msg = new ChatMessage(roomId, executorEmail, payload, LocalDateTime.now(), MessageType.EXECUTION_END);
                        simpMessagingTemplate.convertAndSend(destination, msg);

                        // Save execution history
                        saveHistory(roomId, executorEmail, language, outputCollector, errorCollector, code, timeMs);
                    }
                });
                return;
            } else {
                errorCollector.append("Language '").append(language).append("' is not supported.");
                exitCode[0] = 1;
            }

            // The isRender / unsupported-language paths fall through to
            // here (the java/python path already sent its own end message
            // and returned above). Without this, everyone in the room saw
            // "Execution started..." and then silence — the error was only
            // ever visible later, in history.
            if (errorCollector.length() > 0) {
                String payload = "{\"exitCode\":" + exitCode[0] + ",\"executionTime\":" + execTime[0]
                        + ",\"error\":\"" + errorCollector.toString().replace("\"", "'") + "\"}";
                ChatMessage endMessage = new ChatMessage(
                        roomId, executorEmail, payload, LocalDateTime.now(), MessageType.EXECUTION_END
                );
                simpMessagingTemplate.convertAndSend(destination, endMessage);
            }

            // Save history for non-async paths
            saveHistory(roomId, executorEmail, language, outputCollector, errorCollector, exitCode[0], execTime[0]);

        } catch (Exception e) {
            log.error("Execution failed for room {} by {}: {}", roomId, executorEmail, e.getMessage(), e);
        }
    }

    private void saveHistory(String roomId, String executorEmail, String language,
                             StringBuilder output, StringBuilder error, int exitCode, long execTime) {
        try {
            ExecutionHistory history = ExecutionHistory.builder()
                    .roomId(roomId)
                    .executorEmail(executorEmail)
                    .language(language)
                    .output(output.toString())
                    .error(error.toString())
                    .exitCode(exitCode)
                    .executionTimeMs(execTime)
                    .executedAt(LocalDateTime.now())
                    .build();
            executionHistoryRepository.save(history);
        } catch (Exception e) {
            log.error("Failed to save execution history: {}", e.getMessage());
        }
    }

    public List<ExecutionHistory> getHistory(String roomId) {
        return executionHistoryRepository.findByRoomIdOrderByExecutedAtDesc(roomId);
    }
}
