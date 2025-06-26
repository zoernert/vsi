const { DatabaseService } = require('./databaseService');
const databaseConfig = require('../config/database');

class UserService {
    constructor() {
        this.db = new DatabaseService(databaseConfig);
    }

    // Maintain exact same interface as before for backward compatibility
    async loadUsers() {
        const users = await this.db.getAllUsers();
        // Convert to old format for compatibility
        const userMap = {};
        users.forEach(user => {
            userMap[user.username] = {
                password: user.password,
                id: user.id,
                isAdmin: user.is_admin,
                createdAt: user.created_at,
                createdBy: user.created_by,
                tier: user.tier // New field
            };
        });
        return userMap;
    }

    async getUser(username) {
        return await this.db.getUser(username);
    }

    async createUser(userData) {
        return await this.db.createUser(userData);
    }

    async updateUser(username, updates) {
        return await this.db.updateUser(username, updates);
    }

    async deleteUser(username) {
        return await this.db.deleteUser(username);
    }

    // New methods for tier management
    async getUserTier(userId) {
        return await this.db.getUserTier(userId);
    }

    async updateUserTier(userId, tier) {
        return await this.db.updateUser(userId, { tier });
    }
}

module.exports = { UserService };
