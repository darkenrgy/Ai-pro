package com.darkenrgy.login.auth.services;

import com.darkenrgy.login.auth.dtos.ModerationSignalRequest;
import com.darkenrgy.login.auth.dtos.ModerationSignalResponse;

public interface ModerationSignalService {

    ModerationSignalResponse recordSignal(ModerationSignalRequest request);

    ModerationSignalResponse getSignalState(String hashedUserId, String hashedSessionId);
}
