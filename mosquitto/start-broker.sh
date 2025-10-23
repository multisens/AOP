#!/bin/bash

# This script starts the Mosquitto MQTT Broker with the specified config file.

# Get absolute path of the script directory and config file
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_PATH="$SCRIPT_DIR/mosquitto.conf"

# Check if config file exists
if [[ ! -f "$CONFIG_PATH" ]]; then
    echo "Error: Config file not found at $CONFIG_PATH" >&2
    exit 1
fi

echo "Using config file: $CONFIG_PATH"

# Function to wait for broker readiness (both MQTT and WebSockets)
wait_for_broker() {
    local max_attempts=30
    local attempt=1
    local mqtt_ready=false
    local websockets_ready=false
    
    echo "Waiting for Mosquitto broker to start..."
    
    while [[ $attempt -le $max_attempts ]]; do
        # Test MQTT port (1883)
        if nc -z localhost 1883 2>/dev/null; then
            if [[ "$mqtt_ready" == false ]]; then
                echo "MQTT port (1883) is ready"
                mqtt_ready=true
            fi
        else
            mqtt_ready=false
        fi
        
        # Test WebSockets port (9001)
        if nc -z localhost 9001 2>/dev/null; then
            if [[ "$websockets_ready" == false ]]; then
                echo "WebSockets port (9001) is ready"
                websockets_ready=true
            fi
        else
            websockets_ready=false
        fi
        
        # Check if both ports are ready
        if [[ "$mqtt_ready" == true && "$websockets_ready" == true ]]; then
            echo "Broker is fully ready (MQTT + WebSockets)!"
            return 0
        fi
        
        echo "Attempt $attempt/$max_attempts: Waiting for all services..."
        sleep 2
        ((attempt++))
    done
    
    echo "Error: Broker failed to start all services in time" >&2
    echo "MQTT ready: $mqtt_ready, WebSockets ready: $websockets_ready" >&2
    return 1
}

# Start broker based on OS
if [[ "$(uname)" == "Darwin" ]]; then
    echo "MacOS - Starting Mosquitto broker..."
    /opt/homebrew/sbin/mosquitto -c "$CONFIG_PATH" &
    BROKER_PID=$!
elif [[ "$(uname)" == "Linux" ]]; then
    echo "Linux - Starting Mosquitto broker..."
    /usr/bin/mosquitto -c "$CONFIG_PATH" &
    BROKER_PID=$!
else
    echo "Unsupported OS"
    exit 1
fi

echo "Broker PID: $BROKER_PID"

# Wait for broker to be ready
if wait_for_broker; then
    echo "Mosquitto broker started successfully with MQTT and WebSockets support"
    # Wait for broker process to complete
    wait $BROKER_PID
    exit $?
else
    echo "Failed to start broker properly" >&2
    kill $BROKER_PID 2>/dev/null
    exit 1
fi