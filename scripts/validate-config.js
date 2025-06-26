require('dotenv').config();

const requiredEnvVars = [
    'GEMINI_API_KEY',
    'JWT_SECRET',
    'DB_HOST',
    'DB_NAME',
    'DB_USER',
    'DB_PASSWORD',
    'QDRANT_URL'
];

const optionalEnvVars = [
    'PORT',
    'NODE_ENV',
    'GEMINI_MODEL',
    'EMBEDDING_MODEL',
    'ADMIN_USERNAME',
    'ADMIN_PASSWORD'
];

console.log('🔍 Validating configuration...');

let hasErrors = false;

// Check required variables
requiredEnvVars.forEach(varName => {
    if (!process.env[varName]) {
        console.error(`❌ Missing required environment variable: ${varName}`);
        hasErrors = true;
    } else {
        console.log(`✅ ${varName}: Set`);
    }
});

// Check optional variables
optionalEnvVars.forEach(varName => {
    if (process.env[varName]) {
        console.log(`✅ ${varName}: ${process.env[varName]}`);
    } else {
        console.log(`⚠️  ${varName}: Using default`);
    }
});

// Validate specific configurations
if (process.env.GEMINI_API_KEY && !process.env.GEMINI_API_KEY.startsWith('AI')) {
    console.warn('⚠️  GEMINI_API_KEY format looks incorrect (should start with "AI")');
}

if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    console.warn('⚠️  JWT_SECRET should be at least 32 characters long');
}

if (process.env.PORT && (isNaN(process.env.PORT) || process.env.PORT < 1 || process.env.PORT > 65535)) {
    console.error('❌ PORT must be a valid port number (1-65535)');
    hasErrors = true;
}

if (hasErrors) {
    console.error('\n❌ Configuration validation failed');
    process.exit(1);
} else {
    console.log('\n✅ Configuration validation passed');
}
