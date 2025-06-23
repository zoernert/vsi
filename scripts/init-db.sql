-- Initialize database schema
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Migrate existing users from JSON to database
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    is_admin BOOLEAN DEFAULT FALSE,
    tier VARCHAR(20) DEFAULT 'free',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    created_by VARCHAR(255),
    stripe_customer_id VARCHAR(255)
);

-- User subscriptions
CREATE TABLE user_subscriptions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    tier VARCHAR(20) NOT NULL DEFAULT 'free',
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    stripe_subscription_id VARCHAR(255),
    stripe_price_id VARCHAR(255),
    current_period_start TIMESTAMP,
    current_period_end TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Usage tracking
CREATE TABLE usage_tracking (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    resource_type VARCHAR(50) NOT NULL, -- 'api_calls', 'storage_bytes', 'documents', 'collections'
    amount BIGINT NOT NULL DEFAULT 1,
    endpoint VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW(),
    date DATE DEFAULT CURRENT_DATE
);

-- Create indexes for performance
CREATE INDEX idx_usage_tracking_user_date ON usage_tracking(user_id, date);
CREATE INDEX idx_usage_tracking_user_resource ON usage_tracking(user_id, resource_type);
CREATE INDEX idx_user_subscriptions_user_id ON user_subscriptions(user_id);
CREATE INDEX idx_users_username ON users(username);

-- Create view for current usage
CREATE VIEW current_month_usage AS
SELECT 
    user_id,
    resource_type,
    SUM(amount) as total_usage,
    DATE_TRUNC('month', CURRENT_DATE) as month
FROM usage_tracking 
WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)
GROUP BY user_id, resource_type;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to automatically update updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_subscriptions_updated_at BEFORE UPDATE ON user_subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
