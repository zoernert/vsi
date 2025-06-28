#!/usr/bin/env node

const { QdrantClient } = require('@qdrant/js-client-rest');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

/**
 * Test script to check Qdrant's clustering capabilities
 * This will help us understand what cluster features are available
 * for implementing named clusters in our VSI Vector Store
 */

class QdrantClusterTester {
    constructor() {
        this.client = new QdrantClient({
            url: process.env.QDRANT_URL || 'http://localhost:6333',
            apiKey: process.env.QDRANT_API_KEY || undefined,
        });
        
        this.testCollectionName = `cluster_test_${Date.now()}`;
        this.testResults = {
            qdrantVersion: null,
            clusterInfo: null,
            namedClustersSupported: false,
            shardingSupported: false,
            replicationSupported: false,
            availableFeatures: [],
            errors: []
        };
        
        console.log('🔍 Qdrant Cluster Feature Test');
        console.log('================================');
        console.log(`📡 Qdrant URL: ${process.env.QDRANT_URL || 'http://localhost:6333'}`);
        console.log(`🔑 API Key: ${process.env.QDRANT_API_KEY ? 'Set' : 'Not set'}`);
        console.log('');
    }

    async testQdrantHealth() {
        console.log('1️⃣ Testing Qdrant Connection...');
        try {
            // Test basic connectivity
            const collections = await this.client.getCollections();
            console.log(`✅ Connection successful`);
            console.log(`📊 Existing collections: ${collections.collections?.length || 0}`);
            
            return true;
        } catch (error) {
            console.error(`❌ Connection failed: ${error.message}`);
            this.testResults.errors.push(`Connection: ${error.message}`);
            return false;
        }
    }

    async getQdrantVersion() {
        console.log('\n2️⃣ Getting Qdrant Version Info...');
        try {
            // Try to get cluster info which might include version
            const response = await fetch(`${this.client.url}/cluster`, {
                headers: this.client.apiKey ? { 'api-key': this.client.apiKey } : {}
            });
            
            if (response.ok) {
                const clusterInfo = await response.json();
                this.testResults.clusterInfo = clusterInfo;
                console.log(`✅ Cluster API accessible`);
                console.log(`📋 Cluster info:`, JSON.stringify(clusterInfo, null, 2));
            } else {
                console.log(`⚠️ Cluster API returned status: ${response.status}`);
            }
            
            // Try to get version from root endpoint
            const versionResponse = await fetch(`${this.client.url}/`, {
                headers: this.client.apiKey ? { 'api-key': this.client.apiKey } : {}
            });
            
            if (versionResponse.ok) {
                const versionInfo = await versionResponse.json();
                this.testResults.qdrantVersion = versionInfo;
                console.log(`📝 Version info:`, JSON.stringify(versionInfo, null, 2));
            }
            
        } catch (error) {
            console.log(`⚠️ Could not retrieve version info: ${error.message}`);
            this.testResults.errors.push(`Version info: ${error.message}`);
        }
    }

    async testCollectionCreationWithClustering() {
        console.log('\n3️⃣ Testing Collection Creation with Clustering Options...');
        
        try {
            // Test basic collection creation first
            console.log(`📁 Creating test collection: ${this.testCollectionName}`);
            
            const basicConfig = {
                vectors: {
                    size: 768,
                    distance: 'Cosine'
                }
            };
            
            await this.client.createCollection(this.testCollectionName, basicConfig);
            console.log(`✅ Basic collection created successfully`);
            
            // Now test advanced clustering options
            await this.testShardingOptions();
            await this.testReplicationOptions();
            await this.testClusterAliases();
            
        } catch (error) {
            console.error(`❌ Collection creation failed: ${error.message}`);
            this.testResults.errors.push(`Collection creation: ${error.message}`);
        }
    }

    async testShardingOptions() {
        console.log('\n4️⃣ Testing Sharding Options...');
        
        const shardedCollectionName = `${this.testCollectionName}_sharded`;
        
        try {
            // Test sharding configuration
            const shardedConfig = {
                vectors: {
                    size: 768,
                    distance: 'Cosine'
                },
                shard_number: 2,
                replication_factor: 1
            };
            
            await this.client.createCollection(shardedCollectionName, shardedConfig);
            console.log(`✅ Sharded collection created successfully`);
            this.testResults.shardingSupported = true;
            this.testResults.availableFeatures.push('sharding');
            
            // Get collection info to verify sharding
            const info = await this.client.getCollection(shardedCollectionName);
            console.log(`📊 Sharded collection info:`, JSON.stringify(info, null, 2));
            
        } catch (error) {
            console.log(`⚠️ Sharding not supported or failed: ${error.message}`);
            this.testResults.errors.push(`Sharding: ${error.message}`);
        }
    }

    async testReplicationOptions() {
        console.log('\n5️⃣ Testing Replication Options...');
        
        const replicatedCollectionName = `${this.testCollectionName}_replicated`;
        
        try {
            // Test replication configuration
            const replicatedConfig = {
                vectors: {
                    size: 768,
                    distance: 'Cosine'
                },
                replication_factor: 2,
                write_consistency_factor: 1
            };
            
            await this.client.createCollection(replicatedCollectionName, replicatedConfig);
            console.log(`✅ Replicated collection created successfully`);
            this.testResults.replicationSupported = true;
            this.testResults.availableFeatures.push('replication');
            
        } catch (error) {
            console.log(`⚠️ Replication not supported or failed: ${error.message}`);
            this.testResults.errors.push(`Replication: ${error.message}`);
        }
    }

    async testClusterAliases() {
        console.log('\n6️⃣ Testing Collection Aliases (Named Clusters)...');
        
        try {
            const aliasName = `cluster_alias_${Date.now()}`;
            
            // Test creating an alias for the collection
            const aliasResponse = await fetch(`${this.client.url}/collections/aliases`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(this.client.apiKey ? { 'api-key': this.client.apiKey } : {})
                },
                body: JSON.stringify({
                    actions: [
                        {
                            create_alias: {
                                alias_name: aliasName,
                                collection_name: this.testCollectionName
                            }
                        }
                    ]
                })
            });
            
            if (aliasResponse.ok) {
                console.log(`✅ Collection alias created successfully: ${aliasName}`);
                this.testResults.namedClustersSupported = true;
                this.testResults.availableFeatures.push('aliases');
                
                // Test using the alias
                const aliasInfo = await this.client.getCollection(aliasName);
                console.log(`📊 Alias collection info:`, JSON.stringify(aliasInfo, null, 2));
                
                // Clean up alias
                const deleteAliasResponse = await fetch(`${this.client.url}/collections/aliases`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(this.client.apiKey ? { 'api-key': this.client.apiKey } : {})
                    },
                    body: JSON.stringify({
                        actions: [
                            {
                                delete_alias: {
                                    alias_name: aliasName
                                }
                            }
                        ]
                    })
                });
                
                if (deleteAliasResponse.ok) {
                    console.log(`🧹 Alias cleaned up successfully`);
                }
                
            } else {
                const errorText = await aliasResponse.text();
                console.log(`⚠️ Alias creation failed: ${aliasResponse.status} - ${errorText}`);
                this.testResults.errors.push(`Aliases: ${aliasResponse.status} - ${errorText}`);
            }
            
        } catch (error) {
            console.log(`⚠️ Alias testing failed: ${error.message}`);
            this.testResults.errors.push(`Aliases: ${error.message}`);
        }
    }

    async testCollectionClusters() {
        console.log('\n7️⃣ Testing Collection Cluster Management...');
        
        try {
            // Test cluster management endpoints
            const clusterResponse = await fetch(`${this.client.url}/cluster`, {
                headers: this.client.apiKey ? { 'api-key': this.client.apiKey } : {}
            });
            
            if (clusterResponse.ok) {
                const clusterData = await clusterResponse.json();
                console.log(`📊 Cluster data:`, JSON.stringify(clusterData, null, 2));
                
                // Test collection distribution in cluster
                const collectionClusterResponse = await fetch(`${this.client.url}/collections/${this.testCollectionName}/cluster`, {
                    headers: this.client.apiKey ? { 'api-key': this.client.apiKey } : {}
                });
                
                if (collectionClusterResponse.ok) {
                    const collectionClusterData = await collectionClusterResponse.json();
                    console.log(`📊 Collection cluster data:`, JSON.stringify(collectionClusterData, null, 2));
                    this.testResults.availableFeatures.push('collection_cluster_info');
                } else {
                    console.log(`⚠️ Collection cluster info not available: ${collectionClusterResponse.status}`);
                }
                
            } else {
                console.log(`⚠️ Cluster endpoint not accessible: ${clusterResponse.status}`);
            }
            
        } catch (error) {
            console.log(`⚠️ Cluster management testing failed: ${error.message}`);
            this.testResults.errors.push(`Cluster management: ${error.message}`);
        }
    }

    async testNamedClusterCreation() {
        console.log('\n8️⃣ Testing Named Cluster Creation Patterns...');
        
        // Test different patterns for creating "named clusters"
        const patterns = [
            { name: 'prefix_pattern', collection: `cluster_main_${this.testCollectionName}` },
            { name: 'namespace_pattern', collection: `namespace__cluster1__${this.testCollectionName}` },
            { name: 'tag_pattern', collection: this.testCollectionName } // with metadata tags
        ];
        
        for (const pattern of patterns) {
            try {
                console.log(`\n🔬 Testing ${pattern.name}...`);
                
                if (pattern.name === 'tag_pattern') {
                    // Test using collection metadata for clustering
                    const updateResponse = await fetch(`${this.client.url}/collections/${this.testCollectionName}`, {
                        method: 'PATCH',
                        headers: {
                            'Content-Type': 'application/json',
                            ...(this.client.apiKey ? { 'api-key': this.client.apiKey } : {})
                        },
                        body: JSON.stringify({
                            collection_metadata: {
                                cluster_name: 'main_cluster',
                                cluster_type: 'user_documents',
                                cluster_priority: 'high'
                            }
                        })
                    });
                    
                    if (updateResponse.ok) {
                        console.log(`✅ Collection metadata updated for clustering`);
                        this.testResults.availableFeatures.push('metadata_clustering');
                    } else {
                        console.log(`⚠️ Metadata update failed: ${updateResponse.status}`);
                    }
                } else {
                    // Test creating collections with cluster naming patterns
                    const config = {
                        vectors: {
                            size: 768,
                            distance: 'Cosine'
                        }
                    };
                    
                    await this.client.createCollection(pattern.collection, config);
                    console.log(`✅ Created collection with ${pattern.name}: ${pattern.collection}`);
                    this.testResults.availableFeatures.push(pattern.name);
                }
                
            } catch (error) {
                console.log(`⚠️ ${pattern.name} failed: ${error.message}`);
                this.testResults.errors.push(`${pattern.name}: ${error.message}`);
            }
        }
    }

    async cleanup() {
        console.log('\n🧹 Cleaning up test collections...');
        
        try {
            const collections = await this.client.getCollections();
            const testCollections = collections.collections?.filter(col => 
                col.name.includes('cluster_test_') || 
                col.name.includes(this.testCollectionName)
            ) || [];
            
            for (const collection of testCollections) {
                try {
                    await this.client.deleteCollection(collection.name);
                    console.log(`🗑️ Deleted: ${collection.name}`);
                } catch (error) {
                    console.log(`⚠️ Failed to delete ${collection.name}: ${error.message}`);
                }
            }
            
            console.log(`✅ Cleanup completed`);
            
        } catch (error) {
            console.log(`⚠️ Cleanup failed: ${error.message}`);
        }
    }

    printResults() {
        console.log('\n' + '='.repeat(60));
        console.log('📊 QDRANT CLUSTER TESTING RESULTS');
        console.log('='.repeat(60));
        
        console.log(`\n🔧 Qdrant Version Info:`);
        if (this.testResults.qdrantVersion) {
            console.log(JSON.stringify(this.testResults.qdrantVersion, null, 2));
        } else {
            console.log('   Not available');
        }
        
        console.log(`\n🌐 Cluster Info:`);
        if (this.testResults.clusterInfo) {
            console.log(JSON.stringify(this.testResults.clusterInfo, null, 2));
        } else {
            console.log('   Not available');
        }
        
        console.log(`\n✅ Supported Features:`);
        console.log(`   📋 Named Clusters (Aliases): ${this.testResults.namedClustersSupported ? 'YES' : 'NO'}`);
        console.log(`   🔀 Sharding: ${this.testResults.shardingSupported ? 'YES' : 'NO'}`);
        console.log(`   📊 Replication: ${this.testResults.replicationSupported ? 'YES' : 'NO'}`);
        
        if (this.testResults.availableFeatures.length > 0) {
            console.log(`\n🎯 Available Features:`);
            this.testResults.availableFeatures.forEach(feature => {
                console.log(`   ✓ ${feature}`);
            });
        }
        
        if (this.testResults.errors.length > 0) {
            console.log(`\n❌ Errors Encountered:`);
            this.testResults.errors.forEach(error => {
                console.log(`   × ${error}`);
            });
        }
        
        console.log('\n💡 Implementation Recommendations:');
        
        if (this.testResults.namedClustersSupported) {
            console.log('   ✓ Use Qdrant aliases for named clusters');
            console.log('   ✓ Implement cluster management via alias operations');
        }
        
        if (this.testResults.shardingSupported) {
            console.log('   ✓ Consider sharding for large collections');
            console.log('   ✓ Implement shard_number configuration in collection creation');
        }
        
        if (this.testResults.availableFeatures.includes('metadata_clustering')) {
            console.log('   ✓ Use collection metadata for logical clustering');
            console.log('   ✓ Implement cluster tags and categorization');
        }
        
        if (this.testResults.availableFeatures.includes('prefix_pattern')) {
            console.log('   ✓ Use naming conventions for cluster organization');
            console.log('   ✓ Implement cluster prefix filtering in collection lists');
        }
        
        console.log('\n🚀 Next Steps for VSI Vector Store:');
        console.log('   1. Choose primary clustering strategy based on available features');
        console.log('   2. Implement cluster management UI/API layer');
        console.log('   3. Add cluster-aware search and filtering');
        console.log('   4. Consider performance implications of chosen approach');
        
        console.log('='.repeat(60));
    }

    async run() {
        try {
            const isConnected = await this.testQdrantHealth();
            if (!isConnected) {
                console.error('❌ Cannot proceed without Qdrant connection');
                return;
            }
            
            await this.getQdrantVersion();
            await this.testCollectionCreationWithClustering();
            await this.testCollectionClusters();
            await this.testNamedClusterCreation();
            
        } catch (error) {
            console.error(`❌ Test execution failed: ${error.message}`);
            this.testResults.errors.push(`Execution: ${error.message}`);
        } finally {
            await this.cleanup();
            this.printResults();
        }
    }
}

// Run the test
if (require.main === module) {
    const tester = new QdrantClusterTester();
    tester.run().catch(console.error);
}

module.exports = QdrantClusterTester;