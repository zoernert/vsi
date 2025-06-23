const TIER_LIMITS = {
    free: {
        documents: 100,
        storage_bytes: 500 * 1024 * 1024, // 500MB
        api_calls_monthly: 1000,
        collections: 3,
        max_file_size: 10 * 1024 * 1024, // 10MB
        features: ['basic_search', 'file_upload', 'simple_qa']
    },
    starter: {
        documents: 1000,
        storage_bytes: 5 * 1024 * 1024 * 1024, // 5GB
        api_calls_monthly: 10000,
        collections: 10,
        max_file_size: 50 * 1024 * 1024, // 50MB
        features: ['basic_search', 'file_upload', 'simple_qa', 'priority_processing']
    },
    professional: {
        documents: 10000,
        storage_bytes: 50 * 1024 * 1024 * 1024, // 50GB
        api_calls_monthly: 100000,
        collections: 50,
        max_file_size: 200 * 1024 * 1024, // 200MB
        features: ['basic_search', 'file_upload', 'advanced_qa', 'analytics', 'priority_support']
    },
    enterprise: {
        documents: 100000,
        storage_bytes: 500 * 1024 * 1024 * 1024, // 500GB
        api_calls_monthly: 1000000,
        collections: 1000,
        max_file_size: 1024 * 1024 * 1024, // 1GB
        features: ['all_features', 'white_label', 'dedicated_support']
    },
    unlimited: {
        documents: Infinity,
        storage_bytes: Infinity,
        api_calls_monthly: Infinity,
        collections: Infinity,
        max_file_size: Infinity,
        features: ['all_features']
    }
};

module.exports = { TIER_LIMITS };
