const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { ValidationError, UnauthorizedError, NotFoundError } = require('../../utils/errorHandler');
const { createContextLogger } = require('../../utils/logger');

class UserApplicationService {
  constructor(userRepository, config) {
    this.userRepository = userRepository;
    this.config = config;
    this.logger = createContextLogger('UserApplicationService');
  }

  async registerUser(userData) {
    const { username, email, password } = userData;

    // Check if user already exists
    const existingUser = await this.userRepository.findByUsername(username);
    if (existingUser) {
      throw new ValidationError('Username already exists');
    }

    const existingEmail = await this.userRepository.findByEmail(email);
    if (existingEmail) {
      throw new ValidationError('Email already exists');
    }

    // Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create user
    const newUser = await this.userRepository.createUser({
      username,
      email,
      password: hashedPassword,
      isAdmin: false,
      tier: 'free'
    });

    this.logger.info('User registered successfully', { userId: newUser.id, username });

    // Remove password from response
    const { password: _, ...userResponse } = newUser;
    return userResponse;
  }

  async authenticateUser(username, password) {
    const user = await this.userRepository.findByUsername(username);
    if (!user) {
      throw new UnauthorizedError('Invalid credentials');
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      throw new UnauthorizedError('Invalid credentials');
    }

    // Update last login
    await this.userRepository.updateLastLogin(user.id);

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: user.id, 
        username: user.username, 
        isAdmin: user.is_admin,
        tier: user.tier 
      },
      this.config.auth.jwtSecret,
      { expiresIn: this.config.auth.tokenExpiry }
    );

    this.logger.info('User authenticated successfully', { userId: user.id, username });

    // Remove password from response
    const { password: _, ...userResponse } = user;
    
    return {
      user: userResponse,
      token
    };
  }

  async getUserProfile(userId) {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError('User');
    }

    const stats = await this.userRepository.getUserStats(userId);

    // Remove password from response
    const { password: _, ...userProfile } = user;
    
    return {
      ...userProfile,
      stats
    };
  }

  async updateUserProfile(userId, updateData) {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError('User');
    }

    // Check email uniqueness if email is being updated
    if (updateData.email && updateData.email !== user.email) {
      const existingEmail = await this.userRepository.findByEmail(updateData.email);
      if (existingEmail) {
        throw new ValidationError('Email already exists');
      }
    }

    const updatedUser = await this.userRepository.update(userId, updateData);
    
    this.logger.info('User profile updated', { userId, updatedFields: Object.keys(updateData) });

    // Remove password from response
    const { password: _, ...userResponse } = updatedUser;
    return userResponse;
  }

  async changePassword(userId, currentPassword, newPassword) {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError('User');
    }

    const isValidPassword = await bcrypt.compare(currentPassword, user.password);
    if (!isValidPassword) {
      throw new UnauthorizedError('Current password is incorrect');
    }

    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    await this.userRepository.update(userId, { password: hashedPassword });
    
    this.logger.info('User password changed', { userId });

    return { message: 'Password updated successfully' };
  }

  async deleteUser(userId) {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError('User');
    }

    await this.userRepository.delete(userId);
    
    this.logger.info('User deleted', { userId, username: user.username });

    return { message: 'User deleted successfully' };
  }

  async getActiveUsers(days = 30) {
    return await this.userRepository.findActiveUsers(days);
  }

  verifyToken(token) {
    try {
      return jwt.verify(token, this.config.auth.jwtSecret);
    } catch (error) {
      throw new UnauthorizedError('Invalid or expired token');
    }
  }
}

module.exports = UserApplicationService;
