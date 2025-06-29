#!/usr/bin/env node

/**
 * Comprehensive Admin Features Test
 * Tests all admin functionality with the stromdao admin user
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

class AdminTester {
  constructor() {
    this.baseURL = 'http://localhost:3000';
    this.adminToken = null;
    this.testResults = [];
  }

  log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const icons = {
      info: 'ℹ️ ',
      success: '✅',
      error: '❌',
      warning: '⚠️ ',
      test: '🧪',
      admin: '👑'
    };
    console.log(`${icons[type]} ${message}`);
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async testEndpoint(method, endpoint, data = null, description = '') {
    try {
      const config = {
        method: method.toLowerCase(),
        url: `${this.baseURL}${endpoint}`,
        headers: {}
      };

      if (this.adminToken) {
        config.headers.Authorization = `Bearer ${this.adminToken}`;
      }

      if (data) {
        config.data = data;
        config.headers['Content-Type'] = 'application/json';
      }

      const response = await axios(config);
      
      this.testResults.push({
        endpoint,
        method,
        status: response.status,
        success: true,
        description
      });

      this.log(`${method} ${endpoint} - ${response.status} - ${description}`, 'success');
      return response.data;
    } catch (error) {
      const status = error.response?.status || 'Network Error';
      this.testResults.push({
        endpoint,
        method,
        status,
        success: false,
        description,
        error: error.message
      });

      this.log(`${method} ${endpoint} - ${status} - ${description} - ${error.message}`, 'error');
      throw error;
    }
  }

  async authenticateAdmin() {
    this.log('🔐 Authenticating with admin credentials', 'admin');
    
    try {
      const response = await this.testEndpoint(
        'POST', 
        '/api/v1/auth/login',
        { username: 'admin', password: 'admin' },
        'Admin login'
      );

      if (response.token) {
        this.adminToken = response.token;
        this.log(`Admin authenticated successfully - User ID: ${response.user.id}`, 'success');
        this.log(`Admin status: ${response.user.isAdmin ? 'Yes' : 'No'}`, 'info');
        return true;
      } else {
        throw new Error('No token received');
      }
    } catch (error) {
      this.log(`Admin authentication failed: ${error.message}`, 'error');
      return false;
    }
  }

  async testAdminDashboard() {
    this.log('📊 Testing Admin Dashboard', 'test');
    
    try {
      const dashboard = await this.testEndpoint(
        'GET',
        '/api/admin/dashboard',
        null,
        'Get admin dashboard'
      );

      this.log(`Dashboard loaded - Users: ${dashboard.userCount || 'N/A'}, Collections: ${dashboard.collectionCount || 'N/A'}`, 'info');
      return dashboard;
    } catch (error) {
      this.log(`Dashboard test failed: ${error.message}`, 'error');
      return null;
    }
  }

  async testSystemHealth() {
    this.log('🏥 Testing System Health', 'test');
    
    try {
      const health = await this.testEndpoint(
        'GET',
        '/api/admin/system/health',
        null,
        'Get system health'
      );

      this.log(`System health: ${health.status || 'Unknown'}`, 'info');
      return health;
    } catch (error) {
      this.log(`Health check failed: ${error.message}`, 'error');
      return null;
    }
  }

  async testUserManagement() {
    this.log('👥 Testing User Management', 'test');
    
    try {
      // Get all users
      const users = await this.testEndpoint(
        'GET',
        '/api/admin/users',
        null,
        'List all users'
      );

      this.log(`Found ${users.length || 0} users in system`, 'info');

      // Get active users
      const activeUsers = await this.testEndpoint(
        'GET',
        '/api/admin/users/active',
        null,
        'Get active users'
      );

      this.log(`Found ${activeUsers.length || 0} active users`, 'info');

      // Test creating a user (we'll delete it afterwards)
      const testUser = {
        username: `test_admin_${Date.now()}`,
        password: 'TestPassword123',
        email: 'test@example.com',
        tier: 'free'
      };

      const createdUser = await this.testEndpoint(
        'POST',
        '/api/admin/users',
        testUser,
        'Create test user'
      );

      this.log(`Created test user: ${createdUser.username}`, 'success');

      // Update the test user
      const updatedUser = await this.testEndpoint(
        'PUT',
        `/api/admin/users/${testUser.username}`,
        { tier: 'pro' },
        'Update test user'
      );

      this.log(`Updated test user tier to: ${updatedUser.tier}`, 'success');

      // Delete the test user
      await this.testEndpoint(
        'DELETE',
        `/api/admin/users/${testUser.username}`,
        null,
        'Delete test user'
      );

      this.log(`Deleted test user: ${testUser.username}`, 'success');

      return { users, activeUsers };
    } catch (error) {
      this.log(`User management test failed: ${error.message}`, 'error');
      return null;
    }
  }

  async testAnalytics() {
    this.log('📈 Testing Analytics Endpoints', 'test');
    
    const analyticsEndpoints = [
      { path: '/api/admin/analytics/monthly', description: 'Monthly analytics' },
      { path: '/api/admin/analytics/top-users', description: 'Top users' },
      { path: '/api/admin/analytics/collections', description: 'Collection analytics' },
      { path: '/api/admin/analytics/endpoints', description: 'Endpoint usage' },
      { path: '/api/admin/analytics/user-growth', description: 'User growth' },
      { path: '/api/admin/analytics/storage', description: 'Storage analytics' }
    ];

    const results = {};

    for (const endpoint of analyticsEndpoints) {
      try {
        const data = await this.testEndpoint(
          'GET',
          endpoint.path,
          null,
          endpoint.description
        );
        results[endpoint.path] = data;
        this.log(`${endpoint.description}: OK`, 'success');
      } catch (error) {
        this.log(`${endpoint.description}: Failed - ${error.message}`, 'error');
        results[endpoint.path] = null;
      }
    }

    return results;
  }

  async testUserAnalytics() {
    this.log('📊 Testing Per-User Analytics', 'test');
    
    try {
      // First get a user ID to test with
      const users = await this.testEndpoint(
        'GET',
        '/api/admin/users',
        null,
        'Get users for analytics test'
      );

      if (users && users.length > 0) {
        const userId = users[0].id;
        const userAnalytics = await this.testEndpoint(
          'GET',
          `/api/admin/users/${userId}/analytics`,
          null,
          `Get analytics for user ${userId}`
        );

        this.log(`User analytics retrieved for user ${userId}`, 'success');
        return userAnalytics;
      } else {
        this.log('No users found for analytics testing', 'warning');
        return null;
      }
    } catch (error) {
      this.log(`User analytics test failed: ${error.message}`, 'error');
      return null;
    }
  }

  async generateReport() {
    this.log('📋 Generating Test Report', 'info');
    
    const totalTests = this.testResults.length;
    const passedTests = this.testResults.filter(t => t.success).length;
    const failedTests = totalTests - passedTests;
    const successRate = totalTests > 0 ? ((passedTests / totalTests) * 100).toFixed(1) : 0;

    console.log('\n' + '='.repeat(80));
    console.log('📊 ADMIN FEATURES TEST REPORT');
    console.log('='.repeat(80));
    console.log(`📈 Total Tests: ${totalTests}`);
    console.log(`✅ Passed: ${passedTests}`);
    console.log(`❌ Failed: ${failedTests}`);
    console.log(`📊 Success Rate: ${successRate}%`);
    console.log('='.repeat(80));

    if (failedTests > 0) {
      console.log('\n❌ Failed Tests:');
      this.testResults
        .filter(t => !t.success)
        .forEach(test => {
          console.log(`   ${test.method} ${test.endpoint} - ${test.status} - ${test.description}`);
          if (test.error) {
            console.log(`      Error: ${test.error}`);
          }
        });
    }

    console.log('\n✅ Passed Tests:');
    this.testResults
      .filter(t => t.success)
      .forEach(test => {
        console.log(`   ${test.method} ${test.endpoint} - ${test.status} - ${test.description}`);
      });

    console.log('\n' + '='.repeat(80));
    
    if (successRate >= 90) {
      this.log('🎉 Admin implementation is working excellently!', 'success');
    } else if (successRate >= 75) {
      this.log('✅ Admin implementation is working well with minor issues', 'success');
    } else {
      this.log('⚠️  Admin implementation needs attention', 'warning');
    }
  }

  async run() {
    try {
      this.log('🚀 Starting Comprehensive Admin Features Test', 'admin');
      this.log(`📡 Backend URL: ${this.baseURL}`, 'info');
      this.log(`⏰ Test started at: ${new Date().toISOString()}`, 'info');

      // Step 1: Authenticate
      const authSuccess = await this.authenticateAdmin();
      if (!authSuccess) {
        this.log('❌ Cannot proceed without admin authentication', 'error');
        return;
      }

      // Step 2: Test Dashboard
      await this.testAdminDashboard();

      // Step 3: Test System Health
      await this.testSystemHealth();

      // Step 4: Test User Management
      await this.testUserManagement();

      // Step 5: Test Analytics
      await this.testAnalytics();

      // Step 6: Test User Analytics
      await this.testUserAnalytics();

      // Step 7: Generate Report
      await this.generateReport();

    } catch (error) {
      this.log(`Test suite failed: ${error.message}`, 'error');
      console.error(error);
    }
  }
}

// Run the test if this script is executed directly
if (require.main === module) {
  const tester = new AdminTester();
  tester.run().catch(console.error);
}

module.exports = AdminTester;
