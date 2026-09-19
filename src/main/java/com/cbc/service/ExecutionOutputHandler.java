// ExecutionOutputHandler.java
package com.cbc.service;

public interface ExecutionOutputHandler {
    void onOutput(String chunk, boolean isError);
    void onExit(int exitCode, long executionTimeMs);
}