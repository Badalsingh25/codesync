package com.cbc.dto.room;

import java.util.Set;

public record RoomStateResponse(
        String primaryHostEmail,
        Set<String> coHosts,
        boolean locked,
        boolean readOnly
) {}