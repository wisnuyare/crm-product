package config

import (
	"log"
	"os"
	"strconv"
)

// Config holds application configuration
type Config struct {
	Port                    string
	Environment             string
	TenantServiceURL        string
	TenantServiceInternalAPIKey string
	ConversationServiceURL  string
	MaxRetries              int
	InitialBackoffSeconds   int
	MaxBackoffSeconds       int
	RequestTimeoutSeconds   int
}

// Load loads configuration from environment variables
func Load() *Config {
	cfg := &Config{
		Port:                    getEnv("PORT", "3006"),
		Environment:             getEnv("ENVIRONMENT", "development"),
		TenantServiceURL:        getEnv("TENANT_SERVICE_URL", "http://tenant-service:3001"),
		TenantServiceInternalAPIKey: getEnv("TENANT_SERVICE_INTERNAL_API_KEY", "dev-internal-key"),
		ConversationServiceURL:  getEnv("CONVERSATION_SERVICE_URL", "http://conversation-service:3004"),
		MaxRetries:              getEnvAsInt("MAX_RETRIES", 3),
		InitialBackoffSeconds:   getEnvAsInt("INITIAL_BACKOFF_SECONDS", 1),
		MaxBackoffSeconds:       getEnvAsInt("MAX_BACKOFF_SECONDS", 30),
		RequestTimeoutSeconds:   getEnvAsInt("REQUEST_TIMEOUT_SECONDS", 10),
	}

	log.Printf("Configuration loaded: Port=%s, Environment=%s", cfg.Port, cfg.Environment)
	return cfg
}

func getEnv(key, defaultValue string) string {
	value := os.Getenv(key)
	if value == "" {
		return defaultValue
	}
	return value
}

func getEnvAsInt(key string, defaultValue int) int {
	valueStr := os.Getenv(key)
	if valueStr == "" {
		return defaultValue
	}
	value, err := strconv.Atoi(valueStr)
	if err != nil {
		log.Printf("Warning: Invalid integer for %s, using default %d", key, defaultValue)
		return defaultValue
	}
	return value
}
