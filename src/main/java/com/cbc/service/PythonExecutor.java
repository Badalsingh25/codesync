package com.cbc.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.attribute.PosixFilePermissions;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

@Slf4j
@Service
public class PythonExecutor implements InteractiveCodeExecutor {
    
    @Value("${execution.container-path:}")
    private String containerPath;
    
    @Value("${execution.host-path:}")
    private String hostPathConfig;
    
    private final ExecutionSessionManager sessionManager;
    
    public PythonExecutor(ExecutionSessionManager sessionManager) {
        this.sessionManager = sessionManager;
    }
    
    @Override
    public void start(String roomId, Map<String, String> files, String activeFile, ExecutionOutputHandler handler) {
        try {
            // Prefer the active file if it's a .py file; otherwise fall back to the first .py found
            String pyFileName = (activeFile != null && activeFile.endsWith(".py") && files.containsKey(activeFile))
                    ? activeFile
                    : files.keySet().stream()
                            .filter(name -> name.endsWith(".py"))
                            .findFirst()
                            .orElse(null);
            
            if (pyFileName == null) {
                handler.onOutput("No .py file found in this workspace.", true);
                handler.onExit(-1, 0);
                return;
            }
            
            String uuid = UUID.randomUUID().toString();
            Path tempDir = (containerPath != null && !containerPath.isBlank())
                    ? Paths.get(containerPath, uuid)
                    : Files.createTempDirectory("execution-" + uuid);
            Files.createDirectories(tempDir);
            
            for (Map.Entry<String, String> entry : files.entrySet()) {
                Path javaFile = resolveWithinTempDir(tempDir, entry.getKey());
                Files.createDirectories(javaFile.getParent());
                Files.writeString(javaFile, entry.getValue(), StandardCharsets.UTF_8);
            }

            // See JavaExecutor for the full explanation: the runner
            // container below runs as unprivileged "nobody", but this
            // backend process runs as root, so everything just written
            // above is root-owned. Without this, "nobody" can't write
            // anything into /app at all.
            makeWritableByAnyone(tempDir);
            
            String containerName = "exec-" + uuid;
            String hostPath = (hostPathConfig != null && !hostPathConfig.isBlank())
                    ? hostPathConfig + "/" + uuid
                    : tempDir.toAbsolutePath().toString().replace('\\', '/');
            
            // No "sh -c" here on purpose: running python3 as plain, separate
            // ProcessBuilder arguments avoids any shell parsing entirely, which
            // sidesteps a real Windows ProcessBuilder quoting issue that broke
            // the previous "sh -c \"...\"" version of this command.
            ProcessBuilder dockerBuilder =
                    new ProcessBuilder(
                            "docker",
                            "run",
                            "-i",
                            "--rm",
                            "--name",
                            containerName,
                            "--memory=128m",
                            "--cpus=1",
                            "--network=none",
                            "--user", "nobody",
                            "--pids-limit=64",
                            "--read-only",
                            "--tmpfs", "/tmp:size=32m,mode=1777",
                            "--ulimit", "nproc=64:64",
                            "--ulimit", "nofile=256:256",
                            "-v",
                            hostPath + ":/app",
                            "python-runner",
                            "python3",
                            "-u",
                            pyFileName
                    );
            
            long startTime = System.currentTimeMillis();
            Process process = dockerBuilder.start();
            sessionManager.register(roomId, new ExecutionSessionManager.Session(process, containerName));
            
            // Stream stdout live
            Thread stdoutReader = new Thread(() -> streamOutput(process.getInputStream(), handler, false));
            stdoutReader.setDaemon(true);
            stdoutReader.start();
            
            // Stream stderr live
            Thread stderrReader = new Thread(() -> streamOutput(process.getErrorStream(), handler, true));
            stderrReader.setDaemon(true);
            stderrReader.start();
            
            // Watch for actual completion, in its own thread — never blocks the caller
            Thread watcher = new Thread(() -> {
                try {
                    boolean finished = process.waitFor(5, TimeUnit.MINUTES); // safety ceiling, not a per-run cap
                    long elapsed = System.currentTimeMillis() - startTime;
                    if (!finished) {
                        sessionManager.terminate(sessionManager.get(roomId));
                        handler.onExit(-1, elapsed);
                    } else {
                        handler.onExit(process.exitValue(), elapsed);
                    }
                } catch (InterruptedException ignored) {
                } finally {
                    sessionManager.remove(roomId);
                    deleteDirectory(tempDir);
                }
            });
            watcher.setDaemon(true);
            watcher.start();
            
        } catch (IOException e) {
            handler.onOutput("Failed to start execution: " + e.getMessage(), true);
            handler.onExit(-1, 0);
        }
    }
    
    private void streamOutput(java.io.InputStream stream, ExecutionOutputHandler handler, boolean isError) {
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                handler.onOutput(line + "\n", isError);
            }
        } catch (IOException ignored) {
            // stream closes naturally when the process/container exits
        }
    }
    
    /**
     * Resolves a client-supplied filename against the per-execution temp
     * directory, rejecting anything that would escape it (e.g. "../../etc/x",
     * an absolute path, or a Windows drive-letter path). Filenames here come
     * straight from the collaborative file map, which is user-editable, so
     * this must never be trusted to already be a safe relative path.
     */
    /**
     * Walks the whole tree and sets rwxrwxrwx on every entry. Only meant
     * for the short-lived per-execution scratch directory — see the call
     * site above and JavaExecutor for the full explanation.
     */
    private void makeWritableByAnyone(Path root) {
        try (var walk = Files.walk(root)) {
            var perms = PosixFilePermissions.fromString("rwxrwxrwx");
            walk.forEach(p -> {
                try {
                    Files.setPosixFilePermissions(p, perms);
                } catch (Exception e) {
                    log.warn("Could not relax permissions on {}: {}", p, e.getMessage());
                }
            });
        } catch (IOException e) {
            log.warn("Could not walk {} to relax permissions: {}", root, e.getMessage());
        }
    }

    private Path resolveWithinTempDir(Path tempDir, String rawName) throws IOException {
        if (rawName == null || rawName.isBlank()) {
            throw new IOException("Invalid file name");
        }
        Path resolved = tempDir.resolve(rawName).normalize();
        Path normalizedRoot = tempDir.normalize();
        if (!resolved.startsWith(normalizedRoot)) {
            throw new IOException("Invalid file name (path traversal rejected): " + rawName);
        }
        return resolved;
    }

    private void deleteDirectory(Path path) {
        try {
            if (Files.exists(path)) {
                try (var walk = Files.walk(path)) {
                    walk.sorted(java.util.Comparator.reverseOrder())
                            .map(Path::toFile).forEach(java.io.File::delete);
                }
            }
        } catch (IOException e) {
            log.warn("Cleanup failed for {}: {}", path, e.getMessage());
        }
    }
}