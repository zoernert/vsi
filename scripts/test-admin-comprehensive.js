#!/usr/bin/env node

/**
 * Comprehensive Admin Functionality Test
 * Tests all admin endpoints and features with real admin credentials
 */

const axios = require('axios');

class AdminTester {
  constructor() {
    this.baseUrl = 'http://localhost:3000';
    this.token = null;
    this.adminUser = {
      username: 'admin',
      password: 'admin'
    };
  }

  async login() {
    console.log('🔑 Logging in as admin user...');
    try {
      const response = await axios.post(`${this.baseUrl}/api/auth/login`, this.adminUser);
      
      if (response.data.success) {
        this.token = response.data.token;
        console.log('✅ Admin login successful');
        console.log(`📊 User ID: ${response.data.user.id}`);
        console.log(`📊 Username: ${response.data.user.username}`);
        console.log(`📊 Admin Status: ${response.data.user.isAdmin ? 'Yes' : 'No'}`);
        console.log(`📊 Tier: ${response.data.user.tier}`);
        return true;
      } else {
        console.log('❌ Login failed:', response.data.message);
        return false;
      }
    } catch (error) {
      console.log('❌ Login error:', error.response?.data?.message || error.message);
      return false;
    }
  }

  getAuthHeaders() {
    return {
      'Authorization': `Bearer ${this.token}`,
      'Content-Type': 'application/json'
    };
  }

  async testHealthEndpoint() {
    console.log('\n📋 Testing Health Endpoint');
    console.log('──────────────────────────────────────');
    
    try {
      const response = await axios.get(`${this.baseUrl}/api/health`);
      console.log('✅ Health endpoint accessible');
      console.log(`📊 Status: ${response.data.success ? 'Healthy' : 'Unhealthy'}`);
      console.log(`📊 Message: ${response.data.message}`);
      console.log(`📊 Timestamp: ${response.data.timestamp}`);
      return true;
    } catch (error) {
      console.log('❌ Health endpoint failed:', error.response?.data || error.message);
      return false;
    }
  }

  async testAdminDashboard() {
    console.log('\n📋 Testing Admin Dashboard');
    console.log('──────────────────────────────────────');
    
    try {
      const response = await axios.get(`${this.baseUrl}/api/admin/dashboard`, {
        headers: this.getAuthHeaders()
      });
      
      console.log('✅ Admin dashboard accessible');
      const data = response.data.data;
      console.log(`📊 Total Users: ${data.totalUsers}`);
      console.log(`📊 Active Users: ${data.activeUsers}`);
      console.log(`📊 Total Collections: ${data.totalCollections}`);
      console.log(`📊 Total Documents: ${data.totalDocuments}`);
      console.log(`📊 Storage Used: ${data.storageUsed}`);
      return true;
    } catch (error) {
      console.log('❌ Admin dashboard failed:', error.response?.data || error.message);
      return false;
    }
  }

  async testUserManagement() {
    console.log('\n📋 Testing User Management');
    console.log('──────────────────────────────────────');
    
    try {
      // Get all users
      const usersResponse = await axios.get(`${this.baseUrl}/api/admin/users`, {
        headers: this.getAuthHeaders()
      });
      
      console.log('✅ User list retrieved');
      console.log(`📊 Total Users: ${usersResponse.data.data.length}`);
      
      const users = usersResponse.data.data;
      users.slice(0, 3).forEach((user, index) => {
        console.log(`📊 User ${index + 1}: ${user.username} (${user.tier}, Admin: ${user.isAdmin})`);
      });

      // Test creating a new user
      const testUser = {
        username: `testuser_${Date.now()}`,
        password: 'TestPassword123',
        email: 'test@example.com',
        tier: 'free',
        isAdmin: false
      };

      console.log('\n🔧 Testing user creation...');
      const createResponse = await axios.post(`${this.baseUrl}/api/admin/users`, testUser, {
        headers: this.getAuthHeaders()
      });

      if (createResponse.data.success) {
        console.log('✅ User creation successful');
        const createdUser = createResponse.data.data;
        console.log(`📊 Created User ID: ${createdUser.id}`);
        console.log(`📊 Created Username: ${createdUser.username}`);

        // Test updating the user
        console.log('\n🔧 Testing user update...');
        const updateResponse = await axios.put(`${this.baseUrl}/api/admin/users/${createdUser.username}`, {
          tier: 'pro',
          email: 'updated@example.com'
        }, {
          headers: this.getAuthHeaders()
        });

        if (updateResponse.data.success) {
          console.log('✅ User update successful');
          console.log(`📊 Updated Tier: ${updateResponse.data.data.tier}`);
        }

        // Test deleting the user
        console.log('\n🔧 Testing user deletion...');
        const deleteResponse = await axios.delete(`${this.baseUrl}/api/admin/users/${createdUser.username}`, {
          headers: this.getAuthHeaders()
        });

        if (deleteResponse.data.success) {
          console.log('✅ User deletion successful');
        }
      }

      return true;
    } catch (error) {
      console.log('❌ User management test failed:', error.response?.data || error.message);
      return false;
    }
  }

  async testAnalytics() {
    console.log('\n📋 Testing Analytics Endpoints');
    console.log('──────────────────────────────────────');
    
    const analyticsEndpoints = [
      { name: 'Monthly Analytics', path: '/api/admin/analytics/monthly' },
      { name: 'Top Users', path: '/api/admin/analytics/top-users' },
      { name: 'Collections Analytics', path: '/api/admin/analytics/collections' },
      { name: 'Endpoint Usage', path: '/api/admin/analytics/endpoints' },
      { name: 'User Growth', path: '/api/admin/analytics/user-growth' },
      { name: 'Storage Analytics', path: '/api/admin/analytics/storage' }
    ];

    let successCount = 0;
    
    for (const endpoint of analyticsEndpoints) {
      try {
        const response = await axios.get(`${this.baseUrl}${endpoint.path}`, {
          headers: this.getAuthHeaders()
        });
        
        console.log(`✅ ${endpoint.name}: Working`);
        if (response.data.data && Array.isArray(response.data.data)) {
          console.log(`   📊 Data points: ${response.data.data.length}`);
        } else if (response.data.data && typeof response.data.data === 'object') {
          console.log(`   📊 Data keys: ${Object.keys(response.data.data).length}`);
        }
        successCount++;
      } catch (error) {
        console.log(`❌ ${endpoint.name}: Failed (${error.response?.status || 'Network Error'})`);
      }
    }

    console.log(`\n📊 Analytics Summary: ${successCount}/${analyticsEndpoints.length} endpoints working`);
    return successCount === analyticsEndpoints.length;
  }

  async testSystemHealth() {
    console.log('\n📋 Testing System Health');
    console.log('──────────────────────────────────────');
    
    try {
      const response = await axios.get(`${this.baseUrl}/api/admin/system/health`, {
        headers: this.getAuthHeaders()
      });
      
      console.log('✅ System health check accessible');
      const health = response.data.data;
      
      console.log(`📊 Database Status: ${health.database?.status || 'Unknown'}`);
      console.log(`📊 Usage Tracking: ${health.usageTracking?.events24h || 0} events (24h)`);
      console.log(`📊 Uptime: ${Math.round(health.uptime || 0)} seconds`);
      
      return true;
    } catch (error) {
      console.log('❌ System health check failed:', error.response?.data || error.message);
      return false;
    }
  }

  async testUserAnalytics() {
    console.log('\n📋 Testing Per-User Analytics');
    console.log('──────────────────────────────────────');
    
    try {
      // First get the list of users to test analytics for one
      const usersResponse = await axios.get(`${this.baseUrl}/api/admin/users`, {
        headers: this.getAuthHeaders()
      });
      
      if (usersResponse.data.data.length > 0) {
        const testUser = usersResponse.data.data[0];
        
        const analyticsResponse = await axios.get(`${this.baseUrl}/api/admin/users/${testUser.id}/analytics`, {
          headers: this.getAuthHeaders()
        });
        
        console.log('✅ User analytics accessible');
        console.log(`📊 Testing analytics for user: ${testUser.username}`);
        const analytics = analyticsResponse.data.data;
        console.log(`📊 Collections: ${analytics.collections || 0}`);
        console.log(`📊 Documents: ${analytics.documents || 0}`);
        console.log(`📊 Searches: ${analytics.searches || 0}`);
        console.log(`📊 Last Activity: ${analytics.lastActivity || 'N/A'}`);
        
        return true;
      } else {
        console.log('⚠️ No users found to test analytics');
        return true;
      }
    } catch (error) {
      console.log('❌ User analytics test failed:', error.response?.data || error.message);
      return false;
    }
  }

  async testAdminSecurity() {
    console.log('\n📋 Testing Admin Security');
    console.log('──────────────────────────────────────');
    
    try {
      // Test admin-only endpoint without token
      console.log('🔧 Testing admin endpoint without authentication...');
      try {
        await axios.get(`${this.baseUrl}/api/admin/dashboard`);
        console.log('❌ Security failure: Admin endpoint accessible without auth');
        return false;
      } catch (error) {
        if (error.response?.status === 401) {
          console.log('✅ Security check passed: Admin endpoint requires authentication');
        } else {
          console.log('⚠️ Unexpected error testing security:', error.response?.status);
        }
      }

      // Test that regular user endpoints work with admin token
      console.log('🔧 Testing user endpoints with admin token...');
      const profileResponse = await axios.get(`${this.baseUrl}/api/users/profile`, {
        headers: this.getAuthHeaders()
      });
      
      if (profileResponse.data.success) {
        console.log('✅ Admin can access user endpoints');
      }

      return true;
    } catch (error) {
      console.log('❌ Admin security test failed:', error.response?.data || error.message);
      return false;
    }
  }

  async testInputValidation() {
    console.log('\n📋 Testing Input Validation');
    console.log('──────────────────────────────────────');
    
    try {
      // Test invalid user creation
      console.log('🔧 Testing invalid user creation...');
      try {
        await axios.post(`${this.baseUrl}/api/admin/users`, {
          username: 'x', // Too short
          password: '123', // Too short
          tier: 'invalid' // Invalid tier
        }, {
          headers: this.getAuthHeaders()
        });
        console.log('❌ Validation failure: Invalid user creation succeeded');
        return false;
      } catch (error) {
        if (error.response?.status === 400) {
          console.log('✅ Input validation working: Invalid user creation rejected');
          console.log(`📊 Validation errors: ${error.response.data.errors?.length || 'Unknown'}`);
        } else {
          console.log('⚠️ Unexpected validation response:', error.response?.status);
        }
      }

      return true;
    } catch (error) {
      console.log('❌ Input validation test failed:', error.response?.data || error.message);
      return false;
    }
  }

  async runAllTests() {
    console.log('🚀 Starting Comprehensive Admin Functionality Test');
    console.log('📡 Backend URL:', this.baseUrl);
    console.log('👤 Admin User:', this.adminUser.username);
    console.log('⏰ Test started at:', new Date().toISOString());
    console.log('═'.repeat(60));

    const startTime = Date.now();
    
    // Login first
    const loginSuccess = await this.login();
    if (!loginSuccess) {
      console.log('\n❌ Cannot proceed without admin login');
      process.exit(1);
    }

    const tests = [
      { name: 'Health Endpoint', test: () => this.testHealthEndpoint() },
      { name: 'Admin Dashboard', test: () => this.testAdminDashboard() },
      { name: 'User Management', test: () => this.testUserManagement() },
      { name: 'Analytics Endpoints', test: () => this.testAnalytics() },
      { name: 'System Health', test: () => this.testSystemHealth() },
      { name: 'User Analytics', test: () => this.testUserAnalytics() },
      { name: 'Admin Security', test: () => this.testAdminSecurity() },
      { name: 'Input Validation', test: () => this.testInputValidation() }
    ];

    let passedTests = 0;
    const results = [];

    for (const testCase of tests) {
      try {
        const result = await testCase.test();
        results.push({ name: testCase.name, passed: result });
        if (result) passedTests++;
      } catch (error) {
        console.log(`❌ ${testCase.name} crashed:`, error.message);
        results.push({ name: testCase.name, passed: false });
      }
    }

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    console.log('\n' + '═'.repeat(60));
    console.log('📊 COMPREHENSIVE ADMIN TEST RESULTS');
    console.log('═'.repeat(60));

    results.forEach(result => {
      const status = result.passed ? '✅ PASS' : '❌ FAIL';
      console.log(`${status} - ${result.name}`);
    });

    console.log('\n📈 Summary:');
    console.log(`✅ Passed: ${passedTests}/${tests.length} tests`);
    console.log(`⏱️ Duration: ${duration} seconds`);
    
    if (passedTests === tests.length) {
      console.log('\n🎉 ALL ADMIN FUNCTIONALITY TESTS PASSED!');
      console.log('🎯 The admin user management system is fully functional and ready for production use.');
    } else {
      console.log(`\n⚠️ ${tests.length - passedTests} test(s) failed. Please review the failed tests above.`);
    }

    console.log('\n🏁 Admin functionality test completed successfully!');
    process.exit(passedTests === tests.length ? 0 : 1);
  }
}

// Run the tests if this script is executed directly
if (require.main === module) {
  const tester = new AdminTester();
  tester.runAllTests().catch(error => {
    console.error('💥 Test suite crashed:', error);
    process.exit(1);
  });
}

module.exports = AdminTester;
