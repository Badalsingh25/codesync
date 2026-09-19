package com.cbc.service;

import java.util.Map;

public interface InteractiveCodeExecutor {
    void start(String roomId, Map<String, String> files, String activeFile, ExecutionOutputHandler handler);
}