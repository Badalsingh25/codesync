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
public class JavaExecutor implements InteractiveCodeExecutor {

    @Value("${execution.container-path:}")
    private String containerPath;

    @Value("${execution.host-path:}")
    private String hostPathConfig;

    private final ExecutionSessionManager sessionManager;

    public JavaExecutor(ExecutionSessionManager sessionManager) {
        this.sessionManager = sessionManager;
    }

    @Override
    public void start(String roomId, Map<String, String> files, String activeFile, ExecutionOutputHandler handler) {
        try {
            String uuid = UUID.randomUUID().toString();
            Path tempDir = (containerPath != null && !containerPath.isBlank())
                    ? Paths.get(containerPath, uuid)
                    : Files.createTempDirectory("execution-" + uuid);
            Files.createDirectories(tempDir);

            // Determine the main entry-point file: prefer the active file if it's a .java file,
            // otherwise fall back to the existing main-class detection.
            String activeJava = (activeFile != null && activeFile.endsWith(".java") && files.containsKey(activeFile))
                    ? activeFile : null;

            for (Map.Entry<String, String> entry : files.entrySet()) {
                Path javaFile = resolveWithinTempDir(tempDir, entry.getKey());
                Files.createDirectories(javaFile.getParent());
                Files.writeString(javaFile, entry.getValue(), StandardCharsets.UTF_8);
            }

            // The runner container below intentionally runs as the
            // unprivileged "nobody" user, not root — sandboxed code should
            // never run as root. But this backend process runs as root
            // (see the Dockerfile), so every directory/file it just wrote
            // above is root-owned by default. Without this, "nobody" can't
            // write sources.txt or any compiled .class file into /app at
            // all: "Permission denied" before the compiler even runs.
            // Setting the whole tree world-writable here means it doesn't
            // matter what UID "nobody" resolves to on the host.
            makeWritableByAnyone(tempDir);

            String containerName = "exec-" + uuid;
            String hostPath = (hostPathConfig != null && !hostPathConfig.isBlank())
                    ? hostPathConfig + "/" + uuid
                    : tempDir.toAbsolutePath().toString().replace('\\', '/');

            // Compile all .java files first
            String compileCmd = "find . -name '*.java' > sources.txt && javac @sources.txt 2>&1";

            // Determine which class to run
            String runClass;
            if (activeJava != null) {
                // Read the class name out of the active file's own source
                // rather than assuming it matches the filename. A file
                // like "hhh.java" is free to declare "class abc { ... }"
                // in Java as long as that class isn't public — filename
                // and class name only have to match for public classes.
                runClass = extractRunnableClassName(files.get(activeJava));
                if (runClass == null) {
                    // Nothing recognizable in the file itself — fall back
                    // to the old filename-based guess as a last resort.
                    runClass = activeJava.substring(0, activeJava.length() - 5);
                }
            } else {
                runClass = findMainClass(files);
            }
            if (runClass == null) runClass = "Main";

            // Chain compile and run — if compile fails, stderr contains the errors and we stop
            String runCmd = "java " + runClass;

            ProcessBuilder builder = new ProcessBuilder(
                    "docker", "run", "-i", "--rm",
                    "--name", containerName,
                    "--memory=128m", "--cpus=1", "--network=none",
                    "--user", "nobody",
                    // --pids-limit: caps total processes/threads inside the
                    // container, which --memory alone does not — without
                    // it, a classic fork bomb can exhaust the kernel's
                    // process table before it ever hits the memory cap.
                    "--pids-limit=64",
                    // --read-only + tmpfs: the container's root filesystem
                    // can no longer be written to at all except the two
                    // paths explicitly given scratch space below. /app
                    // still needs to be writable for the compiled .class
                    // files; /tmp is given a small, size-capped tmpfs so
                    // anything a program writes there can't fill the real
                    // host disk (the /app bind mount is still backed by the
                    // host filesystem and has no size cap of its own yet —
                    // see the audit's disk-exhaustion note).
                    "--read-only",
                    "--tmpfs", "/tmp:size=32m,mode=1777",
                    "--ulimit", "nproc=64:64",
                    "--ulimit", "nofile=256:256",
                    "-v", hostPath + ":/app",
                    "java-runner",
                    "sh", "-c",
                    compileCmd + " && " + runCmd
            );

            long startTime = System.currentTimeMillis();
            Process process = builder.start();
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
                    boolean finished = process.waitFor(5, TimeUnit.MINUTES);
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

    /**
     * Finds the class in a single file's source that should be launched:
     * the class whose body contains "static void main", falling back to
     * the public class, then to whichever class is declared first.
     *
     * This deliberately does not assume the class name matches the
     * filename — that's only a Java requirement for public top-level
     * classes, and files here can (and do) declare a single non-public
     * class with any name.
     */
    private String extractRunnableClassName(String content) {
        if (content == null || content.isBlank()) return null;

        java.util.regex.Matcher classMatcher = java.util.regex.Pattern
                .compile("(public\\s+)?(?:final\\s+)?class\\s+(\\w+)")
                .matcher(content);

        int mainIdx = content.indexOf("static void main");

        String firstClass = null;
        String publicClass = null;
        String classBeforeMain = null;

        while (classMatcher.find()) {
            String name = classMatcher.group(2);
            if (firstClass == null) firstClass = name;
            if (classMatcher.group(1) != null) publicClass = name;
            if (mainIdx >= 0 && classMatcher.start() < mainIdx) {
                classBeforeMain = name;
            }
        }

        if (classBeforeMain != null) return classBeforeMain;
        if (publicClass != null) return publicClass;
        return firstClass;
    }

    private String findMainClass(Map<String, String> files) {
        // First: prefer the file whose class name matches its filename (most specific)
        for (String filename : files.keySet()) {
            if (filename.endsWith(".java")) {
                String className = filename.substring(0, filename.length() - 5);
                String content = files.get(filename);
                if (content != null && content.contains("class " + className)) {
                    return className;
                }
            }
        }
        // Second: look for a public class named Main
        for (String filename : files.keySet()) {
            if (filename.endsWith(".java")) {
                String content = files.get(filename);
                if (content != null && content.contains("public class Main")) {
                    return "Main";
                }
            }
        }
        // Third: look for any public class
        for (String filename : files.keySet()) {
            if (filename.endsWith(".java")) {
                String content = files.get(filename);
                if (content != null) {
                    java.util.regex.Matcher m = java.util.regex.Pattern
                            .compile("public\\s+class\\s+(\\w+)")
                            .matcher(content);
                    if (m.find()) {
                        return m.group(1);
                    }
                }
            }
        }
        return null;
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
     * for the short-lived per-execution scratch directory: it's deleted
     * right after the run finishes (see deleteDirectory below), so being
     * world-writable for its brief lifetime isn't a meaningful exposure —
     * nothing else on the host has a reason to be looking at it.
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