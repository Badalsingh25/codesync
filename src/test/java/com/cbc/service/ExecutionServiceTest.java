package com.cbc.service;

import com.cbc.dto.code.ChatMessage;
import com.cbc.dto.execution.ExecuteCodeRequest;
import com.cbc.repository.ExecutionHistoryRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import java.util.Map;

import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/**
 * NOTE: this test previously mocked a `CodeExecutor.execute(Map)` that
 * returns a response synchronously -- that's not what ExecutionService calls
 * anymore. It now depends on two InteractiveCodeExecutor fields (java and
 * python) that stream output through an ExecutionOutputHandler callback,
 * plus an ExecutionHistoryRepository. Mockito's @InjectMocks matches mocks
 * to constructor parameters by type, so a mock of the wrong type is
 * silently left as null rather than failing at wiring time -- every test
 * below was actually calling executor.start() on a null reference.
 */
@ExtendWith(MockitoExtension.class)
class ExecutionServiceTest {

    @Mock
    private InteractiveCodeExecutor javaExecutor;

    @Mock
    private InteractiveCodeExecutor pythonExecutor;

    @Mock
    private SimpMessagingTemplate simpMessagingTemplate;

    @Mock
    private ExecutionHistoryRepository executionHistoryRepository;

    private ExecutionService executionService;

    @BeforeEach
    void setUp() {
        executionService = new ExecutionService(
                javaExecutor,
                pythonExecutor,
                simpMessagingTemplate,
                executionHistoryRepository
        );
    }

    @Test
    void executeAsync_JavaLanguage_Success() {
        ExecuteCodeRequest request = new ExecuteCodeRequest(
                Map.of("Main.java", "public class Main {}"), "java", "123", "Main.java");

        // Simulate the executor finishing immediately: invoke the handler's
        // onExit callback synchronously, the way a very fast real run would.
        doAnswer(invocation -> {
            ExecutionOutputHandler handler = invocation.getArgument(3);
            handler.onExit(0, 100L);
            return null;
        }).when(javaExecutor).start(eq("123"), anyMap(), eq("Main.java"), any(ExecutionOutputHandler.class));

        executionService.executeAsync(request, "test@test.com");

        // "Execution started..." + the onExit end message = 2 sends.
        verify(simpMessagingTemplate, times(2)).convertAndSend(eq("/topic/room/123"), any(ChatMessage.class));
        verify(javaExecutor, times(1))
                .start(eq("123"), anyMap(), eq("Main.java"), any(ExecutionOutputHandler.class));
        verify(pythonExecutor, never()).start(anyString(), anyMap(), any(), any());
        verify(executionHistoryRepository, times(1)).save(any());
    }

    @Test
    void executeAsync_UnsupportedLanguage_SendsError() {
        ExecuteCodeRequest request = new ExecuteCodeRequest(
                Map.of("main.rb", "puts 'hello'"), "ruby", "123", "main.rb");

        executionService.executeAsync(request, "test@test.com");

        // "Execution started..." + the fallback error end message = 2 sends.
        // Regression check for the gap where an unsupported language left
        // every room member staring at "Execution started..." forever.
        verify(simpMessagingTemplate, times(2)).convertAndSend(eq("/topic/room/123"), any(ChatMessage.class));
        verify(javaExecutor, never()).start(anyString(), anyMap(), any(), any());
        verify(pythonExecutor, never()).start(anyString(), anyMap(), any(), any());
        verify(executionHistoryRepository, times(1)).save(any());
    }

    @Test
    void executeAsync_ExecutorThrows_ErrorIsLoggedNotPropagated() {
        ExecuteCodeRequest request = new ExecuteCodeRequest(
                Map.of("Main.java", "public class Main {}"), "java", "123", "Main.java");

        doThrow(new RuntimeException("Docker error"))
                .when(javaExecutor).start(eq("123"), anyMap(), eq("Main.java"), any(ExecutionOutputHandler.class));

        // executeAsync catches and logs; it must not throw back to the caller.
        executionService.executeAsync(request, "test@test.com");

        // Only the initial "Execution started..." message goes out -- the
        // executor threw before it could report anything further, and
        // executeAsync returns right after calling start() on the
        // java/python path, so there is no fallback end message here.
        verify(simpMessagingTemplate, times(1)).convertAndSend(eq("/topic/room/123"), any(ChatMessage.class));
    }
}
