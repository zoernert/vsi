# Session Restart Functionality

## Overview

The VSI Agent System now supports restarting completed, failed, stopped, or error sessions. This allows users to re-run research sessions with fresh agents while optionally preserving certain data from previous runs.

## Features

### Backend Implementation

- **AgentService.restartSession()**: Core restart logic with configurable options
- **REST API**: `/POST /api/agents/sessions/:sessionId/restart` endpoint
- **Memory Management**: Optional clearing of agent memory and artifacts
- **State Validation**: Ensures sessions are in restartable state before proceeding

### Frontend Implementation

- **Session Detail View**: Restart button for terminal state sessions
- **Session List**: Restart buttons on session cards for completed/failed sessions
- **Options Modal**: User-friendly interface for configuring restart options
- **Real-time Updates**: Live status updates during restart process

### CLI Support

- **restart-session command**: Full CLI support with all options
- **Flexible Configuration**: Command-line flags for all restart options

## Usage

### Web Interface

1. Navigate to a completed, failed, stopped, or error session
2. Click the "Restart" button
3. Configure restart options in the modal:
   - **Clear artifacts**: Remove all previous research outputs
   - **Preserve source discovery**: Keep previously found sources (requires clearing artifacts)
   - **Clear agent memory**: Remove agent learning from previous runs
4. Click "Restart Session" to begin

### CLI Usage

```bash
# Basic restart
node agent-cli.js restart-session <session-id>

# Restart with specific options
node agent-cli.js restart-session <session-id> \
  --clear-artifacts \
  --preserve-sources \
  --clear-memory \
  --agents "orchestrator,source_discovery,content_analysis"

# Restart with user specification
node agent-cli.js restart-session <session-id> --user "user-123"
```

### API Usage

```javascript
// POST /api/agents/sessions/:sessionId/restart
{
  "clearArtifacts": true,
  "preserveSourceDiscovery": false,
  "clearMemory": false,
  "agentTypes": ["orchestrator", "source_discovery"]
}
```

## Restart Options

| Option | Description | Default |
|--------|-------------|---------|
| `clearArtifacts` | Remove all previous research outputs and artifacts | `true` |
| `preserveSourceDiscovery` | Keep source discovery artifacts (only if clearing artifacts) | `false` |
| `clearMemory` | Clear all agent memory and learning from previous runs | `false` |
| `agentTypes` | Specify which agent types to start (optional) | From session preferences |

## State Management

### Restartable States
- `completed`: Session finished successfully
- `failed`: Session completed with failures
- `error`: Session stopped due to errors
- `stopped`: Session manually stopped

### Restart Process
1. **Validation**: Verify session is in restartable state
2. **Cleanup**: Stop any remaining agents
3. **Data Management**: Clear artifacts/memory based on options
4. **Reset**: Set session status to "created"
5. **Launch**: Start fresh agents with original configuration
6. **Monitoring**: Broadcast status updates to connected clients

## Error Handling

- **State Validation**: Cannot restart running or paused sessions
- **Permission Checks**: User must own the session
- **Graceful Degradation**: Non-critical failures (like missing memory table) are logged but don't fail the restart
- **Rollback**: If restart fails, session status is set to "error" with details

## Memory Management

When `clearMemory` is enabled:
- All agent memory for the session is deleted
- Learning and context from previous runs is lost
- Agents start with completely fresh state

When `clearArtifacts` is enabled:
- All research outputs are removed
- Progress tracking is reset
- Option to preserve source discovery artifacts

## Integration

The restart functionality integrates seamlessly with:
- Real-time status updates via Server-Sent Events
- Session management UI
- Agent lifecycle management
- Progress tracking
- Artifact management
- Inter-agent communication

## Best Practices

1. **Clear artifacts** for fresh analysis of the same topic
2. **Preserve sources** when you want to speed up re-analysis
3. **Clear memory** when agent behavior seemed problematic
4. **Monitor logs** during restart to ensure smooth operation
