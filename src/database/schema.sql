-- Real database schema for production
CREATE TABLE IF NOT EXISTS user_operations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_op_hash VARCHAR(66) UNIQUE NOT NULL,
    sender VARCHAR(42) NOT NULL,
    nonce VARCHAR(66) NOT NULL,
    call_data TEXT NOT NULL,
    call_gas_limit VARCHAR(66) NOT NULL,
    verification_gas_limit VARCHAR(66) NOT NULL,
    pre_verification_gas VARCHAR(66) NOT NULL,
    max_fee_per_gas VARCHAR(66) NOT NULL,
    max_priority_fee_per_gas VARCHAR(66) NOT NULL,
    paymaster_and_data TEXT,
    signature TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK(status IN ('pending', 'submitted', 'confirmed', 'failed')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    submitted_at DATETIME,
    confirmed_at DATETIME,
    tx_hash VARCHAR(66),
    gas_used VARCHAR(66),
    gas_cost VARCHAR(66),
    error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_user_operations_sender ON user_operations(sender);
CREATE INDEX IF NOT EXISTS idx_user_operations_status ON user_operations(status);
CREATE INDEX IF NOT EXISTS idx_user_operations_created ON user_operations(created_at);

CREATE TABLE IF NOT EXISTS bundles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bundle_hash VARCHAR(66) UNIQUE NOT NULL,
    tx_hash VARCHAR(66) NOT NULL,
    user_op_count INTEGER NOT NULL,
    total_gas_used VARCHAR(66),
    total_gas_cost VARCHAR(66),
    status VARCHAR(20) DEFAULT 'pending' CHECK(status IN ('pending', 'submitted', 'confirmed', 'failed')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    submitted_at DATETIME,
    confirmed_at DATETIME,
    block_number INTEGER
);

CREATE TABLE IF NOT EXISTS bundle_user_operations (
    bundle_id INTEGER NOT NULL,
    user_op_hash VARCHAR(66) NOT NULL,
    position INTEGER NOT NULL,
    PRIMARY KEY (bundle_id, user_op_hash),
    FOREIGN KEY (bundle_id) REFERENCES bundles(id) ON DELETE CASCADE,
    FOREIGN KEY (user_op_hash) REFERENCES user_operations(user_op_hash) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS chain_status (
    id INTEGER PRIMARY KEY CHECK(id = 1),
    chain_id INTEGER NOT NULL,
    current_block INTEGER NOT NULL,
    base_fee VARCHAR(66) NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
