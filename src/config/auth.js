module.exports = {
  jwt: {
    secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    issuer: process.env.JWT_ISSUER || 'vsi-vector-store',
    audience: process.env.JWT_AUDIENCE || 'vsi-users'
  },
  
  password: {
    minLength: 8,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: true,
    saltRounds: 12
  },
  
  session: {
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    rolling: true,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production'
  },
  
  rateLimiting: {
    login: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 5, // 5 attempts per window
      skipSuccessfulRequests: true
    },
    register: {
      windowMs: 60 * 60 * 1000, // 1 hour
      max: 3 // 3 registrations per hour per IP
    }
  },
  
  registration: {
    allowSelfRegistration: process.env.ALLOW_SELF_REGISTRATION === 'true',
    requireEmailVerification: process.env.REQUIRE_EMAIL_VERIFICATION === 'true',
    defaultTier: 'free'
  }
};
